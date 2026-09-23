'use client';

import React from 'react';
import { FileText, Activity, RotateCcw } from 'lucide-react';

interface HeaderProps {
  serverOnline?: boolean | null;
  onRefreshHealth?: () => void;
  isCheckingHealth?: boolean;
  onNewRecording?: () => void;
  hasActiveTask?: boolean;
}

export function Header({
  serverOnline,
  onRefreshHealth,
  isCheckingHealth,
  onNewRecording,
  hasActiveTask,
}: HeaderProps) {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-2">
        {/* Brand */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-sm shadow-indigo-200 shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 text-lg tracking-tight truncate">
                Ю-Терм. Протоколы совещаний
              </span>
            </div>
            <p className="text-xs text-slate-500 hidden sm:block truncate">
              Разговор закончился — результат остался
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          {onNewRecording && (
            <button
              type="button"
              id="header-new-btn"
              onClick={onNewRecording}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-2xs active:scale-95 ${
                hasActiveTask
                  ? 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white shadow-indigo-200'
                  : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/70'
              }`}
              title="Загрузить новый протокол"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Новый протокол</span>
            </button>
          )}

          {onRefreshHealth && (
            <button
              type="button"
              id="header-check-health-btn"
              onClick={onRefreshHealth}
              disabled={isCheckingHealth}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 transition-colors disabled:opacity-60"
              title="Проверить доступность сервера"
            >
              <Activity className={`w-3.5 h-3.5 text-indigo-600 ${isCheckingHealth ? 'animate-spin' : ''}`} />
              <span className="hidden md:inline">Проверить сервер</span>
              <span
                className={`w-2 h-2 rounded-full ${
                  serverOnline === true
                    ? 'bg-emerald-500'
                    : serverOnline === false
                    ? 'bg-red-500'
                    : 'bg-slate-400'
                }`}
              />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
