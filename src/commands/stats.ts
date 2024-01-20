import * as fs from "fs";
import chalk from "chalk";
import { LogEntry, LogFormat } from "../index";
import { parseApacheLine } from "../parsers/apache";
import { parseNginxLine } from "../parsers/nginx";
import { parseJsonLine } from "../parsers/json";
import { parseCustomLine } from "../parsers/custom";
import { colorLevel, colorStatus } from "../utils/format";

interface StatsOptions {
  format: LogFormat;
  topN: number;
  json: boolean;
}

interface LogStats {
  totalEntries: number;
  parsedEntries: number;
  failedEntries: number;
  timeRange: { from: string | null; to: string | null };
  levelDistribution: Record<string, number>;
  statusDistribution: Record<string, number>;
  topPaths: Array<{ path: string; count: number }>;
  topIps: Array<{ ip: string; count: number }>;
  methodDistribution: Record<string, number>;
  errorsPerHour: Record<string, number>;
  avgResponseTime: number | null;
  p95ResponseTime: number | null;
  p99ResponseTime: number | null;
  totalBytes: number;
}

/**
 * Analyze a log file and display comprehensive statistics.
 * Computes distributions, top paths, top IPs, response time percentiles, etc.
 */
export async function statsCommand(
  filePath: string,
  options: StatsOptions
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

  // Parse all entries
  const entries: LogEntry[] = [];
  let failedCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const entry = parseLine(lines[i], i + 1, options.format);
    if (entry) {
      entries.push(entry);
    } else {
      failedCount++;
    }
  }

  // Compute statistics
  const stats = computeStats(entries, lines.length, failedCount, options.topN);

  if (options.json) {
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  // Display formatted statistics
  printStats(stats, options.topN);
}

/**
 * Compute comprehensive statistics from parsed log entries.
 */
function computeStats(
  entries: LogEntry[],
  totalLines: number,
  failedLines: number,
  topN: number
): LogStats {
  const levelDist: Record<string, number> = {};
  const statusDist: Record<string, number> = {};
  const pathCounts: Record<string, number> = {};
  const ipCounts: Record<string, number> = {};
  const methodDist: Record<string, number> = {};
  const errorsPerHour: Record<string, number> = {};
  const responseTimes: number[] = [];
  let totalBytes = 0;
  let minTime: Date | null = null;
  let maxTime: Date | null = null;

  for (const entry of entries) {
    // Level distribution
    const level = entry.level.toLowerCase();
    levelDist[level] = (levelDist[level] || 0) + 1;

    // Status distribution
    if (entry.status !== undefined) {
      const statusGroup = `${Math.floor(entry.status / 100)}xx`;
      statusDist[statusGroup] = (statusDist[statusGroup] || 0) + 1;
    }

    // Path counts
    if (entry.path) {
      pathCounts[entry.path] = (pathCounts[entry.path] || 0) + 1;
    }

    // IP counts
    if (entry.ip) {
      ipCounts[entry.ip] = (ipCounts[entry.ip] || 0) + 1;
    }

    // Method distribution
    if (entry.method) {
      methodDist[entry.method] = (methodDist[entry.method] || 0) + 1;
    }

    // Time range
    if (entry.timestamp) {
      if (!minTime || entry.timestamp < minTime) minTime = entry.timestamp;
      if (!maxTime || entry.timestamp > maxTime) maxTime = entry.timestamp;

      // Errors per hour
      if (entry.level === "error" || (entry.status && entry.status >= 500)) {
        const hourKey = entry.timestamp.toISOString().substring(0, 13);
        errorsPerHour[hourKey] = (errorsPerHour[hourKey] || 0) + 1;
      }
    }

    // Response times
    if (entry.responseTime !== undefined) {
      responseTimes.push(entry.responseTime);
    }

    // Total bytes
    if (entry.size !== undefined) {
      totalBytes += entry.size;
    }
  }

  // Sort and take top N for paths and IPs
  const topPaths = Object.entries(pathCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, topN)
    .map(([path, count]) => ({ path, count }));

  const topIps = Object.entries(ipCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, topN)
    .map(([ip, count]) => ({ ip, count }));

  // Response time percentiles
  responseTimes.sort((a, b) => a - b);
  const avgResponseTime =
    responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : null;
  const p95ResponseTime = percentile(responseTimes, 95);
  const p99ResponseTime = percentile(responseTimes, 99);

  return {
    totalEntries: totalLines,
    parsedEntries: entries.length,
    failedEntries: failedLines,
    timeRange: {
      from: minTime?.toISOString() || null,
      to: maxTime?.toISOString() || null,
    },
    levelDistribution: levelDist,
    statusDistribution: statusDist,
    topPaths,
    topIps,
    methodDistribution: methodDist,
    errorsPerHour,
    avgResponseTime,
    p95ResponseTime,
    p99ResponseTime,
    totalBytes,
  };
}

/**
 * Calculate a percentile value from a sorted array.
 */
function percentile(sortedArr: number[], p: number): number | null {
  if (sortedArr.length === 0) return null;
  const idx = Math.ceil((p / 100) * sortedArr.length) - 1;
  return sortedArr[Math.max(0, idx)];
}

/**
 * Print formatted statistics to the terminal.
 */
function printStats(stats: LogStats, topN: number): void {
  const sep = chalk.gray("-".repeat(55));

  console.log("");
  console.log(chalk.bold.cyan("  Log File Statistics"));
  console.log(sep);

  // Overview
  console.log(chalk.bold("  Overview"));
  console.log(`    Total lines:   ${chalk.white(String(stats.totalEntries))}`);
  console.log(`    Parsed:        ${chalk.green(String(stats.parsedEntries))}`);
  console.log(`    Failed:        ${chalk.red(String(stats.failedEntries))}`);
  if (stats.timeRange.from) {
    console.log(`    From:          ${chalk.gray(stats.timeRange.from)}`);
    console.log(`    To:            ${chalk.gray(stats.timeRange.to || "---")}`);
  }
  console.log("");

  // Level distribution
  if (Object.keys(stats.levelDistribution).length > 0) {
    console.log(chalk.bold("  Log Levels"));
    for (const [level, count] of Object.entries(stats.levelDistribution)) {
      const pct = ((count / stats.parsedEntries) * 100).toFixed(1);
      const bar = buildBar(count, stats.parsedEntries, 20);
      console.log(`    ${colorLevel(level)}  ${bar}  ${count} (${pct}%)`);
    }
    console.log("");
  }

  // Status distribution
  if (Object.keys(stats.statusDistribution).length > 0) {
    console.log(chalk.bold("  HTTP Status Codes"));
    for (const [group, count] of Object.entries(stats.statusDistribution)) {
      const pct = ((count / stats.parsedEntries) * 100).toFixed(1);
      const bar = buildBar(count, stats.parsedEntries, 20);
      console.log(`    ${colorStatus(parseInt(group) * 100).padEnd(14)}  ${bar}  ${count} (${pct}%)`);
    }
    console.log("");
  }

  // Top paths
  if (stats.topPaths.length > 0) {
    console.log(chalk.bold(`  Top ${topN} Paths`));
    for (let i = 0; i < stats.topPaths.length; i++) {
      const { path, count } = stats.topPaths[i];
      const truncPath = path.length > 35 ? path.substring(0, 32) + "..." : path;
      console.log(
        `    ${chalk.gray(String(i + 1).padStart(3) + ".")} ${chalk.white(truncPath.padEnd(38))} ${chalk.yellow(String(count))}`
      );
    }
    console.log("");
  }

  // Top IPs
  if (stats.topIps.length > 0) {
    console.log(chalk.bold(`  Top ${topN} IPs`));
    for (let i = 0; i < stats.topIps.length; i++) {
      const { ip, count } = stats.topIps[i];
      console.log(
        `    ${chalk.gray(String(i + 1).padStart(3) + ".")} ${chalk.white(ip.padEnd(20))} ${chalk.yellow(String(count))}`
      );
    }
    console.log("");
  }

  // Response time percentiles
  if (stats.avgResponseTime !== null) {
    console.log(chalk.bold("  Response Times"));
    console.log(`    Average:  ${chalk.white(stats.avgResponseTime.toFixed(2))}ms`);
    console.log(`    P95:      ${chalk.yellow(stats.p95ResponseTime?.toFixed(2) || "---")}ms`);
    console.log(`    P99:      ${chalk.red(stats.p99ResponseTime?.toFixed(2) || "---")}ms`);
    console.log("");
  }

  // Total bandwidth
  if (stats.totalBytes > 0) {
    const mb = (stats.totalBytes / (1024 * 1024)).toFixed(2);
    console.log(chalk.bold("  Bandwidth"));
    console.log(`    Total:    ${chalk.white(mb)} MB`);
    console.log("");
  }
}

/**
 * Build a simple ASCII bar chart segment.
 */
function buildBar(value: number, total: number, width: number): string {
  const filled = Math.round((value / total) * width);
  const empty = width - filled;
  return chalk.green("\u2588".repeat(filled)) + chalk.gray("\u2591".repeat(empty));
}

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
