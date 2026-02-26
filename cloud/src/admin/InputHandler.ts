/**
 * InputHandler — raw mode keyboard input.
 * Parses ANSI escape sequences for special keys.
 */

type KeyHandler = (key: string) => void;

export class InputHandler {
  private handler: KeyHandler | null = null;

  /** Set the key handler callback */
  onKey(handler: KeyHandler): void {
    this.handler = handler;
  }

  /** Enable raw mode and start listening */
  start(): void {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', this._onData);
  }

  /** Disable raw mode and stop listening */
  stop(): void {
    process.stdin.removeListener('data', this._onData);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.stdin.pause();
  }

  private _onData = (data: string): void => {
    if (!this.handler) return;

    // Parse multi-byte sequences
    const key = this.parseKey(data);
    this.handler(key);
  };

  private parseKey(data: string): string {
    // Ctrl+C
    if (data === '\x03') return 'ctrl-c';
    // Ctrl+D
    if (data === '\x04') return 'ctrl-d';
    // Escape
    if (data === '\x1b') return 'escape';
    // Enter
    if (data === '\r' || data === '\n') return 'enter';
    // Tab
    if (data === '\t') return 'tab';
    // Shift+Tab
    if (data === '\x1b[Z') return 'shift-tab';
    // Backspace
    if (data === '\x7f' || data === '\b') return 'backspace';

    // Arrow keys
    if (data === '\x1b[A') return 'up';
    if (data === '\x1b[B') return 'down';
    if (data === '\x1b[C') return 'right';
    if (data === '\x1b[D') return 'left';

    // Page up/down
    if (data === '\x1b[5~') return 'pageup';
    if (data === '\x1b[6~') return 'pagedown';

    // Home/End
    if (data === '\x1b[H' || data === '\x1b[1~') return 'home';
    if (data === '\x1b[F' || data === '\x1b[4~') return 'end';

    // Single printable char
    if (data.length === 1 && data.charCodeAt(0) >= 32) return data;

    return data;
  }
}
