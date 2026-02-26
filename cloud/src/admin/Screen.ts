/**
 * Screen — line-based rendering to stdout.
 * Writes directly using ANSI cursor positioning.
 * No double-buffering complexity — just clear + write each frame.
 */

import { cursor, screen as scr, c, box, hline, style, visLen } from './ansi';

export class Screen {
  width: number = 80;
  height: number = 24;

  constructor() {
    this.resize();
  }

  resize(): void {
    this.width = process.stdout.columns || 80;
    this.height = process.stdout.rows || 24;
  }

  /** Enter TUI mode: alternate buffer, hide cursor, clear */
  enter(): void {
    process.stdout.write(scr.altBuffer + cursor.hide + scr.clear + cursor.home);
  }

  /** Exit TUI mode: show cursor, restore main buffer */
  exit(): void {
    process.stdout.write(cursor.show + scr.mainBuffer);
  }

  /** Clear entire screen */
  clear(): void {
    process.stdout.write(scr.clear + cursor.home);
  }

  /** Write text at row, col (1-based) */
  writeAt(row: number, col: number, text: string): void {
    process.stdout.write(cursor.moveTo(row, col) + text);
  }

  /** Write styled text at row, col */
  writeStyled(row: number, col: number, text: string, ...styles: string[]): void {
    if (styles.length) {
      this.writeAt(row, col, styles.join('') + text + c.reset);
    } else {
      this.writeAt(row, col, text);
    }
  }

  /** Draw a horizontal line at row */
  hline(row: number, col: number, width: number, ch: string = box.h): void {
    this.writeStyled(row, col, ch.repeat(width), c.gray);
  }

  /** Draw a box with optional title. Returns the starting content row. */
  drawBox(row: number, col: number, width: number, height: number, title?: string): number {
    // Top border
    let top = box.rtl + hline(width - 2) + box.rtr;
    if (title) {
      const t = ` ${title} `;
      const rest = width - 2 - t.length;
      top = style(box.rtl, c.gray) + box.h + style(t, c.bold, c.amber) + style(hline(Math.max(0, rest)), c.gray) + style(box.rtr, c.gray);
    } else {
      top = style(top, c.gray);
    }
    this.writeAt(row, col, top);

    // Sides
    for (let i = 1; i < height - 1; i++) {
      this.writeStyled(row + i, col, box.v, c.gray);
      this.writeStyled(row + i, col + width - 1, box.v, c.gray);
    }

    // Bottom border
    this.writeStyled(row + height - 1, col, box.rbl + hline(width - 2) + box.rbr, c.gray);

    return row + 1; // first content row
  }

  /** Draw a filled box (clears interior) */
  drawBoxFilled(row: number, col: number, width: number, height: number, title?: string): number {
    const contentRow = this.drawBox(row, col, width, height, title);
    for (let i = 1; i < height - 1; i++) {
      this.writeAt(row + i, col + 1, ' '.repeat(width - 2));
    }
    return contentRow;
  }
}
