import { ITranscriptionService, TranscriptionTaskResult, HealthCheckResult } from './types';

export class FastApiTranscriptionService implements ITranscriptionService {
  getBaseUrl(): string {
    return process.env.FASTAPI_API_URL?.trim() || 'http://157.22.175.215:8000';
  }

  async createTask(
    fileData: Buffer | Blob | Uint8Array,
    filename: string,
    mimeType: string = 'audio/m4a'
  ): Promise<{ taskId: string }> {
    const baseUrl = this.getBaseUrl().replace(/\/+$/, '');
    const uploadUrl = `${baseUrl}/v1/audio/transcriptions`;

    // Construct FormData with Blob without unnecessary re-allocations
    const formData = new FormData();
    const blob =
      fileData instanceof Blob
        ? fileData
        : new Blob([new Uint8Array(fileData)], { type: mimeType });
    formData.append('file', blob, filename || 'meeting-audio.m4a');
    formData.append('model', 'whisper-1');
    formData.append('language', 'ru');

    try {
      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
        headers: {
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(120000), // 120s timeout for audio uploads
      });

      const responseText = await response.text();

      if (!response.ok) {
        if (
          responseText.trim().toLowerCase().startsWith('<!doctype') ||
          responseText.includes('<html')
        ) {
          if (response.status === 413) {
            throw new Error(
              'Размер аудиофайла превысил лимит сервера распознавания речи (413 Payload Too Large). Пожалуйста, используйте запись до 100 МБ.'
            );
          }
          if (response.status === 502 || response.status === 504) {
            throw new Error(
              `Сервер транскрибации временно недоступен или перезагружается (${response.status} Bad Gateway).`
            );
          }
          throw new Error(`Сервер транскрибации вернул HTML-страницу ошибки (${response.status}).`);
        }
        throw new Error(
          `Ошибка сервера транскрибации (${response.status}): ${responseText || response.statusText}`
        );
      }

      let data: Record<string, unknown>;
      try {
        data = JSON.parse(responseText);
      } catch {
        if (
          responseText.trim().toLowerCase().startsWith('<!doctype') ||
          responseText.includes('<html')
        ) {
          throw new Error(
            'Сервер транскрибации вернул HTML-страницу вместо данных JSON. Возможно, на сервере сработал прокси-шлюз.'
          );
        }
        throw new Error(`Некорректный ответ сервера транскрибации: ${responseText.slice(0, 150)}`);
      }

      const taskId = data.task_id || data.taskId || data.id;

      if (!taskId) {
        throw new Error('Сервер транскрибации не вернул идентификатор задачи (task_id)');
      }

      return { taskId: String(taskId) };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Ошибка отправки аудио на распознавание: ${message}`);
    }
  }

  async getTaskStatus(taskId: string): Promise<TranscriptionTaskResult> {
    if (!taskId || taskId.startsWith('temp_')) {
      return {
        status: 'failed',
        error: `Идентификатор "${taskId}" является временным маркером клиента, а не задачей на сервере распознавания речи.`,
      };
    }

    const baseUrl = this.getBaseUrl().replace(/\/+$/, '');
    const taskUrl = `${baseUrl}/v1/tasks/${encodeURIComponent(taskId)}`;

    try {
      const response = await fetch(taskUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(15000),
      });

      const responseText = await response.text();

      if (!response.ok) {
        if (response.status === 404) {
          return {
            status: 'failed',
            error: `Задача транскрибации (${taskId}) не найдена на сервере GigaSTT (возможно, сервер был перезапущен или время хранения задачи истекло).`,
          };
        }
        if (
          responseText.trim().toLowerCase().startsWith('<!doctype') ||
          responseText.includes('<html')
        ) {
          throw new Error(`Сервер вернул HTML-ошибку (${response.status}) при проверке статуса.`);
        }
        throw new Error(`HTTP ${response.status}: ${responseText || response.statusText}`);
      }

      let data: Record<string, unknown>;
      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(
          `Некорректный JSON при проверке статуса задачи: ${responseText.slice(0, 100)}`
        );
      }

      const rawStatus = String(data.status || '').toLowerCase();

      let mappedStatus: TranscriptionTaskResult['status'] = 'processing';
      if (rawStatus === 'queued' || rawStatus === 'pending') {
        mappedStatus = 'queued';
      } else if (rawStatus === 'completed' || rawStatus === 'success' || rawStatus === 'done') {
        mappedStatus = 'completed';
      } else if (rawStatus === 'failed' || rawStatus === 'error') {
        mappedStatus = 'failed';
      }

      return {
        status: mappedStatus,
        text: typeof data.text === 'string' ? data.text : undefined,
        error: typeof data.error === 'string' ? data.error : undefined,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        status: 'failed',
        error: `Не удалось проверить статус задачи: ${message}`,
      };
    }
  }

  async checkHealth(): Promise<HealthCheckResult> {
    const baseUrl = this.getBaseUrl().replace(/\/+$/, '');
    const healthUrl = `${baseUrl}/health`;
    const endpoints = {
      health: `${baseUrl}/health`,
      transcriptions: `${baseUrl}/v1/audio/transcriptions`,
      tasks: `${baseUrl}/v1/tasks/{task_id}`,
    };

    const startTime = Date.now();
    try {
      const res = await fetch(healthUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(6000),
      });

      const latencyMs = Date.now() - startTime;
      const text = await res.text();

      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }

      const isStatusOk = res.ok && (data.status === 'ok' || data.status === 'OK');

      return {
        ok: isStatusOk,
        url: healthUrl,
        statusCode: res.status,
        latencyMs,
        data,
        message: isStatusOk
          ? `Сервер доступен (HTTP ${res.status}, ответ: ${JSON.stringify(data)})`
          : `Сервер вернул статус HTTP ${res.status}: ${text.slice(0, 100)}`,
        endpoints,
      };
    } catch (err: unknown) {
      const latencyMs = Date.now() - startTime;
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        url: healthUrl,
        latencyMs,
        message: `Не удалось связаться с сервером распознавания речи: ${message}`,
        endpoints,
      };
    }
  }
}

// Export singleton instance conforming to ITranscriptionService
export const transcriptionService: ITranscriptionService = new FastApiTranscriptionService();
