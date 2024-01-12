import { LogEntry } from "../index";

/**
 * Nginx log format parser.
 * Handles the default Nginx combined log format and common variations.
 *
 * Default Nginx format:
 *   $remote_addr - $remote_user [$time_local] "$request" $status $body_bytes_sent "$http_referer" "$http_user_agent"
 *
 * Extended format (with response time):
 *   $remote_addr - $remote_user [$time_local] "$request" $status $body_bytes_sent "$http_referer" "$http_user_agent" $request_time
 */

const NGINX_COMBINED_REGEX =
  /^(\S+)\s+-\s+(\S+)\s+\[([^\]]+)\]\s+"([^"]*)"?\s+(\d{3})\s+(\d+|-)\s*"([^"]*)"\s*"([^"]*)"(?:\s+(\S+))?/;

const NGINX_ERROR_REGEX =
  /^(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2})\s+\[(\w+)\]\s+(\d+)#(\d+):\s*(?:\*(\d+)\s+)?(.+)/;

/**
 * Parse a single line of Nginx access log.
 */
export function parseNginxAccessLine(
  line: string,
  lineNumber: number
): LogEntry | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const match = trimmed.match(NGINX_COMBINED_REGEX);
  if (!match) return null;

  const [
    ,
    ip,
    user,
    dateStr,
    request,
    statusStr,
    sizeStr,
    referer,
    userAgent,
    responseTimeStr,
  ] = match;

  const requestParts = (request || "").split(" ");
  const method = requestParts[0] || "";
  const requestPath = requestParts[1] || "";

  const timestamp = parseNginxDate(dateStr);
  const status = parseInt(statusStr, 10);
  const level = statusToLevel(status);
  const size = sizeStr === "-" ? 0 : parseInt(sizeStr, 10);
  const responseTime = responseTimeStr
    ? parseFloat(responseTimeStr)
    : undefined;

  return {
    timestamp,
    level,
    message: request || trimmed,
    source: "nginx",
    ip: ip !== "-" ? ip : undefined,
    method: method || undefined,
    path: requestPath || undefined,
    status,
    size,
    userAgent: userAgent || undefined,
    responseTime,
    raw: trimmed,
    lineNumber,
  };
}

/**
 * Parse a single line of Nginx error log.
 * Format: YYYY/MM/DD HH:MM:SS [level] PID#TID: *CID message
 */
export function parseNginxErrorLine(
  line: string,
  lineNumber: number
): LogEntry | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const match = trimmed.match(NGINX_ERROR_REGEX);
  if (!match) return null;

  const [, dateStr, level, , , , message] = match;

  const timestamp = new Date(dateStr.replace("/", "-").replace("/", "-"));

  return {
    timestamp: isNaN(timestamp.getTime()) ? null : timestamp,
    level: level.toLowerCase(),
    message: message.trim(),
    source: "nginx-error",
    raw: trimmed,
    lineNumber,
  };
}

/**
 * Parse a Nginx line (auto-detect access vs error format).
 */
export function parseNginxLine(
  line: string,
  lineNumber: number
): LogEntry | null {
  // Try access log first
  const accessEntry = parseNginxAccessLine(line, lineNumber);
  if (accessEntry) return accessEntry;

  // Try error log
  const errorEntry = parseNginxErrorLine(line, lineNumber);
  if (errorEntry) return errorEntry;

  return null;
}

/**
 * Parse Nginx date format: DD/Mon/YYYY:HH:MM:SS +ZZZZ
 * (Same as Apache format)
 */
function parseNginxDate(dateStr: string): Date | null {
  const months: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };

  const match = dateStr.match(
    /(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})\s*([+-]\d{4})?/
  );

  if (!match) return null;

  const [, day, monthStr, year, hours, minutes, seconds] = match;
  const month = months[monthStr];
  if (month === undefined) return null;

  return new Date(
    parseInt(year),
    month,
    parseInt(day),
    parseInt(hours),
    parseInt(minutes),
    parseInt(seconds)
  );
}

function statusToLevel(status: number): string {
  if (status >= 500) return "error";
  if (status >= 400) return "warn";
  if (status >= 300) return "info";
  if (status >= 200) return "info";
  return "debug";
}

/**
 * Check if a line looks like Nginx log format.
 */
export function isNginxFormat(line: string): boolean {
  return (
    NGINX_COMBINED_REGEX.test(line.trim()) ||
    NGINX_ERROR_REGEX.test(line.trim())
  );
}
