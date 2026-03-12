const { formatRelativeTime, formatDuration, formatDurationLarge, capitalize } = require('../../src/renderer/utils/format');

describe('formatRelativeTime', () => {
  test('returns "just now" for current time', () => {
    expect(formatRelativeTime(new Date())).toBe('just now');
  });

  test('returns "just now" for 30 seconds ago', () => {
    const date = new Date(Date.now() - 30 * 1000);
    expect(formatRelativeTime(date)).toBe('just now');
  });

  test('returns "1 minute ago" for 60 seconds ago', () => {
    const date = new Date(Date.now() - 60 * 1000);
    expect(formatRelativeTime(date)).toBe('1 minute ago');
  });

  test('returns "5 minutes ago" for 5 minutes ago', () => {
    const date = new Date(Date.now() - 5 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe('5 minutes ago');
  });

  test('returns "1 hour ago" for 60 minutes ago', () => {
    const date = new Date(Date.now() - 60 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe('1 hour ago');
  });

  test('returns "3 hours ago" for 3 hours ago', () => {
    const date = new Date(Date.now() - 3 * 60 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe('3 hours ago');
  });

  test('returns "yesterday" for 24 hours ago', () => {
    const date = new Date(Date.now() - 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe('yesterday');
  });

  test('returns "5 days ago" for 5 days ago', () => {
    const date = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe('5 days ago');
  });

  test('accepts string date', () => {
    const date = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(date)).toBe('2 hours ago');
  });

  test('accepts timestamp number', () => {
    const ts = Date.now() - 10 * 60 * 1000;
    expect(formatRelativeTime(ts)).toBe('10 minutes ago');
  });
});

describe('formatDuration', () => {
  test('0ms returns "0m"', () => {
    expect(formatDuration(0)).toBe('0m');
  });

  test('negative value returns "0m"', () => {
    expect(formatDuration(-5000)).toBe('0m');
  });

  test('null returns "0m"', () => {
    expect(formatDuration(null)).toBe('0m');
  });

  test('undefined returns "0m"', () => {
    expect(formatDuration(undefined)).toBe('0m');
  });

  test('30s returns "0m" by default (alwaysShowMinutes)', () => {
    expect(formatDuration(30000)).toBe('0m');
  });

  test('30s with alwaysShowMinutes:false returns "30s"', () => {
    expect(formatDuration(30000, { alwaysShowMinutes: false })).toBe('30s');
  });

  test('0ms with alwaysShowMinutes:false returns "0s"', () => {
    expect(formatDuration(0, { alwaysShowMinutes: false })).toBe('0s');
  });

  test('5min returns "5m"', () => {
    expect(formatDuration(300000)).toBe('5m');
  });

  test('1h30 returns "1h 30m"', () => {
    expect(formatDuration(5400000)).toBe('1h 30m');
  });

  test('1h30 compact returns "1h30"', () => {
    expect(formatDuration(5400000, { compact: true })).toBe('1h30');
  });

  test('1h exact returns "1h"', () => {
    expect(formatDuration(3600000)).toBe('1h');
  });

  test('1m30s with showSeconds returns "1m 30s"', () => {
    expect(formatDuration(90000, { showSeconds: true })).toBe('1m 30s');
  });

  test('5m with showSeconds but 0 seconds returns "5m"', () => {
    expect(formatDuration(300000, { showSeconds: true })).toBe('5m');
  });

  test('2h05 compact returns "2h05"', () => {
    expect(formatDuration(7500000, { compact: true })).toBe('2h05');
  });
});

describe('formatDurationLarge', () => {
  test('0 returns {hours:0, minutes:0}', () => {
    expect(formatDurationLarge(0)).toEqual({ hours: 0, minutes: 0 });
  });

  test('null returns {hours:0, minutes:0}', () => {
    expect(formatDurationLarge(null)).toEqual({ hours: 0, minutes: 0 });
  });

  test('negative returns {hours:0, minutes:0}', () => {
    expect(formatDurationLarge(-1000)).toEqual({ hours: 0, minutes: 0 });
  });

  test('5400000ms (1h30) returns {hours:1, minutes:30}', () => {
    expect(formatDurationLarge(5400000)).toEqual({ hours: 1, minutes: 30 });
  });

  test('3600000ms (1h) returns {hours:1, minutes:0}', () => {
    expect(formatDurationLarge(3600000)).toEqual({ hours: 1, minutes: 0 });
  });
});

describe('capitalize', () => {
  test('"hello" returns "Hello"', () => {
    expect(capitalize('hello')).toBe('Hello');
  });

  test('empty string returns ""', () => {
    expect(capitalize('')).toBe('');
  });

  test('null returns ""', () => {
    expect(capitalize(null)).toBe('');
  });

  test('undefined returns ""', () => {
    expect(capitalize(undefined)).toBe('');
  });

  test('"Hello" stays "Hello"', () => {
    expect(capitalize('Hello')).toBe('Hello');
  });

  test('single char "a" returns "A"', () => {
    expect(capitalize('a')).toBe('A');
  });
});
