'use strict';

/**
 * @module logparser-cli
 * @description Parse and analyze log files in various formats.
 * @author idirdev
 */

const fs = require('fs');

// ── Format Parsers ──────────────────────────────────────────────────────────

/**
 * Parse a JSON-encoded log line.
 *
 * @param {string} line - Raw log line.
 * @returns {object|null}
 */
function parseJsonLine(line) {
  try {
    const o = JSON.parse(line);
    return {
      timestamp: o.timestamp || o.time || o.ts || null,
      level: (o.level || o.severity || '').toUpperCase() || null,
      message: o.message || o.msg || line,
      source: o.source || o.service || o.logger || null,
      raw: line,
      format: 'json',
    };
  } catch {
    return null;
  }
}

/**
 * Parse an Apache/Nginx Common Log Format line.
 * Example: 127.0.0.1 - frank [10/Oct/2000:13:55:36 -0700] "GET /index.html HTTP/1.1" 200 2326
 *
 * @param {string} line - Raw log line.
 * @returns {object|null}
 */
function parseApacheLine(line) {
  const re = /^(\S+)\s+\S+\s+(\S+)\s+\[([^\]]+)\]\s+"([^"]+)"\s+(\d{3})\s+(\S+)/;
  const m = re.exec(line);
  if (!m) return null;
  const status = parseInt(m[5], 10);
  const level = status >= 500 ? 'ERROR' : status >= 400 ? 'WARN' : 'INFO';
  return {
    timestamp: m[3],
    level,
    message: m[4],
    source: m[1],
    raw: line,
    format: 'apache',
  };
}

/**
 * Parse a syslog-style line.
 * Example: Jan 15 10:00:00 hostname myapp[1234]: message here
 *
 * @param {string} line - Raw log line.
 * @returns {object|null}
 */
function parseSyslogLine(line) {
  const re = /^([A-Z][a-z]{2}\s+\d{1,2}\s+[\d:]+)\s+(\S+)\s+(\S+?)(?:\[\d+\])?:\s+(.*)/;
  const m = re.exec(line);
  if (!m) return null;
  return {
    timestamp: m[1],
    level: 'INFO',
    message: m[4],
    source: m[3],
    raw: line,
    format: 'syslog',
  };
}

/**
 * Parse a bracket-format log line.
 * Supports [LEVEL] [timestamp] message  and  [LEVEL] message.
 *
 * @param {string} line - Raw log line.
 * @returns {object|null}
 */
function parseBracketLine(line) {
  const reWithTs = /^\[(\w+)\]\s+\[([^\]]+)\]\s+(.*)/;
  const m1 = reWithTs.exec(line);
  if (m1) {
    return { timestamp: m1[2], level: m1[1].toUpperCase(), message: m1[3], source: null, raw: line, format: 'bracket' };
  }
  const reNoTs = /^\[(\w+)\]\s+(.*)/;
  const m2 = reNoTs.exec(line);
  if (m2) {
    return { timestamp: null, level: m2[1].toUpperCase(), message: m2[2], source: null, raw: line, format: 'bracket' };
  }
  return null;
}

/**
 * Parse a plain-text timestamped line.
 * Example: 2024-01-15T10:00:00Z ERROR Something broke
 *
 * @param {string} line - Raw log line.
 * @returns {object|null}
 */
function parsePlainLine(line) {
  const re = /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[^\s]*)\s+(\w+)\s+(.*)/;
  const m = re.exec(line);
  if (!m) return null;
  return { timestamp: m[1], level: m[2].toUpperCase(), message: m[3], source: null, raw: line, format: 'plain' };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Auto-detect the format of a log line and parse it.
 *
 * Formats attempted in order: JSON, bracket, Apache, syslog, plain.
 * Falls back to a generic entry if nothing matches.
 *
 * @param {string} line - A single raw log line.
 * @returns {{ timestamp: string|null, level: string|null, message: string, source: string|null, raw: string, format: string }}
 */
function parseLine(line) {
  if (!line || !line.trim()) {
    return { timestamp: null, level: null, message: line || '', source: null, raw: line || '', format: 'unknown' };
  }
  const trimmed = line.trim();

  if (trimmed.startsWith('{') || trimmed.startsWith('[{')) {
    const r = parseJsonLine(line);
    if (r) return r;
  }

  if (trimmed.startsWith('[')) {
    const r = parseBracketLine(line);
    if (r) return r;
  }

  const apacheR = parseApacheLine(line);
  if (apacheR) return apacheR;

  const syslogR = parseSyslogLine(line);
  if (syslogR) return syslogR;

  const plainR = parsePlainLine(line);
  if (plainR) return plainR;

  return { timestamp: null, level: null, message: trimmed, source: null, raw: line, format: 'unknown' };
}

/**
 * Read a log file and parse every non-empty line.
 *
 * @param {string} filePath - Path to the log file.
 * @param {object} [opts={}]
 * @param {string} [opts.encoding='utf8'] - File encoding.
 * @returns {Array<object>}
 */
function parseFile(filePath, opts) {
  opts = opts || {};
  const content = fs.readFileSync(filePath, opts.encoding || 'utf8');
  return content.split('\n').filter(l => l.trim()).map(l => parseLine(l)).filter(Boolean);
}

/**
 * Filter an array of parsed log entries.
 *
 * @param {Array<object>} entries - Parsed entries.
 * @param {object} [filter={}]
 * @param {string} [filter.level]  - Exact level match (case-insensitive).
 * @param {string} [filter.grep]   - Substring match against raw line.
 * @param {string} [filter.after]  - Keep entries with timestamp > this value.
 * @param {string} [filter.before] - Keep entries with timestamp < this value.
 * @param {string} [filter.source] - Exact source match.
 * @returns {Array<object>}
 */
function filterEntries(entries, filter) {
  filter = filter || {};
  return entries.filter(e => {
    if (filter.level  && e.level !== filter.level.toUpperCase()) return false;
    if (filter.grep   && !e.raw.toLowerCase().includes(filter.grep.toLowerCase())) return false;
    if (filter.after  && e.timestamp && e.timestamp < filter.after)  return false;
    if (filter.before && e.timestamp && e.timestamp > filter.before) return false;
    if (filter.source && e.source !== filter.source) return false;
    return true;
  });
}

/**
 * Compute statistics over a set of parsed log entries.
 *
 * @param {Array<object>} entries
 * @returns {{ total: number, byLevel: object, bySource: object, byHour: object, errorRate: number }}
 */
function stats(entries) {
  const byLevel  = { error: 0, warn: 0, info: 0, debug: 0 };
  const bySource = {};
  const byHour   = {};
  for (let h = 0; h < 24; h++) byHour[h] = 0;

  for (const e of entries) {
    const lv = (e.level || '').toLowerCase();
    if (lv in byLevel) byLevel[lv]++;
    if (e.source) bySource[e.source] = (bySource[e.source] || 0) + 1;
    if (e.timestamp) {
      const d = new Date(e.timestamp.replace(' ', 'T'));
      if (!isNaN(d.getTime())) byHour[d.getUTCHours()] = (byHour[d.getUTCHours()] || 0) + 1;
    }
  }

  const errorRate = entries.length > 0
    ? Math.round((byLevel.error / entries.length) * 10000) / 100
    : 0;

  return { total: entries.length, byLevel, bySource, byHour, errorRate };
}

/**
 * Format entries as a plain-text table.
 *
 * @param {Array<object>} entries
 * @returns {string}
 */
function formatAsTable(entries) {
  const pad = (s, n) => String(s || '').padEnd(n).slice(0, n);
  const header = pad('TIMESTAMP', 24) + '  ' + pad('LEVEL', 7) + '  ' + pad('SOURCE', 12) + '  MESSAGE';
  const sep    = '-'.repeat(header.length);
  const rows   = entries.map(e =>
    pad(e.timestamp, 24) + '  ' + pad(e.level, 7) + '  ' + pad(e.source, 12) + '  ' + (e.message || '')
  );
  return [header, sep, ...rows].join('\n');
}

/**
 * Format entries as a JSON array string.
 *
 * @param {Array<object>} entries
 * @returns {string}
 */
function formatAsJson(entries) {
  return JSON.stringify(entries, null, 2);
}

/**
 * Return the N most frequent error messages.
 *
 * @param {Array<object>} entries
 * @param {number} [n=10]
 * @returns {Array<{ message: string, count: number }>}
 */
function topErrors(entries, n) {
  n = typeof n === 'number' ? n : 10;
  const freq = {};
  for (const e of entries) {
    if (e.level !== 'ERROR' && e.level !== 'FATAL') continue;
    const key = (e.message || '').trim();
    freq[key] = (freq[key] || 0) + 1;
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([message, count]) => ({ message, count }));
}

/**
 * Group entries into time buckets.
 *
 * @param {Array<object>} entries
 * @param {'minute'|'hour'|'day'} [interval='hour']
 * @returns {Array<{ bucket: string, count: number }>}
 */
function timeSeries(entries, interval) {
  interval = interval || 'hour';
  const bucketMap = {};
  for (const e of entries) {
    if (!e.timestamp) continue;
    const d = new Date(e.timestamp.replace(' ', 'T'));
    if (isNaN(d.getTime())) continue;
    let bucket;
    if (interval === 'minute') bucket = d.toISOString().slice(0, 16);
    else if (interval === 'day') bucket = d.toISOString().slice(0, 10);
    else bucket = d.toISOString().slice(0, 13);
    bucketMap[bucket] = (bucketMap[bucket] || 0) + 1;
  }
  return Object.entries(bucketMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([bucket, count]) => ({ bucket, count }));
}

module.exports = {
  parseLine,
  parseFile,
  filterEntries,
  stats,
  formatAsTable,
  formatAsJson,
  topErrors,
  timeSeries,
  parseJsonLine,
  parseApacheLine,
  parseSyslogLine,
  parseBracketLine,
  parsePlainLine,
};