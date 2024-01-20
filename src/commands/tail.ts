import * as fs from "fs";
import chalk from "chalk";
import { LogEntry, LogFormat } from "../index";
import { parseApacheLine } from "../parsers/apache";
import { parseNginxLine } from "../parsers/nginx";
import { parseJsonLine } from "../parsers/json";
import { parseCustomLine } from "../parsers/custom";
import { formatTableRow, highlightText, colorLevel } from "../utils/format";

interface TailOptions {
  format: LogFormat;
  initialLines: number;
  levels: string[];
  highlight: string | null;
}

/**
 * Watch a log file in real-time, similar to `tail -f`.
 * Uses fs.watch for efficient file change detection.
 * Displays new lines as they are appended to the file.
 */
export async function tailCommand(
  filePath: string,
  options: TailOptions
): Promise<void> {
  if (!fs.existsSync(filePath)) {
    console.error(chalk.red(`Error: File "${filePath}" does not exist.`));
    process.exit(1);
  }

  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    console.error(chalk.red(`Error: "${filePath}" is not a file.`));
    process.exit(1);
  }

  // Display header
  console.log("");
  console.log(chalk.bold.cyan("  Log Tail (live)"));
  console.log(chalk.gray("  " + "-".repeat(50)));
  console.log(chalk.gray(`  File: ${filePath}`));
  console.log(chalk.gray(`  Format: ${options.format}`));
  if (options.levels.length > 0) {
    console.log(chalk.gray(`  Level filter: ${options.levels.join(", ")}`));
  }
  if (options.highlight) {
    console.log(chalk.gray(`  Highlight: "${options.highlight}"`));
  }
  console.log(chalk.gray("  Press Ctrl+C to stop"));
  console.log(chalk.gray("  " + "-".repeat(50)));
  console.log("");

  // Read and display initial lines
  const content = fs.readFileSync(filePath, "utf-8");
  const allLines = content.split("\n").filter((l) => l.trim());
  const initialLines = allLines.slice(-options.initialLines);
  const startLineNum = Math.max(1, allLines.length - options.initialLines + 1);

  let lineCounter = allLines.length;

  for (let i = 0; i < initialLines.length; i++) {
    const entry = parseLine(
      initialLines[i],
      startLineNum + i,
      options.format
    );
    if (entry) {
      displayEntry(entry, options);
    }
  }

  // Track file position for efficient reading of new content
  let fileSize = stat.size;

  // Watch for file changes
  const watcher = fs.watch(filePath, (eventType) => {
    if (eventType !== "change") return;

    try {
      const newStat = fs.statSync(filePath);

      // File was truncated (e.g., log rotation)
      if (newStat.size < fileSize) {
        console.log(chalk.yellow("\n  [File was truncated - restarting from beginning]\n"));
        fileSize = 0;
      }

      if (newStat.size > fileSize) {
        // Read only the new bytes appended since last check
        const fd = fs.openSync(filePath, "r");
        const buffer = Buffer.alloc(newStat.size - fileSize);
        fs.readSync(fd, buffer, 0, buffer.length, fileSize);
        fs.closeSync(fd);

        const newContent = buffer.toString("utf-8");
        const newLines = newContent.split("\n").filter((l) => l.trim());

        for (const line of newLines) {
          lineCounter++;
          const entry = parseLine(line, lineCounter, options.format);
          if (entry) {
            displayEntry(entry, options);
          }
        }

        fileSize = newStat.size;
      }
    } catch (err: any) {
      // File might have been deleted during rotation
      if (err.code === "ENOENT") {
        console.log(
          chalk.yellow("\n  [File was deleted - waiting for recreation...]\n")
        );
      }
    }
  });

  // Also use polling as a fallback (some systems don't support fs.watch well)
  const pollInterval = setInterval(() => {
    try {
      const newStat = fs.statSync(filePath);
      if (newStat.size > fileSize) {
        // Trigger the same logic as fs.watch
        const fd = fs.openSync(filePath, "r");
        const buffer = Buffer.alloc(newStat.size - fileSize);
        fs.readSync(fd, buffer, 0, buffer.length, fileSize);
        fs.closeSync(fd);

        const newContent = buffer.toString("utf-8");
        const newLines = newContent.split("\n").filter((l) => l.trim());

        for (const line of newLines) {
          lineCounter++;
          const entry = parseLine(line, lineCounter, options.format);
          if (entry) {
            displayEntry(entry, options);
          }
        }

        fileSize = newStat.size;
      }
    } catch {
      // Ignore polling errors
    }
  }, 1000);

  // Handle graceful shutdown
  const cleanup = () => {
    watcher.close();
    clearInterval(pollInterval);
    console.log(chalk.gray("\n\n  Stopped watching.\n"));
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  // Keep the process running
  await new Promise(() => {
    // This promise never resolves - keeps the process alive until SIGINT
  });
}

/**
 * Display a single log entry with optional filtering and highlighting.
 */
function displayEntry(entry: LogEntry, options: TailOptions): void {
  // Level filter
  if (options.levels.length > 0) {
    if (!options.levels.includes(entry.level.toLowerCase())) {
      return;
    }
  }

  let output = formatTableRow(entry);

  // Apply highlighting
  if (options.highlight) {
    output = highlightText(output, options.highlight);
  }

  console.log(output);
}

/**
 * Parse a single line using the specified format.
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
