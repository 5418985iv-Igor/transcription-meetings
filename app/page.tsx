'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Header } from '@/components/Header';
import { AudioUploader } from '@/components/AudioUploader';
import { StatusIndicator } from '@/components/StatusIndicator';
import { ResultsViewer } from '@/components/ResultsViewer';
import { RecentTasks } from '@/components/RecentTasks';
import { HealthCheckData } from '@/components/ServerHealthWidget';
import { TaskRecord } from '@/lib/tasks/store';
import {
  loadHistoryFromStorage,
  saveHistoryToStorage,
  upsertTaskInStorage,
  replaceTaskInStorage,
  removeTaskFromStorage,
  clearStorageHistory,
} from '@/lib/history/storage';
import { withBasePath } from '@/lib/utils';

/**
 * Safely parses API responses, intercepting raw HTML proxy/warmup/error pages
 * so that cryptic "Unexpected token <" errors never leak to the user interface.
 */
async function parseApiResponse<T = Record<string, unknown>>(res: Response): Promise<T> {
  const text = await res.text();

  if (!res.ok) {
    try {
      const errorJson = JSON.parse(text);
      if (errorJson.error) {
        throw new Error(errorJson.error);
      }
    } catch {
      // Not JSON, continue to fallback
    }

    if (res.status === 413) {
      throw new Error(
        'Размер аудиофайла превысил допустимый лимит (413 Payload Too Large). Пожалуйста, загрузите запись меньшего размера.'
      );
    }
    if (res.status === 504) {
      throw new Error(
        'Превышено время ожидания шлюза (504 Gateway Timeout). Рекомендуется использовать сжатые файлы M4A/MP3.'
      );
    }
    if (res.status === 502) {
      throw new Error(
        'Сервер распознавания временно недоступен (502 Bad Gateway). Проверьте доступность FastAPI сервера.'
      );
    }

    throw new Error(`Ошибка сервера (HTTP ${res.status}): ${text.slice(0, 160)}`);
  }

  // Handle case where proxy returns warmup HTML with status 200
  if (text.trim().toLowerCase().startsWith('<!doctype') || text.includes('<html')) {
    throw new Error(
      'Сервер приложения сейчас запускается в облаке. Пожалуйста, подождите 5–10 секунд и нажмите «Начать обработку» снова.'
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Не удалось прочитать ответ сервера: ${text.slice(0, 100)}`);
  }
}

export default function MeetingProtocolsPage() {
  const [currentTask, setCurrentTask] = useState<TaskRecord | null>(null);
  const [historyTasks, setHistoryTasks] = useState<TaskRecord[]>(() => loadHistoryFromStorage());
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const [serverInfo, setServerInfo] = useState<HealthCheckData | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isRegeneratingProtocol, setIsRegeneratingProtocol] = useState(false);

  // Polling interval ref
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const activePollingTaskIdRef = useRef<string | null>(null);
  const startPollingRef = useRef<(taskId: string) => void>(() => {});

  // Stop polling helper
  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    activePollingTaskIdRef.current = null;
  }, []);

  // Poll task status every 5 seconds as specified
  const pollTask = useCallback(
    async (taskId: string) => {
      try {
        const res = await fetch(withBasePath(`/api/tasks/${encodeURIComponent(taskId)}`));
        const data = await parseApiResponse<{ task: TaskRecord; redirectedFrom?: string }>(res);
        const task: TaskRecord = data.task;

        if (task) {
          // If the server auto-resolved a temp ID to the real FastAPI task ID:
          if (data.redirectedFrom && data.redirectedFrom === taskId && task.id !== taskId) {
            setHistoryTasks((_prev) => replaceTaskInStorage(taskId, task));
            setCurrentTask(task);
            stopPolling();
            startPollingRef.current(task.id);
            return;
          }

          setCurrentTask(task);

          // Update task in persistent history
          setHistoryTasks((_prev) => upsertTaskInStorage(task));

          // If reached final state (completed or hard error), terminate polling
          if (task.status === 'completed' || (task.status === 'error' && !task.rawText)) {
            stopPolling();
          }
        }
      } catch (err: unknown) {
        // Network disconnect or temporary glitch!
        // We do NOT stop polling; keep retrying so when connection restores, polling succeeds
        console.warn('Network polling interruption:', err);
        setCurrentTask((prev) =>
          prev && prev.id === taskId && prev.status !== 'completed'
            ? {
                ...prev,
                stepMessage:
                  'Связь временно прервана (нет сети). Процесс продолжается на сервере GigaSTT. Ожидание восстановления связи...',
              }
            : prev
        );
      }
    },
    [stopPolling]
  );

  const startPolling = useCallback(
    (taskId: string) => {
      stopPolling();
      activePollingTaskIdRef.current = taskId;
      // Poll immediately
      void pollTask(taskId);
      // Then poll every 5000ms (5 seconds)
      pollIntervalRef.current = setInterval(() => {
        void pollTask(taskId);
      }, 5000);
    },
    [pollTask, stopPolling]
  );

  useEffect(() => {
    startPollingRef.current = startPolling;
  }, [startPolling]);

  // Sync with server-side tasks on mount
  useEffect(() => {
    fetch(withBasePath('/api/tasks'))
      .then((res) => parseApiResponse<{ tasks: TaskRecord[] }>(res))
      .then((data) => {
        if (Array.isArray(data.tasks)) {
          setHistoryTasks((prev) => {
            const map = new Map<string, TaskRecord>();
            // Add server tasks
            data.tasks.forEach((t) => map.set(t.id, t));
            // Merge with local tasks (prefer local if newer or has text)
            prev.forEach((t) => {
              if (t.id.startsWith('temp_') && !t.rawText && t.status === 'error') {
                return; // drop stale temp_ error tasks
              }
              const existing = map.get(t.id);
              if (!existing) {
                map.set(t.id, t);
              } else {
                map.set(t.id, {
                  ...existing,
                  ...t,
                  rawText: t.rawText || existing.rawText,
                  normalizedText: t.normalizedText || existing.normalizedText,
                  protocolText: t.protocolText || existing.protocolText,
                });
              }
            });
            const merged = Array.from(map.values()).sort(
              (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
            );
            saveHistoryToStorage(merged);
            return merged;
          });

          // If there is an active transcribing/normalizing task on the server, attach to it automatically
          const runningTask = data.tasks.find(
            (t) =>
              (t.status === 'transcribing' || t.status === 'normalizing' || t.status === 'summarizing') &&
              !t.id.startsWith('temp_')
          );
          if (runningTask && !activePollingTaskIdRef.current) {
            setCurrentTask(runningTask);
            startPolling(runningTask.id);
          }
        }
      })
      .catch((err) => {
        console.warn('Could not sync with /api/tasks:', err);
      });
  }, [startPolling]);

  // Initial health check on mount
  useEffect(() => {
    let isMounted = true;
    fetch(withBasePath('/api/health'))
      .then((res) =>
        parseApiResponse<{ transcriptionServer?: HealthCheckData }>(res)
      )
      .then((data) => {
        if (isMounted) {
          if (data.transcriptionServer) {
            setServerInfo(data.transcriptionServer);
            setServerOnline(Boolean(data.transcriptionServer.online));
          } else {
            setServerOnline(false);
          }
        }
      })
      .catch(() => {
        if (isMounted) {
          setServerOnline(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Manual refresh health button
  const handleRefreshHealth = useCallback(async () => {
    setIsCheckingHealth(true);
    try {
      const res = await fetch(withBasePath('/api/health'));
      const data = await parseApiResponse<{ transcriptionServer?: HealthCheckData }>(res);
      if (data.transcriptionServer) {
        setServerInfo(data.transcriptionServer);
        setServerOnline(Boolean(data.transcriptionServer.online));
      } else {
        setServerOnline(false);
      }
    } catch {
      setServerOnline(false);
    } finally {
      setIsCheckingHealth(false);
    }
  }, []);

  // Reconnect polling automatically if device goes online
  useEffect(() => {
    const handleOnline = () => {
      if (activePollingTaskIdRef.current) {
        void pollTask(activePollingTaskIdRef.current);
      }
    };
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [pollTask]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  // Handle uploading audio file with real-time progress and diagnostics
  const handleStartUpload = async (file: File) => {
    stopPolling();

    // Check size on client side to protect against proxy aborts
    const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
    if (file.size > MAX_FILE_SIZE) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      setCurrentTask({
        id: `temp_${Date.now()}`,
        status: 'error',
        fileName: file.name,
        fileSize: file.size,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        error: `Размер аудиофайла (${sizeMb} МБ) превышает лимит сервера (100 МБ). Рекомендуется использовать сжатый формат (M4A/MP3).`,
        stepMessage: 'Файл слишком велик для загрузки',
      });
      return;
    }

    // Create immediate optimistic task
    const tempId = `temp_${Date.now()}`;
    const optimisticTask: TaskRecord = {
      id: tempId,
      status: 'uploading',
      fileName: file.name,
      fileSize: file.size,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      stepMessage: 'Отправка аудиофайла на сервер приложения...',
    };

    setCurrentTask(optimisticTask);
    setUploadProgress(0);

    let bytesUploaded = false;

    try {
      // Use XMLHttpRequest for accurate upload percentage and detailed error breakdown
      const uploadPromise = new Promise<{ taskId: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', withBasePath('/api/tasks'), true);
        xhr.timeout = 180000; // 3 minutes timeout

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            setUploadProgress(percent);
            if (percent >= 98) {
              bytesUploaded = true;
            }
            setCurrentTask((prev) =>
              prev && prev.status === 'uploading'
                ? {
                    ...prev,
                    stepMessage:
                      percent < 100
                        ? `Отправка аудиофайла на сервер: ${percent}%...`
                        : 'Файл загружен на сервер. Запуск распознавания речи в GigaSTT...',
                  }
                : prev
            );
          }
        };

        xhr.upload.onloadend = () => {
          bytesUploaded = true;
        };

        xhr.onload = () => {
          setUploadProgress(null);
          const text = xhr.responseText;
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(text);
              resolve(data);
            } catch {
              resolve({ taskId: tempId });
            }
          } else {
            // Check for structured JSON error or HTML error
            try {
              const errJson = JSON.parse(text);
              if (errJson.error) {
                reject(new Error(errJson.error));
                return;
              }
            } catch {
              // fallback
            }

            if (xhr.status === 413) {
              reject(
                new Error(
                  'Размер аудиофайла превысил лимит сервера (413 Payload Too Large). Пожалуйста, выберите файл до 100 МБ.'
                )
              );
            } else if (xhr.status === 504) {
              // Gateway timeout - file was received by server
              resolve({ taskId: tempId });
            } else {
              reject(
                new Error(
                  `Ошибка сервера при приёме файла (HTTP ${xhr.status}): ${
                    text.slice(0, 120) || xhr.statusText
                  }`
                )
              );
            }
          }
        };

        xhr.onerror = () => {
          setUploadProgress(null);
          if (bytesUploaded) {
            // File bytes were delivered to the server; proceed to recognition
            resolve({ taskId: tempId });
            return;
          }
          reject(
            new Error(
              'Сетевой сбой при передаче файла (Failed to fetch). Проверьте соединение с интернетом или воспользуйтесь кнопкой «Проверить доступность сервера».'
            )
          );
        };

        xhr.ontimeout = () => {
          setUploadProgress(null);
          if (bytesUploaded) {
            resolve({ taskId: tempId });
            return;
          }
          reject(
            new Error('Превышено время ожидания отправки файла (таймаут 180 сек).')
          );
        };

        const formData = new FormData();
        formData.append('file', file);
        formData.append('clientTaskId', tempId);
        xhr.send(formData);
      });

      const data = await uploadPromise;
      const effectiveTaskId = data.taskId || tempId;

      const updatedTask: TaskRecord = {
        ...optimisticTask,
        id: effectiveTaskId,
        clientTaskId: tempId,
        status: 'transcribing',
        stepMessage: 'Задача принята в очередь распознавания GigaSTT...',
      };

      setCurrentTask(updatedTask);
      setHistoryTasks((prev) => {
        const withoutTemp = prev.filter((t) => t.id !== tempId && t.id !== effectiveTaskId);
        return upsertTaskInStorage({ ...updatedTask, id: effectiveTaskId });
      });

      // Begin 5-second polling loop
      startPolling(effectiveTaskId);
    } catch (err: unknown) {
      setUploadProgress(null);

      // If file was uploaded to the server, transition directly to recognition stage
      if (bytesUploaded) {
        const transcribingTask: TaskRecord = {
          ...optimisticTask,
          id: tempId,
          clientTaskId: tempId,
          status: 'transcribing',
          stepMessage: 'Файл загружен на сервер. Запуск распознавания речи в GigaSTT...',
        };
        setCurrentTask(transcribingTask);
        setHistoryTasks((_prev) => upsertTaskInStorage(transcribingTask));
        startPolling(tempId);
        return;
      }

      // Check if server received the file and started transcription
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const checkRes = await fetch(withBasePath(`/api/tasks?clientTaskId=${encodeURIComponent(tempId)}`));
          if (checkRes.ok) {
            const checkData = await checkRes.json();
            if (checkData?.task) {
              const serverTask = checkData.task as TaskRecord;
              setCurrentTask(serverTask);
              setHistoryTasks((_prev) => replaceTaskInStorage(tempId, serverTask));
              startPolling(serverTask.id);
              return;
            }
          }
        } catch {
          // ignore
        }
        await new Promise((r) => setTimeout(r, 1000));
      }

      const message = err instanceof Error ? err.message : String(err);
      setCurrentTask((prev) =>
        prev
          ? {
              ...prev,
              status: 'error',
              error: message,
              stepMessage: 'Ошибка при отправке аудиозаписи',
            }
          : null
      );
    }
  };

  /**
   * Resumes transcription/polling from history or after a network disconnect.
   * Continues down the pipeline: polls GigaSTT -> gets text -> normalizes -> creates protocol!
   */
  const handleResumeTask = useCallback(
    async (taskId: string, fileName?: string) => {
      stopPolling();

      const existing = historyTasks.find((t) => t.id === taskId);

      // CRITICAL: If normalizedText is already available, NEVER poll GigaSTT or restart speech recognition!
      if (existing?.normalizedText?.trim()) {
        setCurrentTask(existing);
        return;
      }

      const isAlreadyHaveRaw = Boolean(existing?.rawText && existing.rawText.trim().length > 0);

      const targetTask: TaskRecord = existing
        ? {
            ...existing,
            status: isAlreadyHaveRaw ? 'normalizing' : 'transcribing',
            error: undefined,
            stepMessage: isAlreadyHaveRaw
              ? 'Возобновление нормализации и составления протокола...'
              : 'Возобновление опроса сервера GigaSTT...',
            updatedAt: Date.now(),
          }
        : {
            id: taskId,
            status: 'transcribing',
            fileName: fileName || 'Восстановленная аудиозапись',
            fileSize: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            stepMessage: 'Подключение к задаче и опрос сервера GigaSTT...',
          };

      setCurrentTask(targetTask);
      setHistoryTasks((prev) => upsertTaskInStorage(targetTask));

      let effectiveTaskId = taskId;

      // Trigger immediate server check with resume flag
      try {
        const cleanFileName = targetTask.fileName || 'Аудиозапись';
        const res = await fetch(
          withBasePath(`/api/tasks/${encodeURIComponent(taskId)}?resume=true&fileName=${encodeURIComponent(cleanFileName)}`)
        );
        const data = await parseApiResponse<{ task: TaskRecord; redirectedFrom?: string }>(res);
        if (data.task) {
          const resolvedTask = data.task;
          if (data.redirectedFrom && data.redirectedFrom === taskId && resolvedTask.id !== taskId) {
            setHistoryTasks((_prev) => replaceTaskInStorage(taskId, resolvedTask));
            effectiveTaskId = resolvedTask.id;
          } else {
            setHistoryTasks((_prev) => upsertTaskInStorage(resolvedTask));
          }
          setCurrentTask(resolvedTask);
        }
      } catch (err: unknown) {
        console.warn('[ResumeTask] Notice on initial resume request:', err);
      }

      // Start regular 5-second polling on the effective task ID
      startPolling(effectiveTaskId);
    },
    [historyTasks, startPolling, stopPolling]
  );

  // Delete a task from history
  const handleDeleteTask = useCallback(
    async (taskId: string) => {
      const updated = removeTaskFromStorage(taskId);
      setHistoryTasks(updated);

      if (currentTask?.id === taskId) {
        stopPolling();
        setCurrentTask(null);
      }

      try {
        await fetch(withBasePath(`/api/tasks/${encodeURIComponent(taskId)}`), { method: 'DELETE' });
      } catch {
        // ignore
      }
    },
    [currentTask, stopPolling]
  );

  // Clear all history
  const handleClearHistory = useCallback(async () => {
    clearStorageHistory();
    setHistoryTasks([]);

    if (currentTask?.status === 'completed') {
      setCurrentTask(null);
    }

    try {
      await fetch(withBasePath('/api/tasks'), { method: 'DELETE' });
    } catch {
      // ignore
    }
  }, [currentTask]);

  // Retry processing
  const handleRetry = async () => {
    if (!currentTask) return;
    // CRITICAL: If normalizedText is already available, retrying should ONLY regenerate the protocol!
    // NEVER call GigaSTT or restart speech recognition!
    if (currentTask.normalizedText?.trim()) {
      void handleRegenerateProtocol();
      return;
    }
    void handleResumeTask(currentTask.id, currentTask.fileName);
  };

  // Regenerate protocol using normalized text and latest meeting protocol prompt
  const handleRegenerateProtocol = useCallback(async () => {
    if (!currentTask || !currentTask.normalizedText?.trim()) return;
    const targetTaskId = currentTask.id;
    const normalizedText = currentTask.normalizedText.trim();
    const rawText = currentTask.rawText || '';
    const fileName = currentTask.fileName || 'Аудиозапись';

    setIsRegeneratingProtocol(true);

    // Keep ResultsViewer active; don't wipe the task into an unrendered state
    setCurrentTask((prev) =>
      prev
        ? {
            ...prev,
            error: undefined,
            stepMessage: 'Формирование нового протокола нейросетью...',
          }
        : null
    );

    try {
      const res = await fetch(
        withBasePath(`/api/tasks/${encodeURIComponent(targetTaskId)}/regenerate-protocol`),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            normalizedText,
            rawText,
            fileName,
          }),
        }
      );
      const data = await parseApiResponse<{ success: boolean; task?: TaskRecord; error?: string }>(res);

      if (!res.ok || !data.task) {
        throw new Error(data.error || 'Не удалось переформировать протокол');
      }

      const updatedTask = data.task;
      setCurrentTask(updatedTask);
      setHistoryTasks((_prev) => upsertTaskInStorage(updatedTask));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setCurrentTask((prev) =>
        prev
          ? {
              ...prev,
              status: 'completed', // Keep as completed so ResultsViewer stays visible and doesn't lock out the user!
              error: `Ошибка составления протокола: ${msg}`,
              stepMessage: 'Не удалось переформировать протокол по новому промпту',
            }
          : null
      );
    } finally {
      setIsRegeneratingProtocol(false);
    }
  }, [currentTask]);

  const handleReset = () => {
    stopPolling();
    setCurrentTask(null);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const isBusy =
    currentTask?.status === 'uploading' ||
    currentTask?.status === 'transcribing' ||
    currentTask?.status === 'normalizing' ||
    currentTask?.status === 'summarizing';

  return (
    <div className="min-h-screen bg-slate-50/60 text-slate-900 font-sans flex flex-col">
      <Header
        serverOnline={serverOnline}
        onRefreshHealth={handleRefreshHealth}
        isCheckingHealth={isCheckingHealth}
        onNewRecording={handleReset}
        hasActiveTask={Boolean(currentTask)}
      />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-6">
        {/* Page Hero Title & Subtitle */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-950 tracking-tight mb-2">
            Протоколы совещаний
          </h1>
          <p className="text-slate-600 text-sm sm:text-base">
            Автоматическая расшифровка встреч через GigaSTT (модель GigaAM-v3) с нормализацией текста и формированием кратких протоколов.
          </p>
        </div>

        {/* Main Content Workspace */}
        <div className="space-y-6">
          {/* Upload Area (shown when no task is running) */}
          {!currentTask && (
            <AudioUploader
              onStartUpload={handleStartUpload}
              disabled={isBusy}
            />
          )}

          {/* Status / Stepper Card (shown when a task is active or errored) */}
          {currentTask && (currentTask.status !== 'completed' || currentTask.error) && (
            <StatusIndicator
              status={currentTask.status}
              stepMessage={currentTask.stepMessage}
              error={currentTask.error}
              onRetry={handleRetry}
              fileName={currentTask.fileName}
              taskId={currentTask.id}
              uploadProgress={uploadProgress}
              hasNormalizedText={Boolean(currentTask.normalizedText?.trim())}
            />
          )}

          {/* Results Viewer (shown when raw, normalized, or protocol text is available) */}
          {currentTask &&
            (currentTask.protocolText ||
              currentTask.normalizedText ||
              currentTask.rawText ||
              currentTask.status === 'completed') && (
              <ResultsViewer
                rawText={currentTask.rawText}
                normalizedText={currentTask.normalizedText}
                protocolText={currentTask.protocolText}
                fileName={currentTask.fileName}
                taskId={currentTask.id}
                onReset={handleReset}
                onRegenerateProtocol={handleRegenerateProtocol}
                isRegeneratingProtocol={isRegeneratingProtocol}
                error={currentTask.error}
              />
            )}
        </div>

        {/* Persistent Task History with Resume Capability */}
        <div className="mt-8">
          <RecentTasks
            tasks={historyTasks}
            currentTaskId={currentTask?.id}
            onSelectTask={(id) => {
              const selected = historyTasks.find((t) => t.id === id);
              if (selected) {
                setCurrentTask(selected);
                if (selected.status !== 'completed' && selected.status !== 'error') {
                  startPolling(selected.id);
                } else {
                  stopPolling();
                }
              }
            }}
            onResumeTask={handleResumeTask}
            onDeleteTask={handleDeleteTask}
            onClearHistory={handleClearHistory}
          />
        </div>
      </main>

      {/* Clean enterprise footer */}
      <footer className="border-t border-slate-200/80 bg-white py-6 mt-12">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
         
          <div>Корпоративный сервис протоколирования совещаний</div>
        </div>
      </footer>
    </div>
  );
}

