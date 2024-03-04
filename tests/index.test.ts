import { describe, it, expect } from 'vitest';
import { parseApacheLine, isApacheFormat } from '../src/parsers/apache';
import { parseNginxAccessLine, parseNginxErrorLine, parseNginxLine, isNginxFormat } from '../src/parsers/nginx';
import { parseJsonLine, isJsonFormat } from '../src/parsers/json';
import { parseCustomLine, isSyslogFormat } from '../src/parsers/custom';

describe('Apache log parser', () => {
  const combinedLine = '192.168.1.1 - frank [10/Oct/2024:13:55:36 -0700] "GET /index.html HTTP/1.1" 200 2326 "http://example.com" "Mozilla/5.0"';
  const commonLine = '192.168.1.1 - frank [10/Oct/2024:13:55:36 -0700] "GET /index.html HTTP/1.1" 200 2326';

  it('should parse combined log format', () => {
    const entry = parseApacheLine(combinedLine, 1);
    expect(entry).not.toBeNull();
    expect(entry!.ip).toBe('192.168.1.1');
    expect(entry!.method).toBe('GET');
    expect(entry!.path).toBe('/index.html');
    expect(entry!.status).toBe(200);
    expect(entry!.size).toBe(2326);
    expect(entry!.userAgent).toBe('Mozilla/5.0');
    expect(entry!.source).toBe('apache');
    expect(entry!.lineNumber).toBe(1);
  });

  it('should parse common log format', () => {
    const entry = parseApacheLine(commonLine, 2);
    expect(entry).not.toBeNull();
    expect(entry!.ip).toBe('192.168.1.1');
    expect(entry!.status).toBe(200);
    expect(entry!.size).toBe(2326);
  });

  it('should return null for empty lines', () => {
    expect(parseApacheLine('', 1)).toBeNull();
    expect(parseApacheLine('   ', 1)).toBeNull();
  });

  it('should return null for non-Apache lines', () => {
    expect(parseApacheLine('This is not a log line', 1)).toBeNull();
  });

  it('should set level based on status code', () => {
    const line200 = '10.0.0.1 - - [10/Oct/2024:13:55:36 -0700] "GET / HTTP/1.1" 200 100';
    const line404 = '10.0.0.1 - - [10/Oct/2024:13:55:36 -0700] "GET / HTTP/1.1" 404 100';
    const line500 = '10.0.0.1 - - [10/Oct/2024:13:55:36 -0700] "GET / HTTP/1.1" 500 100';

    expect(parseApacheLine(line200, 1)!.level).toBe('info');
    expect(parseApacheLine(line404, 1)!.level).toBe('warn');
    expect(parseApacheLine(line500, 1)!.level).toBe('error');
  });

  it('should handle size as dash', () => {
    const line = '10.0.0.1 - - [10/Oct/2024:13:55:36 -0700] "GET / HTTP/1.1" 304 -';
    const entry = parseApacheLine(line, 1);
    expect(entry!.size).toBe(0);
  });

  it('should detect Apache format', () => {
    expect(isApacheFormat(combinedLine)).toBe(true);
    expect(isApacheFormat('random text')).toBe(false);
  });

  it('should parse the timestamp', () => {
    const entry = parseApacheLine(combinedLine, 1);
    expect(entry!.timestamp).toBeInstanceOf(Date);
    expect(entry!.timestamp!.getFullYear()).toBe(2024);
    expect(entry!.timestamp!.getMonth()).toBe(9); // October is 9 (0-indexed)
  });
});

describe('Nginx log parser', () => {
  const accessLine = '192.168.1.100 - john [10/Oct/2024:13:55:36 +0000] "POST /api/users HTTP/1.1" 201 512 "http://example.com/form" "curl/7.68.0"';
  const errorLine = '2024/10/10 13:55:36 [error] 1234#5678: *99 open() "/var/www/missing.html" failed, client: 10.0.0.1';

  it('should parse nginx access log line', () => {
    const entry = parseNginxAccessLine(accessLine, 1);
    expect(entry).not.toBeNull();
    expect(entry!.ip).toBe('192.168.1.100');
    expect(entry!.method).toBe('POST');
    expect(entry!.path).toBe('/api/users');
    expect(entry!.status).toBe(201);
    expect(entry!.size).toBe(512);
    expect(entry!.source).toBe('nginx');
  });

  it('should parse nginx error log line', () => {
    const entry = parseNginxErrorLine(errorLine, 5);
    expect(entry).not.toBeNull();
    expect(entry!.level).toBe('error');
    expect(entry!.source).toBe('nginx-error');
    expect(entry!.message).toContain('open()');
    expect(entry!.lineNumber).toBe(5);
  });

  it('should auto-detect format with parseNginxLine', () => {
    const accessEntry = parseNginxLine(accessLine, 1);
    expect(accessEntry).not.toBeNull();
    expect(accessEntry!.source).toBe('nginx');

    const errorEntry = parseNginxLine(errorLine, 2);
    expect(errorEntry).not.toBeNull();
    expect(errorEntry!.source).toBe('nginx-error');
  });

  it('should return null for unrecognized lines', () => {
    expect(parseNginxLine('not a log', 1)).toBeNull();
  });

  it('should detect nginx format', () => {
    expect(isNginxFormat(accessLine)).toBe(true);
    expect(isNginxFormat(errorLine)).toBe(true);
    expect(isNginxFormat('random text')).toBe(false);
  });
});

describe('JSON log parser', () => {
  it('should parse Winston-style JSON log', () => {
    const line = JSON.stringify({
      level: 'info',
      message: 'Server started',
      timestamp: '2024-10-10T13:55:36.000Z',
    });
    const entry = parseJsonLine(line, 1);
    expect(entry).not.toBeNull();
    expect(entry!.level).toBe('info');
    expect(entry!.message).toBe('Server started');
    expect(entry!.timestamp).toBeInstanceOf(Date);
    expect(entry!.source).toBe('json');
  });

  it('should parse Pino-style numeric levels', () => {
    const line = JSON.stringify({ level: 30, msg: 'Request received', time: 1696940136000 });
    const entry = parseJsonLine(line, 1);
    expect(entry).not.toBeNull();
    expect(entry!.level).toBe('info');
    expect(entry!.message).toBe('Request received');
  });

  it('should extract HTTP fields', () => {
    const line = JSON.stringify({
      level: 'info',
      message: 'Request',
      method: 'GET',
      path: '/api/users',
      status: 200,
      ip: '10.0.0.1',
    });
    const entry = parseJsonLine(line, 1);
    expect(entry!.method).toBe('GET');
    expect(entry!.path).toBe('/api/users');
    expect(entry!.status).toBe(200);
    expect(entry!.ip).toBe('10.0.0.1');
  });

  it('should return null for non-JSON lines', () => {
    expect(parseJsonLine('not json', 1)).toBeNull();
    expect(parseJsonLine('', 1)).toBeNull();
  });

  it('should return null for JSON arrays', () => {
    expect(parseJsonLine('[1, 2, 3]', 1)).toBeNull();
  });

  it('should normalize level variations', () => {
    const line = JSON.stringify({ level: 'warning', message: 'test' });
    const entry = parseJsonLine(line, 1);
    expect(entry!.level).toBe('warn');
  });

  it('should detect JSON format', () => {
    expect(isJsonFormat('{"level":"info"}')).toBe(true);
    expect(isJsonFormat('not json')).toBe(false);
    expect(isJsonFormat('[1,2,3]')).toBe(true);
  });

  it('should handle unix epoch timestamps in seconds', () => {
    const line = JSON.stringify({ level: 'info', msg: 'test', time: 1696940136 });
    const entry = parseJsonLine(line, 1);
    expect(entry!.timestamp).toBeInstanceOf(Date);
  });
});

describe('Custom log parser', () => {
  it('should parse syslog format', () => {
    const line = 'Mar  5 12:34:56 web-server nginx[1234]: GET /index.html 200';
    const entry = parseCustomLine(line, 1, null);
    expect(entry).not.toBeNull();
    expect(entry!.message).toContain('GET /index.html');
  });

  it('should parse simple timestamp format', () => {
    const line = '2024-10-10 13:55:36 [INFO] Server started on port 3000';
    const entry = parseCustomLine(line, 1, null);
    expect(entry).not.toBeNull();
    expect(entry!.level).toBe('info');
    expect(entry!.message).toContain('Server started');
  });

  it('should parse bracketed level format', () => {
    const line = '[ERROR] Failed to connect to database';
    const entry = parseCustomLine(line, 1, null);
    expect(entry).not.toBeNull();
    expect(entry!.level).toBe('error');
    expect(entry!.message).toContain('Failed to connect');
  });

  it('should fall back to plain text', () => {
    const line = 'Some random log message with error';
    const entry = parseCustomLine(line, 1, null);
    expect(entry).not.toBeNull();
    expect(entry!.source).toBe('plain');
    expect(entry!.level).toBe('error'); // detected from message
  });

  it('should use custom regex when provided', () => {
    const line = '2024-10-10 ERROR Something went wrong';
    const pattern = '(?<timestamp>\\d{4}-\\d{2}-\\d{2})\\s+(?<level>\\w+)\\s+(?<message>.+)';
    const entry = parseCustomLine(line, 1, pattern);
    expect(entry).not.toBeNull();
    expect(entry!.level).toBe('error');
    expect(entry!.message).toBe('Something went wrong');
  });

  it('should return null for empty input', () => {
    expect(parseCustomLine('', 1, null)).toBeNull();
    expect(parseCustomLine('   ', 1, null)).toBeNull();
  });

  it('should detect syslog format', () => {
    expect(isSyslogFormat('Mar  5 12:34:56 host process[1]: msg')).toBe(true);
    expect(isSyslogFormat('random text')).toBe(false);
  });
});
