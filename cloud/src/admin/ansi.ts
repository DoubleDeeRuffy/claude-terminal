/**
 * ANSI escape code utilities for TUI rendering.
 * Zero dependencies — raw terminal control.
 */

// ── Cursor ──

export const cursor = {
  hide: '\x1b[?25l',
  show: '\x1b[?25h',
  moveTo: (row: number, col: number) => `\x1b[${row};${col}H`,
  home: '\x1b[H',
};

// ── Screen ──

export const screen = {
  clear: '\x1b[2J',
  clearLine: '\x1b[2K',
  altBuffer: '\x1b[?1049h',
  mainBuffer: '\x1b[?1049l',
};

// ── Colors ──

export const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  inverse: '\x1b[7m',

  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',

  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',
  bgGray: '\x1b[100m',

  // 256-color
  fg256: (n: number) => `\x1b[38;5;${n}m`,
  bg256: (n: number) => `\x1b[48;5;${n}m`,

  // Amber accent (closest 256-color match to #d97706)
  amber: '\x1b[38;5;172m',
  bgAmber: '\x1b[48;5;172m',
};

// ── Box Drawing ──

export const box = {
  tl: '┌', tr: '┐', bl: '└', br: '┘',
  h: '─', v: '│',
  teeR: '├', teeL: '┤', teeD: '┬', teeU: '┴',
  cross: '┼',

  // Double
  dtl: '╔', dtr: '╗', dbl: '╚', dbr: '╝',
  dh: '═', dv: '║',

  // Rounded
  rtl: '╭', rtr: '╮', rbl: '╰', rbr: '╯',
};

// ── Helpers ──

/** Strip ANSI escape codes to get visible length */
export function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/** Get visible character length (excluding ANSI codes) */
export function visLen(str: string): number {
  return stripAnsi(str).length;
}

/** Truncate to maxLen visible chars, add ellipsis if needed */
export function trunc(str: string, maxLen: number): string {
  const stripped = stripAnsi(str);
  if (stripped.length <= maxLen) return str;
  // Naive: strip all ansi, truncate, no style preservation
  return stripped.slice(0, maxLen - 1) + '…';
}

/** Pad right to width visible chars */
export function padR(str: string, width: number): string {
  const len = visLen(str);
  if (len >= width) return str;
  return str + ' '.repeat(width - len);
}

/** Pad left to width visible chars */
export function padL(str: string, width: number): string {
  const len = visLen(str);
  if (len >= width) return str;
  return ' '.repeat(width - len) + str;
}

/** Center text in width */
export function center(str: string, width: number): string {
  const len = visLen(str);
  if (len >= width) return str;
  const left = Math.floor((width - len) / 2);
  const right = width - len - left;
  return ' '.repeat(left) + str + ' '.repeat(right);
}

/** Draw a horizontal line of given width */
export function hline(width: number, ch: string = box.h): string {
  return ch.repeat(width);
}

/** Format a styled string: style + text + reset */
export function style(text: string, ...styles: string[]): string {
  if (!styles.length) return text;
  return styles.join('') + text + c.reset;
}

/** Format a box frame (returns array of strings, one per line) */
export function drawBox(width: number, height: number, title?: string): string[] {
  const lines: string[] = [];
  // Top
  if (title) {
    const titleStr = ` ${title} `;
    const remaining = width - 2 - titleStr.length;
    lines.push(box.rtl + box.h + style(titleStr, c.bold, c.amber) + hline(Math.max(0, remaining)) + box.rtr);
  } else {
    lines.push(box.rtl + hline(width - 2) + box.rtr);
  }
  // Middle
  for (let i = 0; i < height - 2; i++) {
    lines.push(box.v + ' '.repeat(width - 2) + box.v);
  }
  // Bottom
  lines.push(box.rbl + hline(width - 2) + box.rbr);
  return lines;
}

/** Format duration from ms */
export function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

/** Format timestamp to HH:MM:SS */
export function fmtTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour12: false });
}

/** Format date to YYYY-MM-DD */
export function fmtDate(ts: number): string {
  const d = new Date(ts);
  return d.toISOString().slice(0, 10);
}
