import { LogEntry } from "../index";

/**
 * Custom log parser that uses user-provided regex patterns.
 * Also handles common log formats that don't fit Apache/Nginx/JSON:
 *   - Syslog: "Mar  5 12:34:56 hostname process[pid]: message"
 *   - Simple timestamp: "2024-10-10 13:55:36 [INFO] message"
 *   - PM2/Node: "2024-10-10T13:55:36.000Z [INFO] [app] message"
 */

// Common patterns for auto-detection
const SYSLOG_REGEX =
  /^(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+(\S+)\s+([^\[:]+)(?:\[(\d+)\])?:\s*(.*)/;

const SIMPLE_TIMESTAMP_REGEX =
  /^(\d{4}[-/]\d{2}[-/]\d{2}[\sT]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)\s+\[?(\w+)\]?\s*(.*)/;

const BRACKETED_LEVEL_REGEX =
  /^(?:\[([^\]]+)\])?\s*\[(\w+)\]\s*(.*)/;

/**
 * Parse a line using a custom regex pattern.
 * Named capture groups are mapped to LogEntry fields:
 *   (?<timestamp>...) -> timestamp
 *   (?<level>...)     -> level
 *   (?<message>...)   -> message
 *   (?<ip>...)        -> ip
 *   (?<method>...)    -> method
 *   (?<path>...)      -> path
 *   (?<status>...)    -> status
 */
export function parseCustomLine(
  line: string,
  lineNumber: number,
  pattern: string | null
): LogEntry | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // If a custom pattern is provided, use it
  if (pattern) {
    return parseWithCustomRegex(trimmed, lineNumber, pattern);
  }

  // Try common patterns in order
  return (
    parseSyslog(trimmed, lineNumber) ||
    parseSimpleTimestamp(trimmed, lineNumber) ||
    parseBracketedLevel(trimmed, lineNumber) ||
    parsePlainText(trimmed, lineNumber)
  );
}

/**
 * Parse using a user-provided regex string.
 */
function parseWithCustomRegex(
  line: string,
  lineNumber: number,
  patternStr: string
): LogEntry | null {
  try {
    const regex = new RegExp(patternStr);
    const match = line.match(regex);

    if (!match) return null;

    const groups = match.groups || {};

    let timestamp: Date | null = null;
    if (groups.timestamp) {
      timestamp = new Date(groups.timestamp);
      if (isNaN(timestamp.getTime())) timestamp = null;
    }

    return {
      timestamp,
      level: (groups.level || "info").toLowerCase(),
      message: groups.message || line,
      source: "custom",
      ip: groups.ip || undefined,
      method: groups.method || undefined,
      path: groups.path || undefined,
      status: groups.status ? parseInt(groups.status, 10) : undefined,
      size: groups.size ? parseInt(groups.size, 10) : undefined,
      raw: line,
      lineNumber,
    };
  } catch (err: any) {
    // Invalid regex - return null
    return null;
  }
}

/**
 * Parse syslog format lines.
 * Example: "Mar  5 12:34:56 web-server nginx[1234]: GET /index.html 200"
 */
function parseSyslog(line: string, lineNumber: number): LogEntry | null {
  const match = line.match(SYSLOG_REGEX);
  if (!match) return null;

  const [, dateStr, hostname, process, pid, message] = match;

  // Syslog dates don't include year - assume current year
  const currentYear = new Date().getFullYear();
  const timestamp = new Date(`${dateStr} ${currentYear}`);

  // Try to detect level from message content
  const level = detectLevelFromMessage(message);

  return {
    timestamp: isNaN(timestamp.getTime()) ? null : timestamp,
    level,
    message: message.trim(),
    source: `syslog:${process.trim()}`,
    raw: line,
    lineNumber,
  };
}

/**
 * Parse simple timestamp format.
 * Example: "2024-10-10 13:55:36 [INFO] Server started on port 3000"
 */
function parseSimpleTimestamp(
  line: string,
  lineNumber: number
): LogEntry | null {
  const match = line.match(SIMPLE_TIMESTAMP_REGEX);
  if (!match) return null;

  const [, dateStr, level, message] = match;
  const timestamp = new Date(dateStr);

  return {
    timestamp: isNaN(timestamp.getTime()) ? null : timestamp,
    level: level.toLowerCase(),
    message: message.trim(),
    source: "custom",
    raw: line,
    lineNumber,
  };
}

/**
 * Parse bracketed level format (no timestamp).
 * Example: "[ERROR] Failed to connect to database"
 */
function parseBracketedLevel(
  line: string,
  lineNumber: number
): LogEntry | null {
  const match = line.match(BRACKETED_LEVEL_REGEX);
  if (!match) return null;

  const [, possibleTimestamp, level, message] = match;

  let timestamp: Date | null = null;
  if (possibleTimestamp) {
    timestamp = new Date(possibleTimestamp);
    if (isNaN(timestamp.getTime())) timestamp = null;
  }

  return {
    timestamp,
    level: level.toLowerCase(),
    message: message.trim(),
    source: "custom",
    raw: line,
    lineNumber,
  };
}

/**
 * Fallback parser for plain text lines.
 */
function parsePlainText(line: string, lineNumber: number): LogEntry {
  const level = detectLevelFromMessage(line);

  return {
    timestamp: null,
    level,
    message: line,
    source: "plain",
    raw: line,
    lineNumber,
  };
}

/**
 * Detect log level from message content by scanning for keywords.
 */
function detectLevelFromMessage(message: string): string {
  const lower = message.toLowerCase();

  if (
    lower.includes("error") ||
    lower.includes("exception") ||
    lower.includes("fatal") ||
    lower.includes("critical")
  ) {
    return "error";
  }
  if (lower.includes("warn") || lower.includes("warning")) {
    return "warn";
  }
  if (lower.includes("debug") || lower.includes("trace")) {
    return "debug";
  }

  return "info";
}

/**
 * Check if a line matches syslog format.
 */
export function isSyslogFormat(line: string): boolean {
  return SYSLOG_REGEX.test(line.trim());
}
