'use client';

import React, { useState, useMemo } from 'react';
import {
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Play,
  RotateCcw,
  Trash2,
  Download,
  Search,
  Copy,
  Check,
  PlusCircle,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  FileDown,
} from 'lucide-react';
import { TaskRecord } from '@/lib/tasks/store';
import { exportHistoryAsJson } from '@/lib/history/storage';
import { downloadMeetingProtocolDocx } from '@/lib/export/word';

interface RecentTasksProps {
  tasks: TaskRecord[];
  currentTaskId?: string;
  onSelectTask: (taskId: string) => void;
  onResumeTask: (taskId: string, fileName?: string) => void;
  onDeleteTask?: (taskId: string) => void;
  onClearHistory?: () => void;
}

export function RecentTasks({
  tasks,
  currentTaskId,
  onSelectTask,
  onResumeTask,
  onDeleteTask,
  onClearHistory,
}: RecentTasksProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'active' | 'completed' | 'error'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [manualTaskId, setManualTaskId] = useState('');
  const [manualFileName, setManualFileName] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [linkingTempId, setLinkingTempId] = useState<string | null>(null);
  const [customTaskIdValue, setCustomTaskIdValue] = useState('');
  const [downloadingWordId, setDownloadingWordId] = useState<string | null>(null);

  const handleDownloadTaskWord = async (task: TaskRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    const text = task.protocolText || task.normalizedText || task.rawText;
    if (!text) return;

    setDownloadingWordId(task.id);
    try {
      await downloadMeetingProtocolDocx({
        protocolText: text,
        fileName: task.fileName,
        taskId: task.id,
        meetingDate: task.createdAt,
        documentType: task.protocolText ? 'protocol' : 'normalized',
      });
    } catch (err) {
      console.error('Download word error:', err);
    } finally {
      setDownloadingWordId(null);
    }
  };

  const handleCopy = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleManualResume = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = manualTaskId.trim();
    if (!cleanId) return;
    onResumeTask(cleanId, manualFileName.trim() || 'Аудиозапись по ID');
    setManualTaskId('');
    setManualFileName('');
    setShowConnectModal(false);
  };

  const handleInlineLinkSubmit = (tempId: string, fileName?: string) => {
    const cleanId = customTaskIdValue.trim();
    if (!cleanId) return;
    onResumeTask(cleanId, fileName);
    setLinkingTempId(null);
    setCustomTaskIdValue('');
  };

  const activeServerTask = useMemo(() => {
    return tasks.find(
      (t) =>
        (t.status === 'transcribing' || t.status === 'normalizing' || t.status === 'summarizing') &&
        !t.id.startsWith('temp_')
    );
  }, [tasks]);

  const formatTime = (timestamp: number) => {
    try {
      return new Intl.DateTimeFormat('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(timestamp));
    } catch {
      return '';
    }
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(0)} КБ`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  };

  // Filter tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      // Status filter
      if (filterType === 'active') {
        if (t.status === 'completed' || t.status === 'error') return false;
      } else if (filterType === 'completed') {
        if (t.status !== 'completed') return false;
      } else if (filterType === 'error') {
        if (t.status !== 'error') return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = t.fileName?.toLowerCase().includes(q);
        const matchesId = t.id.toLowerCase().includes(q);
        const matchesText =
          t.protocolText?.toLowerCase().includes(q) ||
          t.normalizedText?.toLowerCase().includes(q) ||
          t.rawText?.toLowerCase().includes(q);
        return matchesName || matchesId || matchesText;
      }

      return true;
    });
  }, [tasks, filterType, searchQuery]);

  const activeCount = tasks.filter(
    (t) => t.status !== 'completed' && t.status !== 'error'
  ).length;

  return (
    <div id="transcriptions-history-card" className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
      {/* Header bar */}
      <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/50">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <h3 className="text-base font-bold text-slate-900">
              История расшифровок
            </h3>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-200/80 text-slate-700">
              {tasks.length}
            </span>
            {activeCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-ping" />
                {activeCount} в обработке
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              id="history-connect-task-btn"
              onClick={() => setShowConnectModal((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/70 transition-colors"
              title="Восстановить задачу по её Task ID с сервера"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>По ID задачи</span>
            </button>

            {tasks.length > 0 && (
              <>
                <button
                  type="button"
                  id="history-export-json-btn"
                  onClick={() => exportHistoryAsJson(tasks)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 transition-colors"
                  title="Экспортировать историю в JSON"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  <span className="hidden sm:inline">Экспорт</span>
                </button>

                {onClearHistory && (
                  confirmClear ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          onClearHistory();
                          setConfirmClear(false);
                        }}
                        className="px-2.5 py-1 text-xs font-semibold rounded-xl bg-red-600 text-white hover:bg-red-700 transition-colors"
                      >
                        Да, очистить
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmClear(false)}
                        className="px-2 py-1 text-xs rounded-xl bg-slate-200 text-slate-700 hover:bg-slate-300"
                      >
                        Отмена
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      id="history-clear-btn"
                      onClick={() => setConfirmClear(true)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                      title="Очистить историю"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )
                )}
              </>
            )}
          </div>
        </div>

        {/* Connect / Restore by Task ID Inline Form */}
        {showConnectModal && (
          <form
            onSubmit={handleManualResume}
            className="mt-3.5 p-3.5 rounded-xl bg-white border border-indigo-200 shadow-xs space-y-2.5 animate-fadeIn"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-900">
                Подключение к задаче на сервере по ID:
              </span>
              <button
                type="button"
                onClick={() => setShowConnectModal(false)}
                className="text-[11px] text-slate-400 hover:text-slate-600"
              >
                Закрыть
              </button>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Если соединение прервалось или задача была запущена ранее, введите её UUID. Приложение опросит FastAPI сервер и продолжит цепочку создания протокола.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="sm:col-span-2">
                <input
                  type="text"
                  placeholder="ID задачи (например: 286b4c75-8d1c-4fec-a1cc-8e0e8c2b0d74)"
                  value={manualTaskId}
                  onChange={(e) => setManualTaskId(e.target.value)}
                  required
                  className="w-full text-xs font-mono px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Название (опционально)"
                  value={manualFileName}
                  onChange={(e) => setManualFileName(e.target.value)}
                  className="w-full text-xs px-2.5 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
                <button
                  type="submit"
                  disabled={!manualTaskId.trim()}
                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium shrink-0 transition-colors"
                >
                  Возобновить
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Search and Filters */}
        {tasks.length > 0 && (
          <div className="mt-3.5 flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Поиск по названию или тексту протокола..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
              <button
                type="button"
                onClick={() => setFilterType('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  filterType === 'all'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                Все
              </button>
              <button
                type="button"
                onClick={() => setFilterType('active')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  filterType === 'active'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                В процессе
              </button>
              <button
                type="button"
                onClick={() => setFilterType('completed')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  filterType === 'completed'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                Готовые
              </button>
              <button
                type="button"
                onClick={() => setFilterType('error')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  filterType === 'error'
                    ? 'bg-red-600 text-white'
                    : 'text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                С ошибкой
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Active task in progress banner */}
      {activeServerTask && activeServerTask.id !== currentTaskId && (
        <div className="mx-4 sm:mx-5 mt-4 p-3.5 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/90 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="relative flex h-3 w-3 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
            </span>
            <div className="text-xs text-amber-950 min-w-0">
              <span className="font-bold">На сервере выполняется задача:</span>{' '}
              <span className="font-medium text-amber-900 truncate">
                {activeServerTask.fileName || 'Аудиозапись'}
              </span>{' '}
              <span className="font-mono text-[10px] text-amber-700 bg-amber-100/80 px-1.5 py-0.5 rounded">
                {activeServerTask.id.slice(0, 8)}...
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onResumeTask(activeServerTask.id, activeServerTask.fileName)}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-700 active:bg-amber-800 transition-colors shadow-xs shrink-0"
          >
            <Play className="w-3.5 h-3.5 fill-white" />
            <span>Подключиться к задаче</span>
          </button>
        </div>
      )}

      {/* Task List */}
      <div className="p-4 sm:p-5">
        {tasks.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <FileText className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-medium text-slate-700">История пока пуста</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Загрузите аудиозапись совещания или подключитесь по ID задачи.
            </p>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="text-center py-6 text-slate-500">
            <p className="text-xs">Задач по выбранному фильтру не найдено</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTasks.map((t) => {
              const isSelected = t.id === currentTaskId;
              const isFinished = t.status === 'completed';
              const isError = t.status === 'error';
              const isInProgress = !isFinished && !isError;
              const hasRawText = Boolean(t.rawText && t.rawText.trim().length > 0);
              const isTemp = t.id.startsWith('temp_');
              const isLinkingThis = linkingTempId === t.id;

              return (
                <div
                  key={t.id}
                  id={`task-history-item-${t.id}`}
                  className={`p-4 rounded-xl border transition-all ${
                    isSelected
                      ? 'bg-indigo-50/60 border-indigo-300 ring-1 ring-indigo-500/20 shadow-xs'
                      : 'bg-white border-slate-200/80 hover:border-slate-300'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* File info and status */}
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                          isFinished
                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-200/60'
                            : isError
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-indigo-50 text-indigo-600 border border-indigo-200/60'
                        }`}
                      >
                        {isFinished ? (
                          <CheckCircle2 className="w-5 h-5" />
                        ) : isError ? (
                          <AlertCircle className="w-5 h-5" />
                        ) : (
                          <Sparkles className="w-5 h-5 animate-spin" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                            {t.fileName || 'Аудиозапись совещания'}
                          </h4>

                          {/* Task ID copyable badge */}
                          {!isTemp ? (
                            <button
                              type="button"
                              onClick={(e) => handleCopy(t.id, e)}
                              className="inline-flex items-center gap-1 font-mono text-[10px] text-slate-500 bg-slate-100 hover:bg-slate-200/80 px-2 py-0.5 rounded-md border border-slate-200 transition-colors"
                              title="Нажмите, чтобы скопировать ID задачи"
                            >
                              <span>{t.id.slice(0, 8)}...</span>
                              {copiedId === t.id ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3 text-slate-400" />
                              )}
                            </button>
                          ) : (
                            <span className="inline-flex items-center font-mono text-[10px] text-amber-700 bg-amber-100/90 px-2 py-0.5 rounded-md border border-amber-200">
                              Временный ID (обрыв)
                            </span>
                          )}

                          {t.fileSize > 0 && (
                            <span className="text-[11px] text-slate-400">
                              ({formatFileSize(t.fileSize)})
                            </span>
                          )}
                        </div>

                        {/* Status message and date */}
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 mt-1">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {formatTime(t.createdAt)}
                          </span>
                          <span>•</span>
                          <span
                            className={`font-medium ${
                              isFinished
                                ? 'text-emerald-700'
                                : isError
                                ? 'text-red-600'
                                : 'text-indigo-600'
                            }`}
                          >
                            {isFinished
                              ? 'Протокол готов'
                              : isError
                              ? t.error || 'Связь прервана / Ошибка'
                              : t.stepMessage ||
                                (t.status === 'transcribing'
                                  ? 'Распознавание речи GigaSTT...'
                                  : t.status === 'normalizing'
                                  ? 'Нормализация текста нейросетью...'
                                  : t.status === 'summarizing'
                                  ? 'Составление протокола...'
                                  : 'В обработке...')}
                          </span>
                        </div>

                        {/* Snippet preview if available */}
                        {t.protocolText && (
                          <p className="text-[11px] text-slate-600 line-clamp-1 mt-1.5 italic bg-slate-50 p-1.5 rounded-md border border-slate-100">
                            {t.protocolText.replace(/[#*]/g, '').slice(0, 160)}...
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 w-full sm:w-auto justify-end flex-wrap">
                      {/* CONTINUE / RESUME TRANSCRIPTION BUTTON */}
                      {(!isFinished || isError) && (
                        <button
                          type="button"
                          id={`resume-task-btn-${t.id}`}
                          onClick={() => onResumeTask(t.id, t.fileName)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 transition-colors shadow-xs"
                          title="Продолжить опрос сервера и завершить цепочку создания протокола"
                        >
                          <Play className="w-3.5 h-3.5 fill-white" />
                          <span>Продолжить расшифровку</span>
                        </button>
                      )}

                      {/* ENTER / LINK REAL TASK ID BUTTON */}
                      {(isTemp || isError) && (
                        <button
                          type="button"
                          onClick={() => {
                            setLinkingTempId(isLinkingThis ? null : t.id);
                            setCustomTaskIdValue('');
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200/90 border border-slate-200 transition-colors"
                          title="Указать реальный task_id с сервера FastAPI"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                          <span>{isLinkingThis ? 'Скрыть ввод ID' : 'Указать ID'}</span>
                        </button>
                      )}

                      {/* OPEN COMPLETED RESULT BUTTON */}
                      {isFinished && (
                        <>
                          <button
                            type="button"
                            id={`download-docx-task-btn-${t.id}`}
                            onClick={(e) => handleDownloadTaskWord(t, e)}
                            disabled={downloadingWordId === t.id}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200/80 transition-colors shadow-2xs"
                            title="Сохранить протокол в документ Word (.docx)"
                          >
                            {downloadingWordId === t.id ? (
                              <>
                                <span className="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                                <span>Word...</span>
                              </>
                            ) : (
                              <>
                                <FileDown className="w-3.5 h-3.5 text-blue-600" />
                                <span>Word .docx</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            id={`open-task-btn-${t.id}`}
                            onClick={() => onSelectTask(t.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                          >
                            <FileText className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Открыть</span>
                          </button>
                        </>
                      )}

                      {/* RE-GENERATE PROTOCOL IF RAW TEXT EXISTS BUT ERRORED */}
                      {isError && hasRawText && (
                        <button
                          type="button"
                          onClick={() => onResumeTask(t.id, t.fileName)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 transition-colors"
                          title="Стенограмма уже сохранена! Повторить создание протокола через ИИ"
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-purple-600" />
                          <span className="hidden md:inline">Сформировать протокол</span>
                        </button>
                      )}

                      {/* DELETE TASK BUTTON */}
                      {onDeleteTask && (
                        <button
                          type="button"
                          id={`delete-task-btn-${t.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteTask(t.id);
                          }}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Удалить из истории"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Inline Link Task ID Input Field */}
                  {isLinkingThis && (
                    <div className="mt-3 pt-3 border-t border-slate-200/80 flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                      <div className="flex-1">
                        <input
                          type="text"
                          placeholder="Вставьте UUID задачи (например, 255b8e3d-4751-404e-975b-1bca19aae049)..."
                          value={customTaskIdValue}
                          onChange={(e) => setCustomTaskIdValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleInlineLinkSubmit(t.id, t.fileName);
                            }
                          }}
                          className="w-full text-xs font-mono px-3 py-1.5 bg-white border border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          autoFocus
                        />
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleInlineLinkSubmit(t.id, t.fileName)}
                          disabled={!customTaskIdValue.trim()}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white transition-colors"
                        >
                          Привязать и запустить
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setLinkingTempId(null);
                            setCustomTaskIdValue('');
                          }}
                          className="px-2.5 py-1.5 text-xs rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                        >
                          Отмена
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
