import { NextRequest, NextResponse } from 'next/server';
import { findTask } from '@/lib/tasks/store';
import { generateMeetingProtocolDocx } from '@/lib/export/word';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return NextResponse.json({ error: 'Параметр taskId обязателен' }, { status: 400 });
    }

    const task = findTask(taskId);
    if (!task) {
      return NextResponse.json({ error: 'Задача не найдена' }, { status: 404 });
    }

    const text = task.protocolText || task.normalizedText || task.rawText || '';
    if (!text.trim()) {
      return NextResponse.json({ error: 'Текст протокола отсутствует' }, { status: 400 });
    }

    const blob = await generateMeetingProtocolDocx({
      protocolText: text,
      fileName: task.fileName || 'Протокол_совещания',
      meetingDate: task.createdAt,
      taskId: task.id,
      documentType: task.protocolText ? 'protocol' : 'normalized',
    });

    const buffer = Buffer.from(await blob.arrayBuffer());
    const baseName = (task.fileName || 'meeting_protocol').replace(/\.[^/.]+$/, '');
    const asciiSafeName = encodeURIComponent(`${baseName}_протокол.docx`);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document; charset=utf-8',
        'Content-Disposition': `attachment; filename="${asciiSafeName}"; filename*=UTF-8''${asciiSafeName}`,
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Ошибка экспорта в Word: ${message}` }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { protocolText, fileName, taskId, meetingDate, documentType } = body;

    if (!protocolText || typeof protocolText !== 'string') {
      return NextResponse.json({ error: 'Поле protocolText обязательно' }, { status: 400 });
    }

    const blob = await generateMeetingProtocolDocx({
      protocolText,
      fileName: fileName || 'Протокол_совещания',
      meetingDate: meetingDate || Date.now(),
      taskId,
      documentType: documentType || 'protocol',
    });

    const buffer = Buffer.from(await blob.arrayBuffer());
    const baseName = (fileName || 'meeting_protocol').replace(/\.[^/.]+$/, '');
    const asciiSafeName = encodeURIComponent(`${baseName}_протокол.docx`);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document; charset=utf-8',
        'Content-Disposition': `attachment; filename="${asciiSafeName}"; filename*=UTF-8''${asciiSafeName}`,
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Ошибка экспорта в Word: ${message}` }, { status: 500 });
  }
}
