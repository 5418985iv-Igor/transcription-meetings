import { NextRequest, NextResponse } from 'next/server';
import { transcriptionService } from '@/lib/transcription/fastapi-provider';
import { saveTask, getAllTasks, findTask, linkTasks } from '@/lib/tasks/store';
import { startBackgroundPoller } from '@/lib/tasks/coordinator';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const clientTaskId = (formData.get('clientTaskId') as string) || undefined;

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: 'Необходимо предоставить аудиофайл для обработки' },
        { status: 400 }
      );
    }

    const fileName = (file as { name?: string }).name || 'meeting_recording.m4a';
    const mimeType = file.type || 'audio/m4a';
    const fileSize = file.size;

    // Check maximum payload limit for stable cloud proxy handling
    const MAX_ALLOWED_SIZE = 30 * 1024 * 1024; // 30 MB
    if (fileSize > MAX_ALLOWED_SIZE) {
      return NextResponse.json(
        {
          error: `Размер аудиофайла (${(fileSize / (1024 * 1024)).toFixed(1)} МБ) превышает лимит сервера (30 МБ). Рекомендуется сжать аудио или выбрать формат M4A/MP3.`,
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

    // Call external FastAPI server directly with the Blob (no redundant in-memory buffer duplication)
    const { taskId } = await transcriptionService.createTask(file, fileName, mimeType);

    // Register real task in local task store
    saveTask({
      id: taskId,
      clientTaskId,
      status: 'transcribing',
      fastApiStatus: 'queued',
      fileName,
      fileSize,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      stepMessage: 'Аудиофайл передан на сервис распознавания речи (GigaSTT)...',
    });

    if (clientTaskId) {
      linkTasks(clientTaskId, taskId);
    }

    // Start server-side background poller so processing continues even if client disconnects
    startBackgroundPoller(taskId);

    // Return taskId immediately without keeping connection open
    return NextResponse.json({
      success: true,
      taskId,
      clientTaskId,
      status: 'transcribing',
      fileName,
      fileSize,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
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
