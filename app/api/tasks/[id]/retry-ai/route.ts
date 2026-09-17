import { NextRequest, NextResponse } from 'next/server';
import { getTask, updateTask } from '@/lib/tasks/store';
import { runAiPipeline } from '@/lib/tasks/coordinator';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;
    const task = getTask(taskId);

    if (!task) {
      return NextResponse.json({ error: 'Задача не найдена' }, { status: 404 });
    }

    if (!task.rawText) {
      return NextResponse.json(
        { error: 'Исходная транскрибация еще не получена или пуста' },
        { status: 400 }
      );
    }

    // Reset error, start normalizing
    updateTask(taskId, {
      status: 'normalizing',
      error: undefined,
      stepMessage: 'Повторный запуск нормализации и подготовки протокола...',
    });

    // Run AI pipeline
    void runAiPipeline(taskId, task.rawText);

    return NextResponse.json({ success: true, status: 'normalizing' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
