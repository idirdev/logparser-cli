#!/usr/bin/env node
'use strict';

/**
 * @file logparser-cli – CLI entry point.
 * @author idirdev
 */

const path = require('path');
const lib  = require('../src/index');

const args = process.argv.slice(2);

if (!args.length || args.includes('--help') || args.includes('-h')) {
  console.log([
    '',
    '  Usage: logparser-cli <file> [options]',
    '',
    '  Options:',
    '    --level <level>       Filter by level: error, warn, info, debug',
    '    --grep <pattern>      Keep only lines containing pattern',
    '    --after <date>        Keep only entries after ISO date',
    '    --before <date>       Keep only entries before ISO date',
    '    --stats               Print statistics',
    '    --top-errors [n]      Print top N error messages (default 10)',
    '    --json                Output as JSON',
    '    -h, --help            Show this help',
    '',
  ].join('\n'));
  process.exit(0);
}

const filePath = args[0];
if (!filePath || filePath.startsWith('--')) {
  console.error('Error: <file> argument is required.');
  process.exit(1);
}

function getArg(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] || null : null;
}

const levelArg   = getArg('--level');
const grepArg    = getArg('--grep');
const afterArg   = getArg('--after');
const beforeArg  = getArg('--before');
const doStats    = args.includes('--stats');
const doJson     = args.includes('--json');
const topIdx     = args.indexOf('--top-errors');
const doTopErrors = topIdx >= 0;
const topN       = doTopErrors ? parseInt(args[topIdx + 1], 10) || 10 : 10;

let entries;
try {
  entries = lib.parseFile(path.resolve(filePath));
} catch (err) {
  console.error('Error reading file: ' + err.message);
  process.exit(1);
}

const filter = {};
if (levelArg)  filter.level  = levelArg;
if (grepArg)   filter.grep   = grepArg;
if (afterArg)  filter.after  = afterArg;
if (beforeArg) filter.before = beforeArg;

const filtered = lib.filterEntries(entries, filter);

if (doStats) {
  const s = lib.stats(filtered);
  if (doJson) {
    console.log(JSON.stringify(s, null, 2));
  } else {
    console.log('Total:      ' + s.total);
    console.log('Error rate: ' + s.errorRate + '%');
    for (const [lv, n] of Object.entries(s.byLevel)) {
      if (n > 0) console.log('  ' + lv.toUpperCase() + ': ' + n);
    }
  }
} else if (doTopErrors) {
  const top = lib.topErrors(filtered, topN);
  if (doJson) {
    console.log(JSON.stringify(top, null, 2));
  } else {
    top.forEach((t, i) => console.log('  ' + (i + 1) + '. [' + t.count + 'x] ' + t.message));
  }
} else if (doJson) {
  console.log(lib.formatAsJson(filtered));
} else {
  console.log(lib.formatAsTable(filtered));
}