import { NextRequest, NextResponse } from 'next/server';
import { transcriptionService } from '@/lib/transcription/fastapi-provider';
import { saveTask, getAllTasks, findTask, linkTasks, updateTask } from '@/lib/tasks/store';
import { startBackgroundPoller, runAiPipeline } from '@/lib/tasks/coordinator';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Allow up to 5 minutes for uploading large audio files

export async function POST(req: NextRequest) {
  let currentClientTaskId: string | undefined = undefined;
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const clientTaskId = (formData.get('clientTaskId') as string) || undefined;
    currentClientTaskId = clientTaskId;

    if (!file || !(file instanceof Blob) || file.size === 0) {
      return NextResponse.json(
        { error: 'Предоставленный аудиофайл пуст (0 байт). Пожалуйста, выберите корректную аудиозапись.' },
        { status: 400 }
      );
    }

    const fileName = (file as { name?: string }).name || 'meeting_recording.m4a';
    const mimeType = file.type || 'audio/m4a';
    const fileSize = file.size;

    // Check maximum payload limit for stable cloud proxy handling
    const MAX_ALLOWED_SIZE = 100 * 1024 * 1024; // 100 MB
    if (fileSize > MAX_ALLOWED_SIZE) {
      return NextResponse.json(
        {
          error: `Размер аудиофайла (${(fileSize / (1024 * 1024)).toFixed(1)} МБ) превышает лимит сервера (100 МБ). Рекомендуется сжать аудио или выбрать формат M4A/MP3.`,
        },
        { status: 400 }
      );
    }

    // 1. Immediately register task in local store so client can transition straight to recognition
    if (clientTaskId) {
      saveTask({
        id: clientTaskId,
        clientTaskId,
        status: 'transcribing',
        fileName,
        fileSize,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        stepMessage: 'Аудиозапись принята сервером. Запуск распознавания речи в GigaSTT...',
      });
    }

    // Forward audio file to GigaSTT
    const result = await transcriptionService.createTask(file, fileName, mimeType);
    const taskId = result.taskId;

    // Register real task in local task store
    saveTask({
      id: taskId,
      clientTaskId,
      status: result.text ? 'normalizing' : 'transcribing',
      fastApiStatus: result.text ? 'completed' : 'queued',
      rawText: result.text,
      fileName,
      fileSize,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      stepMessage: result.text
        ? 'Транскрибация получена! Запуск формирования протокола...'
        : 'Аудиофайл передан на сервис распознавания речи (GigaSTT)...',
    });

    if (clientTaskId) {
      linkTasks(clientTaskId, taskId);
    }

    if (result.text) {
      // If GigaSTT responded synchronously with transcript text, immediately launch AI protocol generation
      void runAiPipeline(taskId, result.text);
    } else {
      // Start server-side background poller so processing continues even if client disconnects
      startBackgroundPoller(taskId);
    }

    // Return taskId immediately without keeping connection open
    return NextResponse.json({
      success: true,
      taskId,
      clientTaskId,
      status: result.text ? 'normalizing' : 'transcribing',
      fileName,
      fileSize,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Tasks API Diagnostics] Failed to process audio task submission', {
      stage: 'api_tasks_post',
      clientTaskId: currentClientTaskId,
      error: message,
    });

    if (currentClientTaskId) {
      updateTask(currentClientTaskId, {
        status: 'error',
        error: message,
        stepMessage: 'Сбой при отправке аудио на сервис распознавания речи',
      });
    }

    return NextResponse.json(
      { error: message || 'Внутренняя ошибка при загрузке аудиофайла' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const clientTaskId = searchParams.get('clientTaskId');
  const lookup = searchParams.get('lookup');

  if (clientTaskId || lookup) {
    const idToFind = clientTaskId || lookup || '';
    const task = findTask(idToFind);
    if (task) {
      return NextResponse.json({ task });
    }
  }

  const recent = getAllTasks().slice(0, 100);
  return NextResponse.json({ tasks: recent });
}

export async function DELETE() {
  const { clearAllTasks } = await import('@/lib/tasks/store');
  clearAllTasks();
  return NextResponse.json({ success: true, message: 'История задач очищена' });
}
