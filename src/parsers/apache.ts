import { LogEntry } from "../index";

/**
 * Apache Combined Log Format parser.
 * Parses the standard Apache/httpd combined log format:
 *   %h %l %u %t "%r" %>s %b "%{Referer}i" "%{User-Agent}i"
 *
 * Example:
 *   192.168.1.1 - frank [10/Oct/2024:13:55:36 -0700] "GET /index.html HTTP/1.1" 200 2326 "http://example.com" "Mozilla/5.0..."
 */

// Combined log format regex
const APACHE_COMBINED_REGEX =
  /^(\S+)\s+(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+"([^"]*)"?\s+(\d{3})\s+(\d+|-)\s*(?:"([^"]*)")?\s*(?:"([^"]*)")?/;

// Common log format regex (without referer and user-agent)
const APACHE_COMMON_REGEX =
  /^(\S+)\s+(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+"([^"]*)"?\s+(\d{3})\s+(\d+|-)/;

/**
 * Parse a single line of Apache log format.
 * Tries combined format first, falls back to common format.
 */
export function parseApacheLine(
  line: string,
  lineNumber: number
): LogEntry | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Try combined format first
  let match = trimmed.match(APACHE_COMBINED_REGEX);
  let isCombined = true;

  if (!match) {
    match = trimmed.match(APACHE_COMMON_REGEX);
    isCombined = false;
  }

  if (!match) {
    return null;
  }

  const [, ip, , user, dateStr, request, statusStr, sizeStr, referer, userAgent] =
    match;

  // Parse the request line "METHOD /path HTTP/version"
  const requestParts = (request || "").split(" ");
  const method = requestParts[0] || "";
  const requestPath = requestParts[1] || "";

  // Parse the Apache date format: 10/Oct/2024:13:55:36 -0700
  const timestamp = parseApacheDate(dateStr);

  // Determine log level from status code
  const status = parseInt(statusStr, 10);
  const level = statusToLevel(status);

  const size = sizeStr === "-" ? 0 : parseInt(sizeStr, 10);

  return {
    timestamp,
    level,
    message: request || trimmed,
    source: "apache",
    ip: ip !== "-" ? ip : undefined,
    method: method || undefined,
    path: requestPath || undefined,
    status,
    size,
    userAgent: isCombined && userAgent ? userAgent : undefined,
    raw: trimmed,
    lineNumber,
  };
}

/**
 * Parse Apache date format: DD/Mon/YYYY:HH:MM:SS +ZZZZ
 */
function parseApacheDate(dateStr: string): Date | null {
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

/**
 * Map HTTP status code to a log level string.
 */
function statusToLevel(status: number): string {
  if (status >= 500) return "error";
  if (status >= 400) return "warn";
  if (status >= 300) return "info";
  if (status >= 200) return "info";
  return "debug";
}

/**
 * Check if a line looks like Apache log format.
 */
export function isApacheFormat(line: string): boolean {
  return (
    APACHE_COMBINED_REGEX.test(line.trim()) ||
    APACHE_COMMON_REGEX.test(line.trim())
  );
}
