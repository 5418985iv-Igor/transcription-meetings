import { getTask, updateTask, getAllTasks, type TaskRecord } from './store';
import { normalizeTranscription, generateMeetingProtocol } from '../openai/service';
import { transcriptionService } from '../transcription/fastapi-provider';

const activeAiTasks = new Set<string>();
const activePollers = new Map<string, NodeJS.Timeout>();

/**
 * Executes the OpenAI stages:
 * raw transcription -> OpenAI normalization -> OpenAI protocol generation
 */
export async function runAiPipeline(taskId: string, rawText: string): Promise<void> {
  if (activeAiTasks.has(taskId)) {
    return;
  }
  activeAiTasks.add(taskId);

  try {
    // 1. Normalization Stage
    updateTask(taskId, {
      status: 'normalizing',
      rawText,
      stepMessage: 'Нормализация текста стенограммы через нейросеть...',
    });

    let normalizedText = '';
    try {
      normalizedText = await normalizeTranscription(rawText);
    } catch (normErr: unknown) {
      const msg = normErr instanceof Error ? normErr.message : String(normErr);
      // If OpenAI key is missing or model fails, keep raw text and report error
      updateTask(taskId, {
        status: 'error',
        rawText,
        error: `Ошибка нормализации: ${msg}`,
      });
      return;
    }

    // 2. Protocol Generation Stage
    updateTask(taskId, {
      status: 'summarizing',
      normalizedText,
      stepMessage: 'Формирование структурированного протокола встречи...',
    });

    let protocolText = '';
    try {
      protocolText = await generateMeetingProtocol(normalizedText);
    } catch (protoErr: unknown) {
      const msg = protoErr instanceof Error ? protoErr.message : String(protoErr);
      updateTask(taskId, {
        status: 'error',
        rawText,
        normalizedText,
        error: `Ошибка составления протокола: ${msg}`,
      });
      return;
    }

    // 3. Completed
    updateTask(taskId, {
      status: 'completed',
      rawText,
      normalizedText,
      protocolText,
      stepMessage: 'Обработка завершена. Протокол готов.',
    });
  } catch (globalErr: unknown) {
    const msg = globalErr instanceof Error ? globalErr.message : String(globalErr);
    updateTask(taskId, {
      status: 'error',
      error: `Ошибка обработки: ${msg}`,
    });
  } finally {
    activeAiTasks.delete(taskId);
  }
}

/**
 * Regenerates the meeting protocol from existing normalized text using
 * the prompt loaded dynamically from prompts/meeting_protocol.txt.
 * Strictly executes only the final step (protocol synthesis) without re-running
 * speech transcription (GigaSTT) or text normalization.
 */
export async function regenerateProtocol(
  taskId: string,
  overrideNormalizedText?: string
): Promise<TaskRecord> {
  const task = getTask(taskId);
  if (!task) {
    throw new Error('Задача не найдена в хранилище сервера');
  }

  const normalizedText = (overrideNormalizedText || task.normalizedText)?.trim();
  if (!normalizedText) {
    throw new Error('Отсутствует нормализованный текст для составления протокола');
  }

  // Clear any previous stuck flag and mark active
  activeAiTasks.delete(taskId);
  activeAiTasks.add(taskId);

  try {
    updateTask(taskId, {
      status: 'summarizing',
      normalizedText,
      stepMessage: 'Формирование нового протокола нейросетью...',
      error: undefined,
    });

    const protocolText = await generateMeetingProtocol(normalizedText);

    const updated = updateTask(taskId, {
      status: 'completed',
      protocolText,
      stepMessage: 'Протокол успешно обновлен по новому промпту.',
      error: undefined,
    });

    return updated || task;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    updateTask(taskId, {
      status: 'error',
      error: `Ошибка составления протокола: ${msg}`,
      stepMessage: 'Не удалось составить протокол',
    });
    throw err;
  } finally {
    activeAiTasks.delete(taskId);
  }
}

/**
 * Server-side background poller to track FastAPI transcription tasks autonomously.
 * Even if the client closes browser tab or loses connection, the server will continue
 * polling FastAPI, extract the raw transcription, and run the AI protocol pipeline.
 */
export function startBackgroundPoller(taskId: string): void {
  if (!taskId || taskId.startsWith('temp_')) return;
  if (activePollers.has(taskId)) return;

  const pollInterval = setInterval(async () => {
    try {
      const task = getTask(taskId);
      if (!task || task.status === 'completed' || task.status === 'error') {
        stopBackgroundPoller(taskId);
        return;
      }

      if (task.status !== 'transcribing') {
        // AI pipeline is running, poller not needed
        stopBackgroundPoller(taskId);
        return;
      }

      const res = await transcriptionService.getTaskStatus(taskId);

      if (res.status === 'completed') {
        stopBackgroundPoller(taskId);
        const rawText = res.text?.trim() || '';
        if (rawText) {
          updateTask(taskId, {
            fastApiStatus: 'completed',
            rawText,
            status: 'normalizing',
            error: undefined,
            stepMessage: 'Стенограмма получена! Запуск формирования протокола...',
          });
          void runAiPipeline(taskId, rawText);
        } else {
          updateTask(taskId, {
            status: 'error',
            fastApiStatus: 'completed',
            error: 'В аудиозаписи не удалось распознать речь (пустая стенограмма).',
            stepMessage: 'Речь не обнаружена',
          });
        }
      } else if (res.status === 'failed') {
        stopBackgroundPoller(taskId);
        updateTask(taskId, {
          status: 'error',
          fastApiStatus: 'failed',
          error: res.error || 'Ошибка распознавания речи на сервере',
          stepMessage: 'Сбой при распознавании речи',
        });
      } else {
        updateTask(taskId, {
          fastApiStatus: res.status,
          stepMessage:
            res.status === 'queued'
              ? 'Очередь распознавания GigaSTT...'
              : 'Выполняется распознавание речи моделью GigaAM-v3...',
        });
      }
    } catch (err: unknown) {
      console.warn(`[BackgroundPoller] Warning polling task ${taskId}:`, err);
    }
  }, 5000);

  activePollers.set(taskId, pollInterval);
}

export function stopBackgroundPoller(taskId: string): void {
  const timer = activePollers.get(taskId);
  if (timer) {
    clearInterval(timer);
    activePollers.delete(taskId);
  }
}

// Auto-restart pollers for any pending tasks on server boot
try {
  const all = getAllTasks();
  for (const t of all) {
    if (t.status === 'transcribing' && !t.id.startsWith('temp_')) {
      startBackgroundPoller(t.id);
    }
  }
} catch {
  // ignore
}
