'use client';

import React, { useState } from 'react';
import {
  UploadCloud,
  Headphones,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  FileCheck,
  RefreshCw,
  Copy,
  Check,
} from 'lucide-react';
import { TaskStatus } from '@/lib/tasks/store';

interface StatusIndicatorProps {
  status: TaskStatus;
  stepMessage?: string;
  error?: string;
  onRetry?: () => void;
  fileName?: string;
  taskId?: string;
  uploadProgress?: number | null;
}

interface StepConfig {
  id: TaskStatus;
  label: string;
  description: string;
  icon: React.ElementType;
}

const STEPS: StepConfig[] = [
  {
    id: 'uploading',
    label: 'Загрузка',
    description: 'Отправка аудиофайла',
    icon: UploadCloud,
  },
  {
    id: 'transcribing',
    label: 'Распознавание',
    description: 'Транскрибация GigaSTT',
    icon: Headphones,
  },
  {
    id: 'normalizing',
    label: 'Нормализация',
    description: 'Исправление ошибок речи',
    icon: Sparkles,
  },
  {
    id: 'summarizing',
    label: 'Протокол',
    description: 'Формирование структуры',
    icon: FileCheck,
  },
];

export function StatusIndicator({
  status,
  stepMessage,
  error,
  onRetry,
  fileName,
  taskId,
  uploadProgress,
}: StatusIndicatorProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyTaskId = async () => {
    if (!taskId) return;
    try {
      await navigator.clipboard.writeText(taskId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const getStepIndex = (s: TaskStatus) => {
    switch (s) {
      case 'uploading':
        return 0;
      case 'transcribing':
        return 1;
      case 'normalizing':
        return 2;
      case 'summarizing':
        return 3;
      case 'completed':
        return 4;
      case 'error':
        return -1;
      default:
        return 0;
    }
  };

  const currentIndex = getStepIndex(status);

  if (status === 'error') {
    return (
      <div className="bg-red-50/80 border border-red-200 rounded-2xl p-6 text-red-900 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center text-red-600 shrink-0">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-base font-semibold text-red-950 mb-1">Произошла ошибка при обработке</h4>
            <p className="text-sm text-red-700 break-words mb-3">
              {error || 'Не удалось завершить операцию. Проверьте соединение или параметры сервера.'}
            </p>

            {taskId && !taskId.startsWith('temp_') && (
              <div className="mb-4 inline-flex items-center gap-2 px-3 py-1.5 bg-red-100/70 border border-red-200 rounded-lg text-xs font-mono text-red-900">
                <span className="text-red-700 font-sans font-medium">task_id:</span>
                <span className="font-semibold select-all">{taskId}</span>
                <button
                  type="button"
                  onClick={handleCopyTaskId}
                  className="p-1 hover:bg-red-200 rounded text-red-800 transition-colors"
                  title="Скопировать task_id"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            )}

            {onRetry && (
              <div>
                <button
                  type="button"
                  onClick={onRetry}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Повторить попытку
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-7 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">
            {status === 'completed' ? 'Обработка успешно завершена' : 'Идет обработка аудиозаписи'}
          </h4>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            {fileName && <p className="text-xs text-slate-500 truncate max-w-sm">{fileName}</p>}
            {taskId && !taskId.startsWith('temp_') && (
              <>
                <span className="text-slate-300">•</span>
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-indigo-50 border border-indigo-100 rounded-md text-[11px] font-mono text-indigo-700">
                  <span className="text-slate-400 font-sans">task_id:</span>
                  <span className="font-semibold select-all">{taskId}</span>
                  <button
                    type="button"
                    onClick={handleCopyTaskId}
                    className="p-0.5 hover:bg-indigo-100 rounded text-indigo-600 transition-colors"
                    title="Скопировать task_id"
                  >
                    {copied ? (
                      <Check className="w-3 h-3 text-emerald-600" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100 self-start sm:self-auto shrink-0">
          {status !== 'completed' && <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping" />}
          <span>{stepMessage || (status === 'completed' ? 'Результат готов' : 'Выполняется...')}</span>
        </div>
      </div>

      {/* Upload progress bar if uploading */}
      {status === 'uploading' && uploadProgress !== undefined && uploadProgress !== null && (
        <div className="mb-5 p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
          <div className="flex justify-between text-xs text-slate-600 mb-1.5">
            <span className="font-medium">Передача файла на сервер приложения</span>
            <span className="font-semibold font-mono">{uploadProgress}%</span>
          </div>
          <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-600 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          {uploadProgress === 100 && (
            <p className="text-[11px] text-indigo-600 mt-1.5 animate-pulse">
              Файл загружен. Передача в сервис распознавания речи...
            </p>
          )}
        </div>
      )}

      {/* Stepper Pipeline */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {STEPS.map((step, idx) => {
          const isDone = currentIndex > idx || status === 'completed';
          const isCurrent = currentIndex === idx;
          const Icon = step.icon;

          return (
            <div
              key={step.id}
              className={`relative rounded-xl p-3.5 border transition-all ${
                isDone
                  ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900'
                  : isCurrent
                  ? 'bg-indigo-50/60 border-indigo-300 ring-2 ring-indigo-500/10 text-indigo-950'
                  : 'bg-slate-50/70 border-slate-200/80 text-slate-400'
              }`}
            >
              <div className="flex items-center gap-2.5 mb-1.5">
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-semibold ${
                    isDone
                      ? 'bg-emerald-600 text-white'
                      : isCurrent
                      ? 'bg-indigo-600 text-white animate-pulse'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {isDone ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-xs font-semibold truncate ${
                      isDone
                        ? 'text-emerald-900'
                        : isCurrent
                        ? 'text-indigo-950'
                        : 'text-slate-600'
                    }`}
                  >
                    {step.label}
                  </p>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 leading-tight truncate">{step.description}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
