#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { parseCommand } from "./commands/parse";
import { filterCommand } from "./commands/filter";
import { statsCommand } from "./commands/stats";
import { tailCommand } from "./commands/tail";

export interface LogEntry {
  timestamp: Date | null;
  level: string;
  message: string;
  source: string;
  ip?: string;
  method?: string;
  path?: string;
  status?: number;
  size?: number;
  userAgent?: string;
  responseTime?: number;
  raw: string;
  lineNumber: number;
}

export type LogFormat = "apache" | "nginx" | "json" | "custom" | "auto";

const program = new Command();

program
  .name("logparser")
  .description(
    chalk.bold("A versatile CLI tool for parsing, filtering, and analyzing log files")
  )
  .version("1.0.0", "-v, --version");

program
  .command("parse")
  .description("Parse a log file and display structured entries")
  .argument("<file>", "Log file to parse")
  .option(
    "-f, --format <type>",
    "Log format: apache, nginx, json, custom, auto",
    "auto"
  )
  .option("-n, --lines <n>", "Number of lines to display", "50")
  .option("--head", "Show first N lines (default behavior)")
  .option("--tail", "Show last N lines")
  .option("-o, --output <format>", "Output: table, json, csv", "table")
  .option("--no-color", "Disable colored output")
  .option(
    "--custom-pattern <regex>",
    "Custom regex pattern for parsing"
  )
  .action(async (file: string, options) => {
    await parseCommand(file, {
      format: options.format as LogFormat,
      lines: parseInt(options.lines, 10),
      fromTail: options.tail ?? false,
      output: options.output,
      customPattern: options.customPattern ?? null,
    });
  });

program
  .command("filter")
  .description("Filter log entries by various criteria")
  .argument("<file>", "Log file to filter")
  .option("-f, --format <type>", "Log format", "auto")
  .option("-l, --level <levels...>", "Filter by log level (error, warn, info, debug)")
  .option("-s, --status <codes...>", "Filter by HTTP status code")
  .option("--ip <addresses...>", "Filter by IP address")
  .option("--method <methods...>", "Filter by HTTP method")
  .option("--path <pattern>", "Filter by URL path (regex)")
  .option("--from <datetime>", "Start datetime (ISO 8601)")
  .option("--to <datetime>", "End datetime (ISO 8601)")
  .option("--contains <text>", "Filter lines containing text")
  .option("--not-contains <text>", "Exclude lines containing text")
  .option("-o, --output <format>", "Output: table, json, csv", "table")
  .option("-c, --count", "Only show count of matching entries")
  .action(async (file: string, options) => {
    await filterCommand(file, {
      format: options.format as LogFormat,
      levels: options.level ?? [],
      statusCodes: (options.status ?? []).map(Number),
      ips: options.ip ?? [],
      methods: options.method ?? [],
      pathPattern: options.path ?? null,
      from: options.from ? new Date(options.from) : null,
      to: options.to ? new Date(options.to) : null,
      contains: options.contains ?? null,
      notContains: options.notContains ?? null,
      output: options.output,
      countOnly: options.count ?? false,
    });
  });

program
  .command("stats")
  .description("Show statistics and analytics for a log file")
  .argument("<file>", "Log file to analyze")
  .option("-f, --format <type>", "Log format", "auto")
  .option("--top <n>", "Number of top entries to show", "10")
  .option("--json", "Output as JSON")
  .action(async (file: string, options) => {
    await statsCommand(file, {
      format: options.format as LogFormat,
      topN: parseInt(options.top, 10),
      json: options.json ?? false,
    });
  });

program
  .command("tail")
  .description("Watch a log file in real-time (like tail -f)")
  .argument("<file>", "Log file to watch")
  .option("-f, --format <type>", "Log format", "auto")
  .option("-n, --lines <n>", "Initial lines to show", "10")
  .option("-l, --level <levels...>", "Only show entries with these levels")
  .option("--highlight <pattern>", "Highlight matching text")
  .action(async (file: string, options) => {
    await tailCommand(file, {
      format: options.format as LogFormat,
      initialLines: parseInt(options.lines, 10),
      levels: options.level ?? [],
      highlight: options.highlight ?? null,
    });
  });

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
