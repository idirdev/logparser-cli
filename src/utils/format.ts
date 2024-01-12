import chalk from "chalk";
import { LogEntry } from "../index";

/**
 * Color a log level string for terminal display.
 */
export function colorLevel(level: string): string {
  switch (level.toLowerCase()) {
    case "fatal":
    case "critical":
      return chalk.bgRed.white.bold(` ${level.toUpperCase()} `);
    case "error":
    case "err":
      return chalk.red.bold(level.toUpperCase().padEnd(5));
    case "warn":
    case "warning":
      return chalk.yellow.bold(level.toUpperCase().padEnd(5));
    case "info":
      return chalk.cyan(level.toUpperCase().padEnd(5));
    case "debug":
      return chalk.gray(level.toUpperCase().padEnd(5));
    case "trace":
      return chalk.dim(level.toUpperCase().padEnd(5));
    default:
      return chalk.white(level.toUpperCase().padEnd(5));
  }
}

/**
 * Format a timestamp for display.
 */
export function formatTimestamp(date: Date | null): string {
  if (!date) return chalk.gray("---".padEnd(19));

  const iso = date.toISOString().replace("T", " ").replace("Z", "");
  return chalk.gray(iso.substring(0, 19));
}

/**
 * Format an HTTP status code with appropriate color.
 */
export function colorStatus(status: number | undefined): string {
  if (status === undefined) return chalk.gray("---");

  const str = String(status);
  if (status >= 500) return chalk.red.bold(str);
  if (status >= 400) return chalk.yellow(str);
  if (status >= 300) return chalk.cyan(str);
  if (status >= 200) return chalk.green(str);
  return chalk.white(str);
}

/**
 * Format a single log entry as a table row.
 */
export function formatTableRow(entry: LogEntry): string {
  const parts: string[] = [];

  // Line number
  parts.push(chalk.gray(String(entry.lineNumber).padStart(6)));

  // Timestamp
  parts.push(formatTimestamp(entry.timestamp));

  // Level
  parts.push(colorLevel(entry.level));

  // Status code (if HTTP log)
  if (entry.status !== undefined) {
    parts.push(colorStatus(entry.status));
  }

  // Method + Path (if HTTP log)
  if (entry.method) {
    const methodColor = getMethodColor(entry.method);
    parts.push(methodColor(entry.method.padEnd(6)));
    if (entry.path) {
      const truncatedPath =
        entry.path.length > 40
          ? entry.path.substring(0, 37) + "..."
          : entry.path;
      parts.push(chalk.white(truncatedPath));
    }
  } else {
    // General message
    const truncatedMsg =
      entry.message.length > 80
        ? entry.message.substring(0, 77) + "..."
        : entry.message;
    parts.push(chalk.white(truncatedMsg));
  }

  return parts.join("  ");
}

/**
 * Format entries as a table with a header.
 */
export function formatTable(entries: LogEntry[]): string {
  if (entries.length === 0) {
    return chalk.yellow("\n  No entries found.\n");
  }

  const isHttp = entries.some((e) => e.status !== undefined);

  const lines: string[] = [""];

  // Header
  if (isHttp) {
    lines.push(
      chalk.gray(
        `${"LINE".padStart(6)}  ${"TIMESTAMP".padEnd(19)}  ${"LEVEL".padEnd(5)}  ${"ST".padEnd(3)}  ${"METHOD".padEnd(6)}  PATH`
      )
    );
  } else {
    lines.push(
      chalk.gray(
        `${"LINE".padStart(6)}  ${"TIMESTAMP".padEnd(19)}  ${"LEVEL".padEnd(5)}  MESSAGE`
      )
    );
  }
  lines.push(chalk.gray("-".repeat(90)));

  for (const entry of entries) {
    lines.push(formatTableRow(entry));
  }

  lines.push(chalk.gray("-".repeat(90)));
  lines.push(chalk.gray(`  ${entries.length} entries`));
  lines.push("");

  return lines.join("\n");
}

/**
 * Format entries as CSV.
 */
export function formatCsv(entries: LogEntry[]): string {
  const headers = [
    "line",
    "timestamp",
    "level",
    "status",
    "method",
    "path",
    "message",
    "ip",
    "size",
    "response_time",
  ];

  const lines: string[] = [headers.join(",")];

  for (const entry of entries) {
    const row = [
      entry.lineNumber,
      entry.timestamp?.toISOString() || "",
      entry.level,
      entry.status || "",
      entry.method || "",
      csvEscape(entry.path || ""),
      csvEscape(entry.message),
      entry.ip || "",
      entry.size || "",
      entry.responseTime || "",
    ];
    lines.push(row.join(","));
  }

  return lines.join("\n");
}

/**
 * Escape a string for CSV output.
 */
function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Format entries as JSON.
 */
export function formatJson(entries: LogEntry[]): string {
  const cleaned = entries.map((entry) => ({
    line: entry.lineNumber,
    timestamp: entry.timestamp?.toISOString() || null,
    level: entry.level,
    message: entry.message,
    source: entry.source,
    ...(entry.ip && { ip: entry.ip }),
    ...(entry.method && { method: entry.method }),
    ...(entry.path && { path: entry.path }),
    ...(entry.status !== undefined && { status: entry.status }),
    ...(entry.size !== undefined && { size: entry.size }),
    ...(entry.responseTime !== undefined && {
      responseTime: entry.responseTime,
    }),
  }));

  return JSON.stringify(cleaned, null, 2);
}

/**
 * Get a chalk color function for an HTTP method.
 */
function getMethodColor(method: string): chalk.Chalk {
  switch (method.toUpperCase()) {
    case "GET":
      return chalk.green;
    case "POST":
      return chalk.blue;
    case "PUT":
    case "PATCH":
      return chalk.yellow;
    case "DELETE":
      return chalk.red;
    case "OPTIONS":
    case "HEAD":
      return chalk.gray;
    default:
      return chalk.white;
  }
}

/**
 * Highlight a pattern within a string.
 */
export function highlightText(text: string, pattern: string): string {
  if (!pattern) return text;

  try {
    const regex = new RegExp(`(${pattern})`, "gi");
    return text.replace(regex, chalk.bgYellow.black("$1"));
  } catch {
    return text;
  }
}
