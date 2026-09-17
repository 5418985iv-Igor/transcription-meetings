'use client';

import { TaskRecord } from '@/lib/tasks/store';

const STORAGE_KEY = 'meeting_transcriptions_history_v1';

/**
 * Safely reads tasks history from localStorage
 */
export function loadHistoryFromStorage(): TaskRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // Auto-filter out stale errored temp_ tasks that don't have text
      const cleaned = parsed.filter((t) => {
        if (t.id && t.id.startsWith('temp_') && !t.rawText && t.status === 'error') {
          return false;
        }
        return true;
      });
      return cleaned.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }
  } catch (err) {
    console.error('[HistoryStorage] Failed to read history from localStorage:', err);
  }
  return [];
}

/**
 * Safely persists tasks history to localStorage
 */
export function saveHistoryToStorage(tasks: TaskRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    // Keep max 50 recent records in local storage
    const trimmed = tasks.slice(0, 50);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch (err) {
    console.error('[HistoryStorage] Failed to save history to localStorage:', err);
  }
}

/**
 * Replaces an old task (e.g. temp_ ID) with a new task (e.g. real task ID)
 */
export function replaceTaskInStorage(oldId: string, newTask: TaskRecord): TaskRecord[] {
  const current = loadHistoryFromStorage();
  const withoutOld = current.filter((t) => t.id !== oldId && t.id !== newTask.id);
  const updatedList = [newTask, ...withoutOld].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  saveHistoryToStorage(updatedList);
  return updatedList;
}

/**
 * Adds or updates a task record in localStorage history
 */
export function upsertTaskInStorage(task: TaskRecord): TaskRecord[] {
  const current = loadHistoryFromStorage();
  // If this task has a clientTaskId (or replaces an old temp_ task)
  const existingIdx = current.findIndex(
    (t) => t.id === task.id || (task.clientTaskId && t.id === task.clientTaskId)
  );

  let updatedList: TaskRecord[];
  if (existingIdx >= 0) {
    // Deep merge to not lose previously loaded text if an update only carries status
    const existing = current[existingIdx];
    const merged: TaskRecord = {
      ...existing,
      ...task,
      rawText: task.rawText || existing.rawText,
      normalizedText: task.normalizedText || existing.normalizedText,
      protocolText: task.protocolText || existing.protocolText,
      fileName: task.fileName || existing.fileName,
      fileSize: task.fileSize || existing.fileSize,
      updatedAt: Date.now(),
    };
    updatedList = [...current];
    updatedList[existingIdx] = merged;
  } else {
    updatedList = [task, ...current];
  }

  saveHistoryToStorage(updatedList);
  return updatedList;
}

/**
 * Removes a task from localStorage
 */
export function removeTaskFromStorage(taskId: string): TaskRecord[] {
  const current = loadHistoryFromStorage();
  const filtered = current.filter((t) => t.id !== taskId);
  saveHistoryToStorage(filtered);
  return filtered;
}

/**
 * Clears all history from localStorage
 */
export function clearStorageHistory(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Exports current history as a downloadable JSON file
 */
export function exportHistoryAsJson(tasks: TaskRecord[]): void {
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(tasks, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', dataStr);
  downloadAnchor.setAttribute(
    'download',
    `meeting_protocols_history_${new Date().toISOString().slice(0, 10)}.json`
  );
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}
