import { NextResponse } from 'next/server';
import { transcriptionService } from '@/lib/transcription/fastapi-provider';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const healthResult = await transcriptionService.checkHealth();
    const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY?.trim());

    return NextResponse.json({
      status: 'ok',
      transcriptionServer: {
        online: healthResult.ok,
        message: healthResult.message || (healthResult.ok ? 'Доступен' : 'Недоступен'),
        url: healthResult.url,
        statusCode: healthResult.statusCode,
        latencyMs: healthResult.latencyMs,
        data: healthResult.data,
        endpoints: healthResult.endpoints,
      },
      aiEngine: {
        configured: hasOpenAiKey,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        status: 'error',
        error: message,
      },
      { status: 500 }
    );
  }
}

