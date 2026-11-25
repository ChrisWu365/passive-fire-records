export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** Extra fields for a log line. Never put tokens, passwords or request bodies here. */
export type LogContext = Record<string, string | number | boolean | null | undefined>;

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}

type LineWriter = (line: string) => void;

/**
 * Writes one JSON object per line: time, level, message, then the context fields.
 * Lines below the configured level are dropped. warn and error go to stderr.
 */
export class JsonLogger implements Logger {
  constructor(
    private readonly minimumLevel: LogLevel,
    private readonly writeOut: LineWriter = (line) => void process.stdout.write(`${line}\n`),
    private readonly writeError: LineWriter = (line) => void process.stderr.write(`${line}\n`)
  ) {}

  debug(message: string, context?: LogContext): void {
    this.write('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.write('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.write('warn', message, context);
  }

  error(message: string, context?: LogContext): void {
    this.write('error', message, context);
  }

  private write(level: LogLevel, message: string, context: LogContext = {}): void {
    if (LOG_LEVELS.indexOf(level) < LOG_LEVELS.indexOf(this.minimumLevel)) return;
    const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...context });
    (level === 'warn' || level === 'error' ? this.writeError : this.writeOut)(line);
  }
}

/** Discards everything; for tests and for callers that do not care. */
export const SILENT_LOGGER: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

/** A short, safe description of a caught value for a log line: its name and message, never its stack. */
export function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
