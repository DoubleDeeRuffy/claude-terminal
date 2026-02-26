/**
 * RoomsTab — Live relay connections.
 * Queries /admin/rooms for real-time data. Auto-refresh 1s.
 */

import { Screen } from '../Screen';
import { c, style, padR, fmtTime, fmtDuration } from '../ansi';

export interface RoomInfo {
  userName: string;
  hasDesktop: boolean;
  mobileCount: number;
  desktopConnectedAt: number | null;
}

export class RoomsTab {
  private screen: Screen;
  private serverUrl: string;
  private rooms: RoomInfo[] = [];
  selectedIndex: number = 0;

  constructor(screen: Screen, serverUrl: string) {
    this.screen = screen;
    this.serverUrl = serverUrl;
  }

  async load(): Promise<void> {
    try {
      const res = await fetch(`${this.serverUrl}/admin/rooms`);
      this.rooms = await res.json() as RoomInfo[];
    } catch {
      this.rooms = [];
    }
  }

  render(): void {
    const s = this.screen;
    const w = s.width - 4;
    const col = 3;

    if (this.rooms.length === 0) {
      s.writeStyled(6, col, 'No active relay connections.', c.gray);
      s.writeStyled(7, col, 'Rooms appear when desktops or mobiles connect.', c.gray);
      return;
    }

    // ── Table ──
    const maxRows = Math.min(this.rooms.length, s.height - 12);
    const tableH = maxRows + 4;
    const r = s.drawBox(5, col, w, tableH, `Active Relay Connections (${this.rooms.length})`);

    // Header
    const nameW = 20;
    const deskW = 12;
    const mobW = 10;
    const sinceW = 20;
    const durW = 14;
    const header = padR('USER', nameW) + padR('DESKTOP', deskW) + padR('MOBILES', mobW) + padR('SINCE', sinceW) + 'DURATION';
    s.writeStyled(r, col + 2, header, c.bold, c.gray);
    s.writeStyled(r + 1, col + 2, '─'.repeat(w - 4), c.gray);

    // Rows
    for (let i = 0; i < maxRows; i++) {
      if (i >= this.rooms.length) break;
      const room = this.rooms[i];
      const isSelected = i === this.selectedIndex;

      const deskIcon = room.hasDesktop ? style('✓', c.green) : style('✗', c.red);
      const mobStr = room.mobileCount > 0 ? style(String(room.mobileCount), c.green) : style('0', c.gray);
      const since = room.desktopConnectedAt ? fmtTime(room.desktopConnectedAt) : style('—', c.gray);
      const dur = room.desktopConnectedAt ? fmtDuration(Date.now() - room.desktopConnectedAt) : '—';

      const prefix = isSelected ? style('▸ ', c.amber) : '  ';
      const nameStyle = isSelected ? style(padR(room.userName, nameW - 2), c.bold, c.white) : padR(room.userName, nameW - 2);

      s.writeAt(r + 2 + i, col + 2,
        prefix + nameStyle +
        padR(`  ${deskIcon}`, deskW) +
        padR(`  ${mobStr}`, mobW) +
        padR(since, sinceW) +
        dur
      );
    }

    // Summary
    const totalDesktops = this.rooms.filter(r => r.hasDesktop).length;
    const totalMobiles = this.rooms.reduce((sum, r) => sum + r.mobileCount, 0);
    const summaryRow = 5 + tableH + 1;
    s.writeAt(summaryRow, col,
      style(`${totalDesktops} desktop(s)  `, c.cyan) +
      style(`${totalMobiles} mobile(s)  `, c.amber) +
      style(`${this.rooms.length} room(s)`, c.gray)
    );
  }

  onKey(key: string): void {
    switch (key) {
      case 'up':
        this.selectedIndex = Math.max(0, this.selectedIndex - 1);
        break;
      case 'down':
        this.selectedIndex = Math.min(this.rooms.length - 1, this.selectedIndex + 1);
        break;
    }
  }
}
