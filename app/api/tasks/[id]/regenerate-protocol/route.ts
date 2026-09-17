import { NextRequest, NextResponse } from 'next/server';
import { getTask, findTask, saveTask } from '@/lib/tasks/store';
import { regenerateProtocol } from '@/lib/tasks/coordinator';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await params;
    const taskId = decodeURIComponent(rawId);

    // Read payload from client if sent
    let body: {
      normalizedText?: string;
      rawText?: string;
      fileName?: string;
    } = {};

    try {
      body = await req.json();
    } catch {
      // Body may be empty
    }

    let task = findTask(taskId) || getTask(taskId);

    // Prioritize normalized text from request body (which is in the client state/localStorage),
    // or fallback to the task record in the store
    const normalizedText = (body.normalizedText || task?.normalizedText || '').trim();

    if (!normalizedText) {
      return NextResponse.json(
        { error: 'Нормализованный текст отсутствует. Невозможно сформировать протокол без текста.' },
        { status: 400 }
      );
    }

    // If task was not found in server storage (e.g. server restart / container lifecycle),
    // reconstitute it directly from the client's payload so server storage is updated
    if (!task) {
      task = {
        id: taskId,
        status: 'summarizing',
        fileName: body.fileName || 'Аудиозапись',
        fileSize: 0,
        rawText: body.rawText || '',
        normalizedText: normalizedText,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        stepMessage: 'Формирование протокола нейросетью...',
      };
      saveTask(task);
    } else {
      task.normalizedText = normalizedText;
      if (body.rawText && !task.rawText) task.rawText = body.rawText;
      if (body.fileName) task.fileName = body.fileName;
      saveTask(task);
    }

    // Run ONLY protocol generation with the latest prompt from prompts/meeting_protocol.txt!
    // No GigaSTT, no FastAPI, no speech recognition, no normalization.
    const updatedTask = await regenerateProtocol(task.id, normalizedText);

    return NextResponse.json({ success: true, task: updatedTask });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
