import * as fs from "fs";
import chalk from "chalk";
import { LogEntry, LogFormat } from "../index";
import { parseApacheLine, isApacheFormat } from "../parsers/apache";
import { parseNginxLine, isNginxFormat } from "../parsers/nginx";
import { parseJsonLine, isJsonFormat } from "../parsers/json";
import { parseCustomLine } from "../parsers/custom";
import { formatTable, formatJson, formatCsv } from "../utils/format";

interface ParseOptions {
  format: LogFormat;
  lines: number;
  fromTail: boolean;
  output: string;
  customPattern: string | null;
}

/**
 * Parse a log file and display structured entries.
 * Auto-detects format if not specified, then applies the appropriate parser
 * to each line. Supports head/tail viewing and multiple output formats.
 */
export async function parseCommand(
  filePath: string,
  options: ParseOptions
): Promise<void> {
  // Validate file exists
  if (!fs.existsSync(filePath)) {
    console.error(chalk.red(`Error: File "${filePath}" does not exist.`));
    process.exit(1);
  }

  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    console.error(chalk.red(`Error: "${filePath}" is not a file.`));
    process.exit(1);
  }

  // Read the file
  const content = fs.readFileSync(filePath, "utf-8");
  const allLines = content.split("\n").filter((line) => line.trim());

  if (allLines.length === 0) {
    console.log(chalk.yellow("\n  The log file is empty.\n"));
    return;
  }

  // Detect format if set to auto
  const format =
    options.format === "auto" ? detectFormat(allLines) : options.format;

  // Select lines (head or tail)
  let selectedLines: string[];
  if (options.fromTail) {
    selectedLines = allLines.slice(-options.lines);
  } else {
    selectedLines = allLines.slice(0, options.lines);
  }

  // Calculate the starting line number
  const startLineNum = options.fromTail
    ? Math.max(1, allLines.length - options.lines + 1)
    : 1;

  // Parse each line
  const entries: LogEntry[] = [];
  for (let i = 0; i < selectedLines.length; i++) {
    const lineNum = startLineNum + i;
    const entry = parseLine(selectedLines[i], lineNum, format, options.customPattern);
    if (entry) {
      entries.push(entry);
    }
  }

  if (entries.length === 0) {
    console.log(
      chalk.yellow("\n  No parseable entries found. Try specifying a format with --format.\n")
    );
    return;
  }

  // Display header info (except for JSON/CSV output)
  if (options.output === "table") {
    console.log("");
    console.log(chalk.bold.cyan("  Log Parser Results"));
    console.log(chalk.gray("  " + "-".repeat(50)));
    console.log(chalk.gray(`  File: ${filePath}`));
    console.log(chalk.gray(`  Format: ${format}`));
    console.log(
      chalk.gray(
        `  Showing: ${entries.length} of ${allLines.length} lines (${options.fromTail ? "tail" : "head"})`
      )
    );
  }

  // Output in the requested format
  switch (options.output) {
    case "json":
      console.log(formatJson(entries));
      break;
    case "csv":
      console.log(formatCsv(entries));
      break;
    case "table":
    default:
      console.log(formatTable(entries));
      break;
  }
}

/**
 * Auto-detect the log format by sampling the first few non-empty lines.
 */
function detectFormat(lines: string[]): LogFormat {
  const sample = lines.slice(0, 5);

  let jsonCount = 0;
  let apacheCount = 0;
  let nginxCount = 0;

  for (const line of sample) {
    if (isJsonFormat(line)) jsonCount++;
    if (isApacheFormat(line)) apacheCount++;
    if (isNginxFormat(line)) nginxCount++;
  }

  if (jsonCount > apacheCount && jsonCount > nginxCount) return "json";
  if (nginxCount >= apacheCount && nginxCount > 0) return "nginx";
  if (apacheCount > 0) return "apache";

  return "custom";
}

/**
 * Parse a single line using the detected or specified format.
 */
function parseLine(
  line: string,
  lineNumber: number,
  format: LogFormat,
  customPattern: string | null
): LogEntry | null {
  switch (format) {
    case "apache":
      return parseApacheLine(line, lineNumber);
    case "nginx":
      return parseNginxLine(line, lineNumber);
    case "json":
      return parseJsonLine(line, lineNumber);
    case "custom":
      return parseCustomLine(line, lineNumber, customPattern);
    default:
      return parseCustomLine(line, lineNumber, customPattern);
  }
}
