import { config } from "../config";

type LogLevel = "debug" | "info" | "warn" | "error";
type LogContext = Record<string, unknown>;

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[config.LOG_LEVEL];
}

function write(level: LogLevel, msg: string, ctx: LogContext): void {
  if (!shouldLog(level)) return;
  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    msg,
    ...ctx,
  });
  if (level === "error" || level === "warn") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

export const logger = {
  debug: (ctx: LogContext, msg: string) => write("debug", msg, ctx),
  info: (ctx: LogContext, msg: string) => write("info", msg, ctx),
  warn: (ctx: LogContext, msg: string) => write("warn", msg, ctx),
  error: (ctx: LogContext, msg: string) => write("error", msg, ctx),

  child: (base: LogContext) => ({
    debug: (ctx: LogContext, msg: string) => write("debug", msg, { ...base, ...ctx }),
    info: (ctx: LogContext, msg: string) => write("info", msg, { ...base, ...ctx }),
    warn: (ctx: LogContext, msg: string) => write("warn", msg, { ...base, ...ctx }),
    error: (ctx: LogContext, msg: string) => write("error", msg, { ...base, ...ctx }),
  }),
};
