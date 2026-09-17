'use client';

import React, { useState } from 'react';
import Markdown from 'react-markdown';
import {
  FileText,
  Sparkles,
  AlignLeft,
  Copy,
  Check,
  Download,
  Printer,
  RotateCcw,
  FileDown,
} from 'lucide-react';
import { downloadMeetingProtocolDocx } from '@/lib/export/word';

interface ResultsViewerProps {
  rawText?: string;
  normalizedText?: string;
  protocolText?: string;
  fileName?: string;
  taskId?: string;
  onReset?: () => void;
}

type TabType = 'protocol' | 'normalized' | 'raw';

export function ResultsViewer({
  rawText = '',
  normalizedText = '',
  protocolText = '',
  fileName = 'meeting',
  taskId,
  onReset,
}: ResultsViewerProps) {
  const [activeTab, setActiveTab] = useState<TabType>('protocol');
  const [copied, setCopied] = useState(false);
  const [copiedTaskId, setCopiedTaskId] = useState(false);
  const [isExportingWord, setIsExportingWord] = useState(false);
  const [wordExportSuccess, setWordExportSuccess] = useState(false);

  const getCurrentText = () => {
    switch (activeTab) {
      case 'protocol':
        return protocolText;
      case 'normalized':
        return normalizedText;
      case 'raw':
        return rawText;
    }
  };

  const handleCopy = async () => {
    const text = getCurrentText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleDownloadWord = async () => {
    const text = getCurrentText();
    if (!text) return;

    setIsExportingWord(true);
    try {
      await downloadMeetingProtocolDocx({
        protocolText: text,
        fileName,
        taskId,
        documentType: activeTab,
      });
      setWordExportSuccess(true);
      setTimeout(() => setWordExportSuccess(false), 2500);
    } catch (err) {
      console.error('Word export error:', err);
    } finally {
      setIsExportingWord(false);
    }
  };

  const handleDownload = (format: 'md' | 'txt') => {
    const text = getCurrentText();
    if (!text) return;

    const baseName = fileName.replace(/\.[^/.]+$/, '') || 'meeting_protocol';
    let suffix = 'protocol';
    if (activeTab === 'normalized') suffix = 'normalized';
    if (activeTab === 'raw') suffix = 'raw_transcript';

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${baseName}_${suffix}.${format}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  const wordCount = (text: string) => {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(Boolean).length;
  };

  const tabs: { id: TabType; label: string; icon: React.ElementType; available: boolean }[] = [
    {
      id: 'protocol',
      label: 'Итоговый протокол',
      icon: FileText,
      available: Boolean(protocolText),
    },
    {
      id: 'normalized',
      label: 'Нормализованный текст',
      icon: Sparkles,
      available: Boolean(normalizedText),
    },
    {
      id: 'raw',
      label: 'Исходная транскрибация',
      icon: AlignLeft,
      available: Boolean(rawText),
    },
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
      {/* Tab Navigation Header */}
      <div className="border-b border-slate-200 bg-slate-50/50 px-4 sm:px-6 pt-3 flex flex-wrap items-center justify-between gap-3">
        {/* Tab Buttons */}
        <div className="flex items-center gap-1 sm:gap-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                id={`tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                disabled={!tab.available}
                className={`flex items-center gap-2 px-3.5 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  isActive
                    ? 'border-indigo-600 text-indigo-600 bg-white rounded-t-lg -mb-[1px]'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Action Toolbar */}
        <div className="flex items-center gap-1.5 pb-2.5 sm:pb-0 flex-wrap">
          <button
            type="button"
            id="download-word-btn"
            onClick={handleDownloadWord}
            disabled={isExportingWord || !getCurrentText()}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer shadow-2xs ${
              wordExportSuccess
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white border-blue-600'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
            title="Сохранить протокол в документ Word (.docx) в кодировке UTF-8 с поддержкой кириллицы"
          >
            {isExportingWord ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                <span>Создание .docx...</span>
              </>
            ) : wordExportSuccess ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Word сохранен!</span>
              </>
            ) : (
              <>
                <FileDown className="w-3.5 h-3.5 text-white" />
                <span>Скачать Word</span>
                <span className="text-[10px] text-blue-200 font-mono font-normal">.docx</span>
              </>
            )}
          </button>

          <button
            type="button"
            id="download-md-btn"
            onClick={() => handleDownload('md')}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
            title="Скачать файл Markdown"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden sm:inline">Скачать</span>
            <span className="text-[10px] text-slate-400 font-mono">.md</span>
          </button>

          <button
            type="button"
            id="copy-text-btn"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
            title="Скопировать в буфер обмена"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-700">Скопировано</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-500" />
                <span>Копировать</span>
              </>
            )}
          </button>

          <button
            type="button"
            id="print-btn"
            onClick={handlePrint}
            className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
            title="Распечатать или сохранить в PDF"
          >
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            <span>Печать</span>
          </button>

          {onReset && (
            <button
              type="button"
              id="new-recording-btn"
              onClick={onReset}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors ml-1"
              title="Загрузить новое совещание"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Новое</span>
            </button>
          )}
        </div>
      </div>

      {/* Content Body */}
      <div className="p-6 sm:p-8 min-h-[360px]">
        {activeTab === 'protocol' && (
          <div id="protocol-content" className="space-y-4">
            {protocolText ? (
              <div className="prose prose-slate max-w-none prose-headings:text-slate-900 prose-headings:font-bold prose-h1:text-xl prose-h2:text-base prose-h2:mt-6 prose-h2:mb-2 prose-h2:pb-1 prose-h2:border-b prose-h2:border-slate-100 prose-p:text-slate-700 prose-p:text-sm prose-li:text-sm prose-li:text-slate-700">
                <Markdown>{protocolText}</Markdown>
              </div>
            ) : (
              <div className="text-center py-12 text-slate-400 text-sm">
                Формирование протокола еще не завершено...
              </div>
            )}
          </div>
        )}

        {activeTab === 'normalized' && (
          <div id="normalized-content" className="space-y-4">
            {normalizedText ? (
              <div className="text-slate-800 text-sm leading-relaxed whitespace-pre-wrap font-normal">
                {normalizedText}
              </div>
            ) : (
              <div className="text-center py-12 text-slate-400 text-sm">
                Нормализация текста еще выполняется...
              </div>
            )}
          </div>
        )}

        {activeTab === 'raw' && (
          <div id="raw-content" className="space-y-4">
            {rawText ? (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 text-slate-700 text-sm leading-relaxed whitespace-pre-wrap font-mono">
                {rawText}
              </div>
            ) : (
              <div className="text-center py-12 text-slate-400 text-sm">
                Исходная стенограмма еще не получена от сервиса распознавания...
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer statistics */}
      <div className="border-t border-slate-100 bg-slate-50/50 px-6 py-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <div className="flex flex-wrap items-center gap-2">
          <span>Слов: {wordCount(getCurrentText())}</span>
          <span className="text-slate-300">•</span>
          <span>Символов: {getCurrentText().length}</span>
          {taskId && !taskId.startsWith('temp_') && (
            <>
              <span className="text-slate-300">•</span>
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-white rounded border border-slate-200 text-[11px] font-mono text-slate-700">
                <span className="text-slate-400 font-sans">task_id:</span>
                <span className="text-indigo-600 font-semibold select-all">{taskId}</span>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(taskId);
                      setCopiedTaskId(true);
                      setTimeout(() => setCopiedTaskId(false), 2000);
                    } catch {
                      // ignore
                    }
                  }}
                  className="p-0.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600"
                  title="Скопировать task_id"
                >
                  {copiedTaskId ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            </>
          )}
        </div>
        <div className="text-[11px] text-slate-400">
          {activeTab === 'protocol'
            ? 'Сформировано по стандартам Ю-Терм'
            : activeTab === 'normalized'
            ? 'Текст нормализован без искажения смысла'
            : 'Точный результат модели GigaAM-v3'}
        </div>
      </div>
    </div>
  );
}
