'use strict';

/**
 * @file Tests for logparser-cli
 * @author idirdev
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const os     = require('os');
const fs     = require('fs');
const path   = require('path');

const {
  parseLine,
  parseFile,
  filterEntries,
  stats,
  formatAsTable,
  formatAsJson,
  topErrors,
  timeSeries,
} = require('../src/index');

// ── parseLine – JSON ─────────────────────────────────────────────────────────

describe('parseLine – JSON format', () => {
  it('should parse level, message, timestamp', () => {
    const r = parseLine('{"level":"error","message":"db timeout","timestamp":"2024-01-15T10:00:00Z"}');
    assert.equal(r.level, 'ERROR');
    assert.equal(r.message, 'db timeout');
    assert.equal(r.timestamp, '2024-01-15T10:00:00Z');
    assert.equal(r.format, 'json');
  });

  it('should accept msg as message alias', () => {
    const r = parseLine('{"level":"warn","msg":"low disk"}');
    assert.equal(r.level, 'WARN');
    assert.equal(r.message, 'low disk');
  });

  it('should accept severity as level alias', () => {
    const r = parseLine('{"severity":"INFO","message":"started"}');
    assert.equal(r.level, 'INFO');
  });

  it('should accept service as source alias', () => {
    const r = parseLine('{"level":"info","message":"ok","service":"auth"}');
    assert.equal(r.source, 'auth');
  });
});

// ── parseLine – bracket ───────────────────────────────────────────────────────

describe('parseLine – bracket format', () => {
  it('should parse [LEVEL] [timestamp] message', () => {
    const r = parseLine('[ERROR] [2024-01-15T10:00:00Z] Something broke');
    assert.equal(r.level, 'ERROR');
    assert.equal(r.timestamp, '2024-01-15T10:00:00Z');
    assert.ok(r.message.includes('broke'));
    assert.equal(r.format, 'bracket');
  });

  it('should parse [LEVEL] message without timestamp', () => {
    const r = parseLine('[WARN] disk usage high');
    assert.equal(r.level, 'WARN');
    assert.equal(r.message, 'disk usage high');
    assert.equal(r.timestamp, null);
  });
});

// ── parseLine – Apache ───────────────────────────────────────────────────────

describe('parseLine – Apache/Nginx CLF', () => {
  it('should classify 200 as INFO', () => {
    const line = '127.0.0.1 - frank [10/Oct/2000:13:55:36 -0700] "GET /index.html HTTP/1.1" 200 2326';
    const r = parseLine(line);
    assert.equal(r.level, 'INFO');
    assert.equal(r.source, '127.0.0.1');
    assert.equal(r.format, 'apache');
  });

  it('should classify 500 as ERROR', () => {
    const line = '10.0.0.1 - - [10/Oct/2000:14:00:00 -0700] "POST /api HTTP/1.1" 500 0';
    assert.equal(parseLine(line).level, 'ERROR');
  });
});

// ── parseLine – syslog ────────────────────────────────────────────────────────

describe('parseLine – syslog', () => {
  it('should parse syslog format', () => {
    const r = parseLine('Jan 15 10:00:00 myhost myapp[1234]: connection accepted');
    assert.equal(r.format, 'syslog');
    assert.equal(r.source, 'myapp');
    assert.ok(r.message.includes('accepted'));
  });
});

// ── parseLine – plain ─────────────────────────────────────────────────────────

describe('parseLine – plain', () => {
  it('should parse plain timestamped line', () => {
    const r = parseLine('2024-01-15T10:00:00Z ERROR Failed to connect');
    assert.equal(r.level, 'ERROR');
    assert.equal(r.timestamp, '2024-01-15T10:00:00Z');
    assert.equal(r.format, 'plain');
  });
});

// ── filterEntries ─────────────────────────────────────────────────────────────

describe('filterEntries', () => {
  const entries = [
    { level: 'ERROR', source: 'api',  timestamp: '2024-01-15T10:00:00Z', raw: 'db timeout', message: 'db timeout' },
    { level: 'WARN',  source: 'auth', timestamp: '2024-01-15T11:00:00Z', raw: 'retry',      message: 'retry' },
    { level: 'INFO',  source: 'api',  timestamp: '2024-01-15T12:00:00Z', raw: 'ok',         message: 'ok' },
    { level: 'DEBUG', source: 'db',   timestamp: '2024-01-16T08:00:00Z', raw: 'query slow', message: 'query slow' },
  ];

  it('should filter by level', () => {
    const r = filterEntries(entries, { level: 'error' });
    assert.equal(r.length, 1);
    assert.equal(r[0].level, 'ERROR');
  });

  it('should filter by grep (case-insensitive)', () => {
    const r = filterEntries(entries, { grep: 'TIMEOUT' });
    assert.equal(r.length, 1);
  });

  it('should filter by after', () => {
    const r = filterEntries(entries, { after: '2024-01-15T11:30:00Z' });
    assert.equal(r.length, 2);
  });

  it('should filter by before', () => {
    const r = filterEntries(entries, { before: '2024-01-15T10:30:00Z' });
    assert.equal(r.length, 1);
  });

  it('should filter by source', () => {
    const r = filterEntries(entries, { source: 'api' });
    assert.equal(r.length, 2);
  });

  it('should combine level and source filters', () => {
    const r = filterEntries(entries, { source: 'api', level: 'error' });
    assert.equal(r.length, 1);
  });

  it('should return all when filter is empty', () => {
    assert.equal(filterEntries(entries, {}).length, entries.length);
  });
});

// ── stats ─────────────────────────────────────────────────────────────────────

describe('stats', () => {
  it('should count entries by level and compute errorRate', () => {
    const e = [
      { level: 'ERROR', timestamp: null, source: null },
      { level: 'ERROR', timestamp: null, source: null },
      { level: 'INFO',  timestamp: null, source: 'api' },
      { level: 'WARN',  timestamp: null, source: null },
    ];
    const s = stats(e);
    assert.equal(s.total, 4);
    assert.equal(s.byLevel.error, 2);
    assert.equal(s.byLevel.warn, 1);
    assert.ok(s.errorRate > 49 && s.errorRate < 51);
  });

  it('should count by source', () => {
    const s = stats([{ level: 'INFO', timestamp: null, source: 'api' }]);
    assert.equal(s.bySource.api, 1);
  });

  it('should bucket by hour', () => {
    const e = [
      { level: 'INFO', timestamp: '2024-01-15T10:00:00Z', source: null },
      { level: 'INFO', timestamp: '2024-01-15T10:30:00Z', source: null },
      { level: 'INFO', timestamp: '2024-01-15T14:00:00Z', source: null },
    ];
    const s = stats(e);
    assert.equal(s.byHour[10], 2);
    assert.equal(s.byHour[14], 1);
  });

  it('should return zero errorRate for empty input', () => {
    assert.equal(stats([]).errorRate, 0);
  });
});

// ── topErrors ─────────────────────────────────────────────────────────────────

describe('topErrors', () => {
  it('should return the most frequent error messages', () => {
    const e = [
      { level: 'ERROR', message: 'db timeout' },
      { level: 'ERROR', message: 'db timeout' },
      { level: 'ERROR', message: 'auth fail' },
      { level: 'INFO',  message: 'ok' },
    ];
    const top = topErrors(e, 5);
    assert.equal(top[0].message, 'db timeout');
    assert.equal(top[0].count, 2);
    assert.equal(top[1].message, 'auth fail');
  });

  it('should respect the n limit', () => {
    const e = Array.from({ length: 20 }, (_, i) => ({ level: 'ERROR', message: 'err' + i }));
    assert.equal(topErrors(e, 5).length, 5);
  });

  it('should return empty array when no errors exist', () => {
    assert.deepEqual(topErrors([{ level: 'INFO', message: 'ok' }], 10), []);
  });
});

// ── timeSeries ────────────────────────────────────────────────────────────────

describe('timeSeries', () => {
  it('should group entries by hour', () => {
    const e = [
      { timestamp: '2024-01-15T10:00:00Z' },
      { timestamp: '2024-01-15T10:45:00Z' },
      { timestamp: '2024-01-15T11:00:00Z' },
    ];
    const ts = timeSeries(e, 'hour');
    const map = Object.fromEntries(ts.map(b => [b.bucket, b.count]));
    assert.equal(map['2024-01-15T10'], 2);
    assert.equal(map['2024-01-15T11'], 1);
  });

  it('should group entries by day', () => {
    const e = [
      { timestamp: '2024-01-15T10:00:00Z' },
      { timestamp: '2024-01-15T14:00:00Z' },
      { timestamp: '2024-01-16T09:00:00Z' },
    ];
    const ts = timeSeries(e, 'day');
    assert.equal(ts.length, 2);
    assert.equal(ts[0].count, 2);
  });

  it('should skip entries without timestamps', () => {
    const e = [{ timestamp: null }, { timestamp: '2024-01-15T10:00:00Z' }];
    assert.equal(timeSeries(e, 'hour').length, 1);
  });
});

// ── parseFile ─────────────────────────────────────────────────────────────────

describe('parseFile', () => {
  it('should parse a mixed-format log file', () => {
    const tmpFile = require('path').join(require('os').tmpdir(), 'lpc_test_' + Date.now() + '.log');
    const content = [
      '{"level":"error","message":"db timeout"}',
      '[WARN] [2024-01-15T10:00:00Z] high load',
      '2024-01-15T11:00:00Z INFO started',
    ].join('\n');
    require('fs').writeFileSync(tmpFile, content, 'utf8');
    const entries = parseFile(tmpFile);
    assert.equal(entries.length, 3);
    assert.equal(entries[0].level, 'ERROR');
    assert.equal(entries[1].level, 'WARN');
    assert.equal(entries[2].level, 'INFO');
    require('fs').unlinkSync(tmpFile);
  });
});

// ── formatAsTable ─────────────────────────────────────────────────────────────

describe('formatAsTable', () => {
  it('should include TIMESTAMP and LEVEL column headers', () => {
    const out = formatAsTable([{ timestamp: '2024-01-15T10:00:00Z', level: 'ERROR', source: null, message: 'test' }]);
    assert.ok(out.includes('TIMESTAMP'));
    assert.ok(out.includes('LEVEL'));
    assert.ok(out.includes('ERROR'));
  });
});