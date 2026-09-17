export interface TranscriptionTaskResult {
  status: 'queued' | 'processing' | 'completed' | 'failed';
  text?: string;
  error?: string;
}

export interface HealthCheckResult {
  ok: boolean;
  url: string;
  statusCode?: number;
  latencyMs?: number;
  data?: Record<string, unknown>;
  message?: string;
  endpoints?: {
    health: string;
    transcriptions: string;
    tasks: string;
  };
}

export interface ITranscriptionService {
  getBaseUrl(): string;

  /**
   * Submits an audio file for asynchronous transcription.
   * Accepts Buffer, Web Blob, or Uint8Array to avoid redundant memory copies.
   * Returns a task identifier.
   */
  createTask(
    fileData: Buffer | Blob | Uint8Array,
    filename: string,
    mimeType?: string
  ): Promise<{ taskId: string }>;

  /**
   * Polls the status of an ongoing transcription task.
   */
  getTaskStatus(taskId: string): Promise<TranscriptionTaskResult>;

  /**
   * Checks the health and availability of the transcription backend.
   */
  checkHealth(): Promise<HealthCheckResult>;
}
