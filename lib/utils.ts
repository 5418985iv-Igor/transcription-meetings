import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Resolves the configured base path (e.g. "/meetings") or empty string if running at root.
 * Supports build-time NEXT_PUBLIC_BASE_PATH / BASE_PATH and runtime browser pathname detection.
 */
export function getBasePath(): string {
  const envPath = (
    process.env.NEXT_PUBLIC_BASE_PATH ||
    process.env.BASE_PATH ||
    ''
  ).trim();

  if (envPath && envPath !== '/') {
    const withLeading = envPath.startsWith('/') ? envPath : `/${envPath}`;
    return withLeading.replace(/\/+$/, '');
  }

  // Runtime fallback in browser: if running under /meetings but env var was not provided
  if (typeof window !== 'undefined' && window.location?.pathname) {
    const pathname = window.location.pathname;
    if (pathname === '/meetings' || pathname.startsWith('/meetings/')) {
      return '/meetings';
    }
  }

  return '';
}

/**
 * Prepends the base path to a relative URL or API endpoint if needed.
 * E.g.: withBasePath('/api/tasks') => "/meetings/api/tasks" (or "/api/tasks" if BASE_PATH is empty)
 */
export function withBasePath(path: string): string {
  const base = getBasePath();
  if (!base) return path;

  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  // Avoid duplicate prefix if already prefixed
  if (cleanPath === base || cleanPath.startsWith(`${base}/`)) {
    return cleanPath;
  }

  return `${base}${cleanPath}`;
}
