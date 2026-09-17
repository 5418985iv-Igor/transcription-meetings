'use client';

import React from 'react';
import { Server, Activity } from 'lucide-react';

export interface HealthCheckData {
  online: boolean;
  message?: string;
  url?: string;
  statusCode?: number;
  latencyMs?: number;
  data?: Record<string, unknown>;
  endpoints?: {
    health: string;
    transcriptions: string;
    tasks: string;
  };
}

interface ServerHealthWidgetProps {
  serverInfo: HealthCheckData | null;
  isLoading: boolean;
  onCheckHealth: () => void;
}

export function ServerHealthWidget({
  serverInfo,
  isLoading,
  onCheckHealth,
}: ServerHealthWidgetProps) {
  const isOnline = serverInfo?.online;

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden transition-all">
      {/* Top action bar */}
      <div className="p-4 sm:p-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              isOnline
                ? 'bg-emerald-50 text-emerald-600 border border-emerald-200/70'
                : isOnline === false
                ? 'bg-red-50 text-red-600 border border-red-200/70'
                : 'bg-slate-100 text-slate-500 border border-slate-200'
            }`}
          >
            <Server className="w-4.5 h-4.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-900">
                Сервер транскрибации GigaSTT (FastAPI)
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${
                  isOnline
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : isOnline === false
                    ? 'bg-red-50 text-red-700 border-red-200'
                    : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isOnline
                      ? 'bg-emerald-500 animate-pulse'
                      : isOnline === false
                      ? 'bg-red-500'
                      : 'bg-slate-400'
                  }`}
                />
                {isOnline ? 'Онлайн (200 OK)' : isOnline === false ? 'Офлайн' : 'Проверка...'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Модель распознавания речи GigaAM-v3
              {serverInfo?.latencyMs !== undefined && (
                <span className="ml-2 text-slate-400">
                  • ping {serverInfo.latencyMs} мс
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            type="button"
            id="check-server-health-btn"
            onClick={onCheckHealth}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 active:bg-indigo-200 border border-indigo-200 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <Activity className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{isLoading ? 'Проверка...' : 'Проверить доступность сервера'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
