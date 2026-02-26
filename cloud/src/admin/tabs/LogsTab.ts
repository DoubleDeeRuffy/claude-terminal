/**
 * LogsTab — Live server log viewer.
 * Scrollable, filterable, color-coded by level.
 */

import { Screen } from '../Screen';
import { c, style, trunc, fmtTime } from '../ansi';

export interface LogEntry {
  timestamp: number;
  level: string;
  message: string;
}

export class LogsTab {
  private screen: Screen;
  private serverUrl: string;
  private logs: LogEntry[] = [];
  private scrollOffset: number = -1; // -1 = follow (bottom)
  private filter: string = '';
  private filterMode: boolean = false;

  constructor(screen: Screen, serverUrl: string) {
    this.screen = screen;
    this.serverUrl = serverUrl;
  }

  async load(): Promise<void> {
    try {
      const res = await fetch(`${this.serverUrl}/admin/logs`);
      this.logs = await res.json() as LogEntry[];
    } catch {
      // Keep existing logs
    }
  }

  render(): void {
    const s = this.screen;
    const w = s.width - 4;
    const col = 3;
    const visibleHeight = s.height - 10;

    // Box
    const filterSuffix = this.filter ? ` — filter: "${this.filter}"` : '';
    const r = s.drawBox(5, col, w, visibleHeight + 2, `Server Logs (${this.filteredLogs.length})${filterSuffix}`);

    const filtered = this.filteredLogs;

    if (filtered.length === 0) {
      s.writeStyled(r + 1, col + 2, this.filter ? 'No logs match filter.' : 'No logs yet.', c.gray);
      this.renderFooter();
      return;
    }

    // Calculate scroll position
    let startIdx: number;
    if (this.scrollOffset < 0) {
      // Follow mode: show last N lines
      startIdx = Math.max(0, filtered.length - visibleHeight);
    } else {
      startIdx = Math.min(this.scrollOffset, Math.max(0, filtered.length - visibleHeight));
    }

    // Render visible lines
    for (let i = 0; i < visibleHeight; i++) {
      const idx = startIdx + i;
      if (idx >= filtered.length) break;
      const log = filtered[idx];

      const time = fmtTime(log.timestamp);
      const levelColor = this.levelColor(log.level);
      const levelTag = style(`[${log.level}]`, levelColor);
      const msg = trunc(log.message, w - 22);

      s.writeAt(r + i, col + 2, `${style(time, c.gray)} ${levelTag} ${msg}`);
    }

    // Scroll indicator
    if (filtered.length > visibleHeight) {
      const scrollPct = Math.round((startIdx / Math.max(1, filtered.length - visibleHeight)) * 100);
      const indicator = this.scrollOffset < 0 ? style('FOLLOW', c.green) : `${scrollPct}%`;
      s.writeStyled(5, col + w - 12, ` ${indicator} `, c.gray);
    }

    this.renderFooter();
  }

  private renderFooter(): void {
    const s = this.screen;
    const col = 3;

    if (this.filterMode) {
      s.writeAt(s.height - 2, col,
        style('Filter: ', c.gray) + this.filter + style('_', c.amber) +
        style('  [Enter] apply  [Esc] cancel', c.gray)
      );
    } else {
      s.writeAt(s.height - 2, col,
        style('[↑↓]', c.bold, c.amber) + style(' scroll  ', c.gray) +
        style('[/]', c.bold, c.amber) + style(' filter  ', c.gray) +
        style('[F]', c.bold, c.amber) + style(' follow  ', c.gray) +
        style('[C]', c.bold, c.amber) + style(' clear filter', c.gray)
      );
    }
  }

  onKey(key: string): void {
    if (this.filterMode) {
      this.handleFilterKey(key);
      return;
    }

    switch (key) {
      case 'up':
        if (this.scrollOffset < 0) {
          this.scrollOffset = Math.max(0, this.filteredLogs.length - (this.screen.height - 10));
        }
        this.scrollOffset = Math.max(0, this.scrollOffset - 1);
        break;
      case 'down':
        if (this.scrollOffset >= 0) {
          this.scrollOffset++;
          const max = Math.max(0, this.filteredLogs.length - (this.screen.height - 10));
          if (this.scrollOffset >= max) this.scrollOffset = -1; // back to follow
        }
        break;
      case 'pageup':
        if (this.scrollOffset < 0) {
          this.scrollOffset = Math.max(0, this.filteredLogs.length - (this.screen.height - 10));
        }
        this.scrollOffset = Math.max(0, this.scrollOffset - (this.screen.height - 10));
        break;
      case 'pagedown':
        if (this.scrollOffset >= 0) {
          this.scrollOffset += this.screen.height - 10;
          const max = Math.max(0, this.filteredLogs.length - (this.screen.height - 10));
          if (this.scrollOffset >= max) this.scrollOffset = -1;
        }
        break;
      case '/':
        this.filterMode = true;
        break;
      case 'f':
      case 'F':
        this.scrollOffset = -1; // follow
        break;
      case 'c':
      case 'C':
        this.filter = '';
        break;
    }
  }

  private handleFilterKey(key: string): void {
    if (key === 'escape') {
      this.filterMode = false;
    } else if (key === 'enter') {
      this.filterMode = false;
    } else if (key === 'backspace') {
      this.filter = this.filter.slice(0, -1);
    } else if (key.length === 1 && key.charCodeAt(0) >= 32) {
      this.filter += key;
    }
  }

  private get filteredLogs(): LogEntry[] {
    if (!this.filter) return this.logs;
    const lower = this.filter.toLowerCase();
    return this.logs.filter(l =>
      l.message.toLowerCase().includes(lower) ||
      l.level.toLowerCase().includes(lower)
    );
  }

  private levelColor(level: string): string {
    switch (level.toUpperCase()) {
      case 'ERROR': return c.red;
      case 'WARN': return c.yellow;
      case 'INFO': return c.green;
      case 'DEBUG': return c.gray;
      default: return c.white;
    }
  }
}
