import { appendFile } from 'fs/promises';
import { existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const LOG_DIR = join(
  process.env.XDG_DATA_HOME || join(process.env.HOME || homedir(), '.local', 'share'),
  'pi',
  'log',
);

let cachedLogFile: string | null = null;

function ensureLogDir(): boolean {
  try {
    if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

function findLogFile(): string | null {
  if (!ensureLogDir()) return null;
  try {
    const files = readdirSync(LOG_DIR)
      .filter((f) => f.endsWith('.log'))
      .map((f) => {
        const path = join(LOG_DIR, f);
        const stat = statSync(path);
        return { path, mtime: stat.mtime.getTime(), isFile: stat.isFile() };
      })
      .filter((f) => f.isFile)
      .sort((a, b) => b.mtime - a.mtime || a.path.localeCompare(b.path));

    return files[0]?.path ?? null;
  } catch {
    return null;
  }
}

function getLogFile(): string | null {
  if (cachedLogFile && existsSync(cachedLogFile)) return cachedLogFile;
  cachedLogFile = findLogFile();
  return cachedLogFile;
}

function formatLogLine(level: string, message: string): string {
  const timestamp = new Date().toISOString();
  return `${level.padEnd(5)} ${timestamp} +0ms service=cliproxy ${message}\n`;
}

/** Sanitize values before logging — never log API keys or bearer tokens. */
export function sanitizeForLog(value: string): string {
  return value
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/api[_-]?key["']?\s*[:=]\s*["']?[^\s"',}]+/gi, 'apiKey=[REDACTED]')
    .replace(/"key"\s*:\s*"[^"]+"/g, '"key":"[REDACTED]"')
    .replace(/\bsk-[a-zA-Z0-9_-]{8,}\b/g, 'sk-[REDACTED]');
}

/** Format unknown errors for safe logging. */
export function formatErrorForLog(error: unknown): string {
  if (error instanceof Error) {
    return sanitizeForLog(error.message);
  }
  return sanitizeForLog(String(error));
}

function write(level: 'WARN' | 'DEBUG' | 'INFO', message: string): void {
  if (level === 'DEBUG' && process.env.CLIPROXY_DEBUG !== '1') return;
  const logFile = getLogFile();
  if (!logFile) return;
  appendFile(logFile, formatLogLine(level, sanitizeForLog(message))).catch(() => {});
}

export function warn(message: string): void {
  write('WARN', message);
}

export function debug(message: string): void {
  write('DEBUG', message);
}
