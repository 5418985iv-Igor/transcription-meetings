import fs from 'fs';
import path from 'path';

export type TaskStatus =
  | 'uploading'
  | 'transcribing'
  | 'normalizing'
  | 'summarizing'
  | 'completed'
  | 'error';

export interface TaskRecord {
  id: string;
  clientTaskId?: string;
  status: TaskStatus;
  fastApiStatus?: 'queued' | 'processing' | 'completed' | 'failed';
  fileName: string;
  fileSize: number;
  rawText?: string;
  normalizedText?: string;
  protocolText?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
  stepMessage?: string;
}

// Global in-memory storage to survive hot reloads in Next.js development
const globalStore = globalThis as unknown as {
  __taskStore?: Map<string, TaskRecord>;
  __taskStoreInitialized?: boolean;
};

if (!globalStore.__taskStore) {
  globalStore.__taskStore = new Map<string, TaskRecord>();
}

const tasks = globalStore.__taskStore;

const DATA_DIR = process.env.DATA_DIR?.trim() || path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'tasks.json');

function persistToDisk() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const array = Array.from(tasks.values());
    fs.writeFileSync(DATA_FILE, JSON.stringify(array, null, 2), 'utf-8');
  } catch (err) {
    console.error('[TaskStore] Failed to persist tasks to disk:', err);
  }
}

function sanitizeAndDeduplicate() {
  // Remove orphan temp_ tasks that have matching real UUID tasks
  const list = Array.from(tasks.values());
  const realTasks = list.filter((t) => !t.id.startsWith('temp_'));

  for (const t of list) {
    if (t.id.startsWith('temp_')) {
      // Look for a real task with matching clientTaskId or matching fileName created within 15 minutes
      const match = realTasks.find(
        (r) =>
          r.clientTaskId === t.id ||
          (r.fileName === t.fileName && Math.abs(r.createdAt - t.createdAt) < 15 * 60 * 1000)
      );

      if (match) {
        // Transfer any rawText or metadata to real task if missing
        if (!match.clientTaskId) {
          match.clientTaskId = t.id;
        }
        tasks.delete(t.id);
      }
    }
  }
}

function loadFromDisk(force = false) {
  if (globalStore.__taskStoreInitialized && !force) return;
  globalStore.__taskStoreInitialized = true;

  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const loaded = JSON.parse(raw) as TaskRecord[];
      if (Array.isArray(loaded)) {
        for (const item of loaded) {
          if (item && item.id) {
            tasks.set(item.id, item);
          }
        }
        sanitizeAndDeduplicate();
        persistToDisk();
      }
    }
  } catch (err) {
    console.error('[TaskStore] Failed to load tasks from disk:', err);
  }
}

// Ensure loaded on boot
loadFromDisk();

export function saveTask(record: TaskRecord): void {
  record.updatedAt = Date.now();
  tasks.set(record.id, record);
  sanitizeAndDeduplicate();
  persistToDisk();
}

export function getTask(id: string): TaskRecord | undefined {
  loadFromDisk();
  let found = tasks.get(id);
  if (!found) {
    loadFromDisk(true);
    found = tasks.get(id);
  }
  return found;
}

/**
 * Finds a task by its real ID, its clientTaskId alias, or auto-resolves a temp_ ID
 * to any matching real task with the same fileName and close creation time.
 */
export function findTask(idOrAlias: string): TaskRecord | undefined {
  loadFromDisk();
  if (!idOrAlias) return undefined;

  let direct = getTask(idOrAlias);
  if (direct && !direct.id.startsWith('temp_')) {
    return direct;
  }

  // 2. Match by clientTaskId
  for (const t of tasks.values()) {
    if (t.clientTaskId === idOrAlias) {
      return t;
    }
  }

  // Reload once more in case clientTaskId was stored on disk
  loadFromDisk(true);
  for (const t of tasks.values()) {
    if (t.clientTaskId === idOrAlias) {
      return t;
    }
  }

  // 3. Auto-resolve temp_ ID to a real task
  if (idOrAlias.startsWith('temp_')) {
    const list = Array.from(tasks.values()).filter((t) => !t.id.startsWith('temp_'));
    // If we have a direct temp task with fileName, use its fileName and createdAt
    const tempRec = direct;
    if (tempRec) {
      const match = list.find(
        (r) =>
          r.fileName === tempRec.fileName &&
          Math.abs(r.createdAt - tempRec.createdAt) < 15 * 60 * 1000
      );
      if (match) {
        match.clientTaskId = idOrAlias;
        tasks.delete(idOrAlias);
        persistToDisk();
        return match;
      }
    }

    // Try finding by parsing timestamp from temp_TIMESTAMP
    const tsPart = parseInt(idOrAlias.replace('temp_', ''), 10);
    if (!isNaN(tsPart) && tsPart > 0) {
      const match = list.find((r) => Math.abs(r.createdAt - tsPart) < 15 * 60 * 1000);
      if (match) {
        match.clientTaskId = idOrAlias;
        if (direct) tasks.delete(idOrAlias);
        persistToDisk();
        return match;
      }
    }
  }

  return direct;
}

/**
 * Explicitly associates an old/temp ID with a real task ID, transferring any details
 */
export function linkTasks(oldId: string, realTaskId: string): TaskRecord | undefined {
  loadFromDisk();
  const oldTask = tasks.get(oldId);
  let realTask = tasks.get(realTaskId);

  if (!realTask) {
    realTask = {
      id: realTaskId,
      clientTaskId: oldId,
      status: 'transcribing',
      fileName: oldTask?.fileName || 'Аудиозапись',
      fileSize: oldTask?.fileSize || 0,
      createdAt: oldTask?.createdAt || Date.now(),
      updatedAt: Date.now(),
      stepMessage: 'Возобновление проверки задачи на сервере...',
    };
    tasks.set(realTaskId, realTask);
  } else {
    realTask.clientTaskId = oldId;
    if (oldTask?.fileName && (!realTask.fileName || realTask.fileName === 'Аудиозапись')) {
      realTask.fileName = oldTask.fileName;
    }
  }

  if (oldId !== realTaskId && tasks.has(oldId)) {
    tasks.delete(oldId);
  }

  persistToDisk();
  return realTask;
}

export function updateTask(
  id: string,
  partial: Partial<Omit<TaskRecord, 'id' | 'createdAt'>>
): TaskRecord | undefined {
  loadFromDisk();
  const existing = tasks.get(id);
  if (!existing) return undefined;

  const updated: TaskRecord = {
    ...existing,
    ...partial,
    updatedAt: Date.now(),
  };

  tasks.set(id, updated);
  persistToDisk();
  return updated;
}

export function deleteTask(id: string): boolean {
  loadFromDisk();
  const deleted = tasks.delete(id);
  if (deleted) {
    persistToDisk();
  }
  return deleted;
}

export function clearAllTasks(): void {
  tasks.clear();
  persistToDisk();
}

export function getAllTasks(): TaskRecord[] {
  loadFromDisk();
  return Array.from(tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
}

