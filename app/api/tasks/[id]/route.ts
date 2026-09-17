import { NextRequest, NextResponse } from 'next/server';
import { getTask, saveTask, updateTask, deleteTask, findTask, linkTasks } from '@/lib/tasks/store';
import { transcriptionService } from '@/lib/transcription/fastapi-provider';
import { runAiPipeline, startBackgroundPoller } from '@/lib/tasks/coordinator';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawTaskId } = await params;
    if (!rawTaskId) {
      return NextResponse.json({ error: 'Идентификатор задачи не указан' }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const isResume = searchParams.get('resume') === 'true';
    const clientFileName = searchParams.get('fileName');

    // Auto-resolve temp_ ID or clientTaskId to real task if available
    let task = findTask(rawTaskId);

    // If client requested a temp_ ID that couldn't be resolved:
    if (!task && rawTaskId.startsWith('temp_')) {
      return NextResponse.json(
        {
          error: `Временный ID (${rawTaskId}) не найден на сервере. Связь была прервана во время отправки файла. Если у вас есть ID задачи с сервера, введите его через «По ID задачи».`,
          isTempId: true,
        },
        { status: 404 }
      );
    }

    // If real task not in memory/disk (e.g. created on another device or manual recovery by UUID)
    if (!task) {
      task = {
        id: rawTaskId,
        status: 'transcribing',
        fileName: clientFileName || 'Аудиозапись',
        fileSize: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        stepMessage: 'Возобновление проверки состояния задачи на сервере...',
      };
      saveTask(task);
      startBackgroundPoller(rawTaskId);
    }

    const actualTaskId = task.id;

    // Ensure background poller is running on the server for active tasks
    if (task.status === 'transcribing') {
      startBackgroundPoller(actualTaskId);
    }

    // If task has rawText and is in error or stuck, and user requested resume:
    if (
      isResume &&
      task.rawText &&
      (task.status === 'error' || task.status === 'normalizing' || task.status === 'summarizing')
    ) {
      const raw = task.rawText;
      const updated = updateTask(actualTaskId, {
        status: 'normalizing',
        error: undefined,
        stepMessage: 'Возобновление цепочки обработки: нормализация текста через нейросеть...',
      });
      if (updated) task = updated;
      void runAiPipeline(actualTaskId, raw);
      return NextResponse.json({
        task,
        redirectedFrom: rawTaskId !== actualTaskId ? rawTaskId : undefined,
      });
    }

    // If in transcribing stage, OR resuming an errored task that hasn't received rawText yet:
    const shouldCheckFastApi =
      !actualTaskId.startsWith('temp_') &&
      (task.status === 'transcribing' || (isResume && !task.rawText));

    if (shouldCheckFastApi) {
      try {
        const fastApiResult = await transcriptionService.getTaskStatus(actualTaskId);

        if (fastApiResult.status === 'queued' || fastApiResult.status === 'processing') {
          const updated = updateTask(actualTaskId, {
            status: 'transcribing',
            fastApiStatus: fastApiResult.status,
            error: undefined,
            stepMessage:
              fastApiResult.status === 'queued'
                ? 'Очередь распознавания GigaSTT...'
                : 'Выполняется распознавание речи моделью GigaAM-v3...',
          });
          if (updated) task = updated;
        } else if (fastApiResult.status === 'failed') {
          const updated = updateTask(actualTaskId, {
            status: 'error',
            fastApiStatus: 'failed',
            error: fastApiResult.error || 'Ошибка распознавания речи на сервере GigaSTT',
            stepMessage: 'Сбой при распознавании речи',
          });
          if (updated) task = updated;
        } else if (fastApiResult.status === 'completed') {
          const rawText = fastApiResult.text?.trim() || '';
          if (!rawText) {
            const updated = updateTask(actualTaskId, {
              status: 'error',
              fastApiStatus: 'completed',
              rawText: '',
              error: 'В аудиозаписи не удалось распознать речь (пустая стенограмма).',
              stepMessage: 'Речь не обнаружена',
            });
            if (updated) task = updated;
          } else {
            // GigaSTT completed! Update with rawText and launch OpenAI normalization & protocol
            const updated = updateTask(actualTaskId, {
              fastApiStatus: 'completed',
              rawText,
              status: 'normalizing',
              error: undefined,
              stepMessage: 'Транскрибация завершена. Запуск нормализации текста...',
            });
            if (updated) task = updated;

            // Kick off OpenAI normalization & protocol pipeline
            void runAiPipeline(actualTaskId, rawText);
          }
        }
      } catch (checkErr: unknown) {
        const msg = checkErr instanceof Error ? checkErr.message : String(checkErr);
        console.warn(`[TaskPoll] Warning querying FastAPI for task ${actualTaskId}:`, msg);
      }
    }

    return NextResponse.json({
      task,
      redirectedFrom: rawTaskId !== actualTaskId ? rawTaskId : undefined,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Ошибка при проверке статуса задачи: ${message}` },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawTaskId } = await params;
    if (!rawTaskId) {
      return NextResponse.json({ error: 'Идентификатор задачи не указан' }, { status: 400 });
    }

    let body: { fileName?: string; linkWithTaskId?: string } = {};
    try {
      body = await req.json();
    } catch {
      // empty body ok
    }

    // Support explicitly linking a temp ID to a real FastAPI task ID
    if (body.linkWithTaskId && body.linkWithTaskId.trim()) {
      const realId = body.linkWithTaskId.trim();
      const linked = linkTasks(rawTaskId, realId);
      if (linked) {
        startBackgroundPoller(realId);
        return NextResponse.json({ success: true, task: linked, redirectedFrom: rawTaskId });
      }
    }

    let task = findTask(rawTaskId);
    if (!task) {
      if (rawTaskId.startsWith('temp_')) {
        return NextResponse.json(
          {
            error: `Временный ID (${rawTaskId}) не найден. Укажите реальный ID задачи на сервере через функцию «По ID задачи».`,
            isTempId: true,
          },
          { status: 404 }
        );
      }

      task = {
        id: rawTaskId,
        status: 'transcribing',
        fileName: body.fileName || 'Восстановленная аудиозапись',
        fileSize: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        stepMessage: 'Возобновление проверки состояния задачи...',
      };
      saveTask(task);
    }

    const actualTaskId = task.id;
    startBackgroundPoller(actualTaskId);

    // Case 1: Raw text already exists, restart AI pipeline
    if (task.rawText) {
      const raw = task.rawText;
      const updated = updateTask(actualTaskId, {
        status: 'normalizing',
        error: undefined,
        stepMessage: 'Повторный запуск нормализации и составления протокола...',
      });
      if (updated) task = updated;
      void runAiPipeline(actualTaskId, raw);
      return NextResponse.json({
        success: true,
        task,
        redirectedFrom: rawTaskId !== actualTaskId ? rawTaskId : undefined,
      });
    }

    // Case 2: Query FastAPI backend to check current progress
    const updatedPending = updateTask(actualTaskId, {
      status: 'transcribing',
      error: undefined,
      stepMessage: 'Возобновление опроса сервера транскрибации GigaSTT...',
    });
    if (updatedPending) task = updatedPending;

    try {
      const fastApiResult = await transcriptionService.getTaskStatus(actualTaskId);
      if (fastApiResult.status === 'completed') {
        const rawText = fastApiResult.text?.trim() || '';
        if (rawText) {
          const updatedDone = updateTask(actualTaskId, {
            fastApiStatus: 'completed',
            rawText,
            status: 'normalizing',
            error: undefined,
            stepMessage: 'Стенограмма получена! Запуск формирования протокола...',
          });
          if (updatedDone) task = updatedDone;
          void runAiPipeline(actualTaskId, rawText);
        } else {
          const updatedEmpty = updateTask(actualTaskId, {
            status: 'error',
            error: 'В аудиозаписи не удалось распознать речь.',
          });
          if (updatedEmpty) task = updatedEmpty;
        }
      } else if (fastApiResult.status === 'failed') {
        const updatedFailed = updateTask(actualTaskId, {
          status: 'error',
          fastApiStatus: 'failed',
          error: fastApiResult.error || 'Ошибка транскрибации на сервере',
        });
        if (updatedFailed) task = updatedFailed;
      } else {
        const updatedStatus = updateTask(actualTaskId, {
          fastApiStatus: fastApiResult.status,
          stepMessage: 'Сервер продолжает обработку аудиозаписи...',
        });
        if (updatedStatus) task = updatedStatus;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[TaskResume] Note: could not query FastAPI immediately: ${msg}`);
    }

    return NextResponse.json({
      success: true,
      task,
      redirectedFrom: rawTaskId !== actualTaskId ? rawTaskId : undefined,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Ошибка при возобновлении задачи: ${message}` },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;
    if (!taskId) {
      return NextResponse.json({ error: 'Идентификатор задачи не указан' }, { status: 400 });
    }

    const deleted = deleteTask(taskId);
    return NextResponse.json({ success: deleted });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Ошибка при удалении задачи: ${message}` },
      { status: 500 }
    );
  }
}

