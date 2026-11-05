import { ITranscriptionService, TranscriptionTaskResult, HealthCheckResult } from './types';

export class FastApiTranscriptionService implements ITranscriptionService {
  getBaseUrl(): string {
    return process.env.FASTAPI_API_URL?.trim() || 'http://127.0.0.1:9876';
  }

  async createTask(
    fileData: Buffer | Blob | Uint8Array,
    filename: string,
    mimeType: string = 'audio/m4a'
  ): Promise<{ taskId: string; text?: string }> {
    const baseUrl = this.getBaseUrl().replace(/\/+$/, '');
    const uploadUrl = `${baseUrl}/v1/audio/transcriptions`;

    // 1. Convert input to contiguous in-memory binary buffer to guarantee valid byte payload
    let binaryData: Uint8Array;
    if (fileData instanceof Blob) {
      const arrayBuffer = await fileData.arrayBuffer();
      binaryData = new Uint8Array(arrayBuffer);
    } else if (Buffer.isBuffer(fileData)) {
      binaryData = new Uint8Array(fileData.buffer, fileData.byteOffset, fileData.byteLength);
    } else if (fileData instanceof Uint8Array) {
      binaryData = fileData;
    } else {
      binaryData = new Uint8Array(fileData as ArrayBuffer);
    }

    // 2. Resolve clean audio MIME type and file extension
    let cleanMimeType = mimeType?.trim();
    const lowerName = (filename || '').toLowerCase();
    if (!cleanMimeType || cleanMimeType === 'application/octet-stream') {
      if (lowerName.endsWith('.wav')) cleanMimeType = 'audio/wav';
      else if (lowerName.endsWith('.mp3')) cleanMimeType = 'audio/mpeg';
      else if (lowerName.endsWith('.ogg')) cleanMimeType = 'audio/ogg';
      else if (lowerName.endsWith('.flac')) cleanMimeType = 'audio/flac';
      else if (lowerName.endsWith('.aac')) cleanMimeType = 'audio/aac';
      else if (lowerName.endsWith('.webm')) cleanMimeType = 'audio/webm';
      else cleanMimeType = 'audio/m4a';
    }
    const cleanFileName = filename || (cleanMimeType.includes('wav') ? 'meeting.wav' : 'meeting.m4a');

    // 3. Construct binary Blob for multipart submission
    const audioBlob = new Blob([binaryData as unknown as BlobPart], { type: cleanMimeType });

    // 4. Construct standard FormData.
    // Important: Scalar parameters (model, language) are added first, followed by the binary 'file' field.
    // This conforms to strict multipart stream parsers (such as Axum/multer in GigaSTT).
    const formData = new FormData();
    formData.append('model', 'whisper-1');
    formData.append('language', 'ru');
    formData.append('file', audioBlob, cleanFileName);

    try {
      // NOTE: We do NOT set 'Content-Type: multipart/form-data' header manually.
      // Fetch / FormData automatically calculates the correct boundary and sets:
      // Content-Type: multipart/form-data; boundary=... and the correct Content-Length.
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
        // Safe diagnostic logging: status code, response body, processing stage (no audio data or secrets)
        console.error('[GigaSTT Diagnostics] Failed to create transcription task', {
          stage: 'upload_audio_to_gigastt',
          endpoint: uploadUrl,
          statusCode: response.status,
          statusText: response.statusText,
          responseSnippet: responseText.slice(0, 300),
          fileName: cleanFileName,
          fileSizeBytes: binaryData.byteLength,
          mimeType: cleanMimeType,
        });

        if (response.status === 400) {
          throw new Error(
            `Сервер GigaSTT вернул ошибку HTTP 400 Bad Request: ${
              responseText || 'Неверный формат multipart/form-data запроса'
            }`
          );
        }

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

      let taskId = data.task_id || data.taskId || data.id;
      const directText = typeof data.text === 'string' ? data.text.trim() : undefined;

      // Handle both asynchronous queue (task_id) and synchronous transcription ({ text: "..." })
      if (!taskId) {
        if (directText !== undefined) {
          taskId = `gigastt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        } else {
          throw new Error('Сервер транскрибации не вернул идентификатор задачи (task_id) или текст');
        }
      }

      return { taskId: String(taskId), text: directText };
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
        console.error('[GigaSTT Diagnostics] Failed to query task status', {
          stage: 'get_task_status',
          endpoint: taskUrl,
          taskId,
          statusCode: response.status,
          statusText: response.statusText,
          responseSnippet: responseText.slice(0, 300),
        });

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
