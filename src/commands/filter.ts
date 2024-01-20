import * as fs from "fs";
import chalk from "chalk";
import { LogEntry, LogFormat } from "../index";
import { parseApacheLine } from "../parsers/apache";
import { parseNginxLine } from "../parsers/nginx";
import { parseJsonLine } from "../parsers/json";
import { parseCustomLine } from "../parsers/custom";
import { formatTable, formatJson, formatCsv } from "../utils/format";

interface FilterOptions {
  format: LogFormat;
  levels: string[];
  statusCodes: number[];
  ips: string[];
  methods: string[];
  pathPattern: string | null;
  from: Date | null;
  to: Date | null;
  contains: string | null;
  notContains: string | null;
  output: string;
  countOnly: boolean;
}

/**
 * Filter log entries by multiple criteria.
 * All filters are combined with AND logic (all must match).
 * Reads the entire file, parses each line, then applies filters.
 */
export async function filterCommand(
  filePath: string,
  options: FilterOptions
): Promise<void> {
  if (!fs.existsSync(filePath)) {
    console.error(chalk.red(`Error: File "${filePath}" does not exist.`));
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim());

  if (lines.length === 0) {
    console.log(chalk.yellow("\n  The log file is empty.\n"));
    return;
  }

  // Parse all lines
  const allEntries: LogEntry[] = [];
  for (let i = 0; i < lines.length; i++) {
    const entry = parseLine(lines[i], i + 1, options.format);
    if (entry) allEntries.push(entry);
  }

  // Apply filters
  const filtered = allEntries.filter((entry) => {
    // Level filter
    if (options.levels.length > 0) {
      if (!options.levels.includes(entry.level.toLowerCase())) {
        return false;
      }
    }

    // Status code filter
    if (options.statusCodes.length > 0) {
      if (entry.status === undefined) return false;
      if (!options.statusCodes.includes(entry.status)) return false;
    }

    // IP filter
    if (options.ips.length > 0) {
      if (!entry.ip || !options.ips.includes(entry.ip)) return false;
    }

    // Method filter
    if (options.methods.length > 0) {
      if (!entry.method) return false;
      if (
        !options.methods
          .map((m) => m.toUpperCase())
          .includes(entry.method.toUpperCase())
      ) {
        return false;
      }
    }

    // Path pattern filter
    if (options.pathPattern) {
      if (!entry.path) return false;
      try {
        const regex = new RegExp(options.pathPattern, "i");
        if (!regex.test(entry.path)) return false;
      } catch {
        if (!entry.path.includes(options.pathPattern)) return false;
      }
    }

    // Time range filters
    if (options.from && entry.timestamp) {
      if (entry.timestamp < options.from) return false;
    }
    if (options.to && entry.timestamp) {
      if (entry.timestamp > options.to) return false;
    }

    // Contains filter (searches raw line)
    if (options.contains) {
      if (!entry.raw.toLowerCase().includes(options.contains.toLowerCase())) {
        return false;
      }
    }

    // Not-contains filter
    if (options.notContains) {
      if (
        entry.raw.toLowerCase().includes(options.notContains.toLowerCase())
      ) {
        return false;
      }
    }

    return true;
  });

  // Output
  if (options.countOnly) {
    if (options.output === "json") {
      console.log(
        JSON.stringify({
          total: allEntries.length,
          matched: filtered.length,
          percentage: ((filtered.length / allEntries.length) * 100).toFixed(1),
        })
      );
    } else {
      console.log("");
      console.log(chalk.bold.cyan("  Filter Results"));
      console.log(chalk.gray("  " + "-".repeat(40)));
      console.log(
        `  Matched: ${chalk.bold.white(String(filtered.length))} / ${allEntries.length} entries`
      );
      console.log(
        `  Rate: ${chalk.bold(((filtered.length / allEntries.length) * 100).toFixed(1))}%`
      );
      console.log("");
    }
    return;
  }

  // Display header
  if (options.output === "table") {
    console.log("");
    console.log(chalk.bold.cyan("  Filtered Log Entries"));
    console.log(chalk.gray("  " + "-".repeat(50)));
    console.log(
      chalk.gray(
        `  ${filtered.length} of ${allEntries.length} entries match filters`
      )
    );
    printActiveFilters(options);
  }

  switch (options.output) {
    case "json":
      console.log(formatJson(filtered));
      break;
    case "csv":
      console.log(formatCsv(filtered));
      break;
    case "table":
    default:
      console.log(formatTable(filtered));
      break;
  }
}

/**
 * Display which filters are currently active.
 */
function printActiveFilters(options: FilterOptions): void {
  const filters: string[] = [];

  if (options.levels.length > 0)
    filters.push(`level: ${options.levels.join(", ")}`);
  if (options.statusCodes.length > 0)
    filters.push(`status: ${options.statusCodes.join(", ")}`);
  if (options.ips.length > 0) filters.push(`ip: ${options.ips.join(", ")}`);
  if (options.methods.length > 0)
    filters.push(`method: ${options.methods.join(", ")}`);
  if (options.pathPattern) filters.push(`path: /${options.pathPattern}/`);
  if (options.from) filters.push(`from: ${options.from.toISOString()}`);
  if (options.to) filters.push(`to: ${options.to.toISOString()}`);
  if (options.contains) filters.push(`contains: "${options.contains}"`);
  if (options.notContains)
    filters.push(`excludes: "${options.notContains}"`);

  if (filters.length > 0) {
    console.log(chalk.gray(`  Filters: ${filters.join(" AND ")}`));
  }
}

/**
 * Parse a single line with format auto-detection.
 */
function parseLine(
  line: string,
  lineNumber: number,
  format: LogFormat
): LogEntry | null {
  switch (format) {
    case "apache":
      return parseApacheLine(line, lineNumber);
    case "nginx":
      return parseNginxLine(line, lineNumber);
    case "json":
      return parseJsonLine(line, lineNumber);
    case "custom":
    case "auto":
    default:
      return parseCustomLine(line, lineNumber, null);
  }
}
