# 📋 LogParser CLI

A versatile command-line tool for parsing, filtering, and analyzing log files. Supports Apache, Nginx, JSON (NDJSON), and custom formats with auto-detection.

## Installation

```bash
npm install -g @idirdev/logparser-cli
```

## Usage

### Parse a log file

```bash
logparser parse access.log
logparser parse error.log --format nginx --lines 100
logparser parse app.log --tail --output json
logparser parse server.log --format custom --custom-pattern '(?<timestamp>\S+) (?<level>\w+) (?<message>.*)'
```

### Filter entries

```bash
logparser filter access.log --level error warn
logparser filter access.log --status 500 502 503
logparser filter access.log --ip 192.168.1.1
logparser filter access.log --method POST PUT --path '/api/.*'
logparser filter access.log --from 2024-10-10T00:00:00 --to 2024-10-11T00:00:00
logparser filter access.log --contains "timeout" --count
```

### Show statistics

```bash
logparser stats access.log
logparser stats access.log --top 20
logparser stats access.log --json
```

### Tail (live watch)

```bash
logparser tail access.log
logparser tail error.log --level error --highlight "timeout"
logparser tail app.log --format json --lines 20
```

## Supported Formats

| Format | Description |
|--------|-------------|
| `apache` | Apache Combined/Common Log Format |
| `nginx` | Nginx access and error logs |
| `json` | NDJSON (Pino, Winston, Bunyan, etc.) |
| `custom` | Auto-detect syslog, timestamped, bracketed |
| `auto` | Auto-detect from file content (default) |

## Output Formats

- **table** - Colored terminal table (default)
- **json** - Structured JSON array
- **csv** - CSV format for spreadsheets

## Options

| Command | Flag | Description |
|---------|------|-------------|
| `parse` | `--format` | Log format (auto, apache, nginx, json, custom) |
| `parse` | `--lines` | Number of lines (default: 50) |
| `parse` | `--tail` | Show last N lines instead of first |
| `filter` | `--level` | Filter by log levels |
| `filter` | `--status` | Filter by HTTP status codes |
| `filter` | `--ip` | Filter by IP addresses |
| `filter` | `--method` | Filter by HTTP methods |
| `filter` | `--path` | Filter by URL path (regex) |
| `filter` | `--from/--to` | Time range filter |
| `filter` | `--contains` | Text search in raw log lines |
| `filter` | `--count` | Show only match count |
| `stats` | `--top` | Number of top entries (default: 10) |
| `tail` | `--highlight` | Highlight matching text |
| all | `--output` | Output format (table, json, csv) |

## License

MIT
