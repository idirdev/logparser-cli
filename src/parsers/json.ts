import { LogEntry } from "../index";

/**
 * JSON log parser.
 * Handles structured JSON log lines (one JSON object per line, aka NDJSON).
 * Supports common logging library formats:
 *   - Pino / Bunyan: { "level": 30, "time": 1234567890, "msg": "..." }
 *   - Winston: { "level": "info", "message": "...", "timestamp": "..." }
 *   - Generic: { "level": "...", "message": "...", "timestamp": "..." }
 */

// Pino/Bunyan numeric level mapping
const PINO_LEVELS: Record<number, string> = {
  10: "trace",
  20: "debug",
  30: "info",
  40: "warn",
  50: "error",
  60: "fatal",
};

/**
 * Parse a single JSON log line.
 * Handles various field naming conventions across different logging libraries.
 */
export function parseJsonLine(
  line: string,
  lineNumber: number
): LogEntry | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let obj: Record<string, any>;
  try {
    obj = JSON.parse(trimmed);
  } catch {
    return null;
  }

  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return null;
  }

  // Extract timestamp from various field names
  const timestamp = extractTimestamp(obj);

  // Extract log level
  const level = extractLevel(obj);

  // Extract message
  const message = extractMessage(obj);

  // Extract HTTP-specific fields if present
  const ip = obj.ip || obj.remoteAddress || obj.remote_addr || obj.clientIp;
  const method = obj.method || obj.httpMethod || obj.req?.method;
  const reqPath = obj.path || obj.url || obj.uri || obj.req?.url;
  const status =
    obj.status || obj.statusCode || obj.res?.statusCode || obj.responseCode;
  const size =
    obj.size ||
    obj.contentLength ||
    obj.content_length ||
    obj.res?.contentLength;
  const userAgent =
    obj.userAgent || obj.user_agent || obj.req?.headers?.["user-agent"];
  const responseTime =
    obj.responseTime || obj.response_time || obj.duration || obj.elapsed;

  return {
    timestamp,
    level,
    message,
    source: "json",
    ip: ip || undefined,
    method: method || undefined,
    path: reqPath || undefined,
    status: status ? parseInt(String(status), 10) : undefined,
    size: size ? parseInt(String(size), 10) : undefined,
    userAgent: userAgent || undefined,
    responseTime: responseTime ? parseFloat(String(responseTime)) : undefined,
    raw: trimmed,
    lineNumber,
  };
}

/**
 * Extract a timestamp from various common JSON log fields.
 */
function extractTimestamp(obj: Record<string, any>): Date | null {
  const candidates = [
    obj.timestamp,
    obj.time,
    obj.datetime,
    obj.date,
    obj["@timestamp"],
    obj.ts,
    obj.created_at,
    obj.createdAt,
  ];

  for (const val of candidates) {
    if (val === undefined || val === null) continue;

    // Numeric timestamp (Unix epoch in seconds or milliseconds)
    if (typeof val === "number") {
      const ms = val > 1e12 ? val : val * 1000;
      const date = new Date(ms);
      if (!isNaN(date.getTime())) return date;
    }

    // String timestamp
    if (typeof val === "string") {
      const date = new Date(val);
      if (!isNaN(date.getTime())) return date;
    }
  }

  return null;
}

/**
 * Extract log level from various JSON field conventions.
 */
function extractLevel(obj: Record<string, any>): string {
  const rawLevel = obj.level || obj.severity || obj.logLevel || obj.log_level;

  if (rawLevel === undefined || rawLevel === null) return "info";

  // Pino/Bunyan numeric levels
  if (typeof rawLevel === "number") {
    return PINO_LEVELS[rawLevel] || `level-${rawLevel}`;
  }

  // String levels
  const normalized = String(rawLevel).toLowerCase().trim();

  // Normalize common variations
  const levelMap: Record<string, string> = {
    err: "error",
    warning: "warn",
    critical: "fatal",
    crit: "fatal",
    emergency: "fatal",
    emerg: "fatal",
    notice: "info",
    verbose: "debug",
    silly: "trace",
  };

  return levelMap[normalized] || normalized;
}

/**
 * Extract the log message from various JSON field names.
 */
function extractMessage(obj: Record<string, any>): string {
  const candidates = [
    obj.message,
    obj.msg,
    obj.text,
    obj.log,
    obj.body,
    obj.description,
  ];

  for (const val of candidates) {
    if (val !== undefined && val !== null) {
      return String(val);
    }
  }

  // Fallback: stringify the entire object (excluding common metadata)
  const { timestamp, time, level, severity, ...rest } = obj;
  return JSON.stringify(rest);
}

/**
 * Check if a line looks like JSON log format.
 */
export function isJsonFormat(line: string): boolean {
  const trimmed = line.trim();
  const isObject = trimmed.startsWith("{") && trimmed.endsWith("}");
  const isArray = trimmed.startsWith("[") && trimmed.endsWith("]");
  if (!isObject && !isArray) return false;

  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}
