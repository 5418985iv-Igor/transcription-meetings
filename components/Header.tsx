'use client';

import React from 'react';
import { FileText, CheckCircle2, AlertCircle, RefreshCw, Activity } from 'lucide-react';

interface HeaderProps {
  serverOnline?: boolean | null;
  onRefreshHealth?: () => void;
  isCheckingHealth?: boolean;
}

export function Header({ serverOnline, onRefreshHealth, isCheckingHealth }: HeaderProps) {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-sm shadow-indigo-200">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 text-lg tracking-tight">Ю-Терм</span>
              <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100">
                Протоколы совещаний
              </span>
            </div>
            <p className="text-xs text-slate-500 hidden sm:block">
              Разговор закончился — результат остался
            </p>
          </div>
        </div>

        {/* Server Status indicator & Health Check button */}
        <div className="flex items-center gap-2.5">
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

          {serverOnline === null ? (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
              <span className="w-2 h-2 rounded-full bg-slate-400 animate-pulse" />
              Подключение...
            </div>
          ) : serverOnline ? (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>GigaSTT онлайн</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
              <span>Сервер офлайн</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
