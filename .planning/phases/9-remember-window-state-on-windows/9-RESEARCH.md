# Phase 9: Remember Window State On Windows - Research

**Researched:** 2026-02-25
**Domain:** Electron window state persistence (main process, BrowserWindow, screen module)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Restore scope:** Persist x, y, width, height, isMaximized. No fullscreen state tracking.
- **Maximized behavior:** When closed maximized, restore as maximized. Save normal bounds separately so un-maximize restores proper size.
- **Multi-monitor strategy:** Save absolute screen coordinates plus a monitor identifier. If saved monitor is available, restore to it. If disconnected, center on primary at default size. If position is off-screen (resolution change), full reset to center — no partial clamping.
- **First-launch behavior:** Keep current defaults (1400x900, centered). Persistence kicks in after first user interaction with the window. No reset button or shortcut.
- **Persistence timing:** Debounced save on every move/resize event (crash-resilient) + save on close as final checkpoint.
- **Storage location:** Existing `~/.claude-terminal/settings.json` under a `windowState` key.

### Claude's Discretion

- Debounce interval for move/resize saves
- Monitor identification strategy (display ID, bounds hash, etc.)
- Atomic write pattern (consistent with existing codebase conventions)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

## Summary

Phase 9 adds window state persistence to the Electron main process. When the app closes (or the window moves/resizes), the window's position, size, and maximized state are saved to `~/.claude-terminal/settings.json` under a `windowState` key. On startup, the saved state is read before `new BrowserWindow()` is called so the window spawns at the correct position and size immediately (no flicker).

The entire feature lives in `src/main/windows/MainWindow.js` and `src/main/utils/paths.js`. No new files, no new npm packages, no renderer changes. Electron's built-in `screen` module provides display enumeration for multi-monitor validation. The existing `settingsFile` path and the project's atomic-write convention (write to `.tmp`, then rename) are used for persistence.

The tricky part is the multi-monitor guard: a position is only valid if a display still exists that contains the saved bounds. If not — full reset to 1400x900 centered on primary. The "track normal bounds while maximized" pattern requires listening to `resize`/`move` events and ignoring them when `isMaximized()` is true.

**Primary recommendation:** Implement entirely in the main process — no new library, no IPC, no renderer changes. Use `electron.screen.getAllDisplays()` for monitor validation. Debounce move/resize saves at 500ms (consistent with existing settings debounce). Store under `windowState` key in existing `settings.json`.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `electron.screen` | built-in (Electron 28) | Enumerate displays, get display for point | No install — already in Electron; official API for multi-monitor detection |
| `BrowserWindow` | built-in (Electron 28) | `setBounds()`, `setPosition()`, `maximize()`, `getBounds()`, `isMaximized()` | All window state APIs |
| `fs` (Node built-in) | Node 18 | Atomic write to settings.json | Consistent with rest of codebase |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `electron-window-state` | ~5.0.3 | Third-party helper that wraps the above pattern | Only worth adding for complex multi-window apps; overkill for a single-window app with existing settings infrastructure |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled in `MainWindow.js` | `electron-window-state` npm package | Package handles edge cases but adds a dependency; project already has settings.json infrastructure that covers all requirements; hand-rolled is fewer moving parts |
| `windowState` key in `settings.json` | Separate `window-state.json` file | Separate file adds complexity; context decision locked this to settings.json |

**Installation:** No new packages required.

---

## Architecture Patterns

### Recommended Project Structure

All changes land in exactly two existing files:

```
src/main/
├── windows/
│   └── MainWindow.js      # Add: loadWindowState(), saveWindowState(), debounce timer, screen validation
└── utils/
    └── paths.js            # No change needed (settingsFile path already exported)
```

The settings.json `windowState` key is written/read from the main process only. The renderer never touches window geometry.

### Pattern 1: Read State Before Window Creation

**What:** Load persisted window state synchronously before calling `new BrowserWindow()`, then pass `x`, `y`, `width`, `height` directly to the constructor. If no saved state or invalid, use defaults.

**When to use:** Always — this prevents the window from appearing at the wrong position for one frame before being moved.

**Example:**
```js
// In createMainWindow(), before `new BrowserWindow(...)`
const savedState = loadWindowState(); // sync read from settings.json
const windowOptions = {
  width: savedState ? savedState.width : 1400,
  height: savedState ? savedState.height : 900,
  x: savedState ? savedState.x : undefined,
  y: savedState ? savedState.y : undefined,
  // ... rest of options
};
const mainWindow = new BrowserWindow(windowOptions);
if (savedState && savedState.isMaximized) {
  mainWindow.maximize();
}
```

### Pattern 2: Track Normal Bounds Separately From Maximized State

**What:** Only update `normalBounds` when the window is NOT maximized. When maximized, only update the `isMaximized` flag. On close, save the current `isMaximized` and the stored `normalBounds`.

**Why:** `getBounds()` on a maximized window returns the maximized dimensions (full screen). If you save those as normal bounds, un-maximize will try to restore to full-screen size.

**Example:**
```js
let normalBounds = null; // persisted between move/resize events

mainWindow.on('resize', () => {
  if (!mainWindow.isMaximized()) {
    normalBounds = mainWindow.getBounds();
    debouncedSave();
  }
});
mainWindow.on('move', () => {
  if (!mainWindow.isMaximized()) {
    normalBounds = mainWindow.getBounds();
    debouncedSave();
  }
});
mainWindow.on('maximize', () => { debouncedSave(); });
mainWindow.on('unmaximize', () => {
  normalBounds = mainWindow.getBounds();
  debouncedSave();
});
```

### Pattern 3: Monitor Validation With `electron.screen`

**What:** Before restoring saved position, verify the saved display still exists and the position is actually on-screen. Use `screen.getAllDisplays()` and `screen.getDisplayMatching()` or manual intersection check.

**When to use:** Every startup before passing `x`/`y` to BrowserWindow.

**Example:**
```js
const { screen } = require('electron');

function isPositionOnScreen(x, y, width, height) {
  const displays = screen.getAllDisplays();
  return displays.some(display => {
    const { bounds } = display;
    // Check if the window's top-left corner is within this display
    return x >= bounds.x && x < bounds.x + bounds.width &&
           y >= bounds.y && y < bounds.y + bounds.height;
  });
}
```

**Monitor identification for the `windowState` object:**
```js
// Identify monitor by its bounds (stable across reboots if monitors don't change)
function getMonitorId(x, y) {
  const display = screen.getDisplayNearestPoint({ x, y });
  const { bounds } = display;
  return `${bounds.x},${bounds.y},${bounds.width}x${bounds.height}`;
}
```

### Pattern 4: Existing Atomic Write Convention

The project writes `.tmp` then renames. For window state, the save merges the `windowState` key into the existing settings object:

```js
const { settingsFile } = require('../utils/paths');

function saveWindowState(state) {
  try {
    let current = {};
    if (fs.existsSync(settingsFile)) {
      current = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    }
    current.windowState = state;
    const tmp = settingsFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(current, null, 2), 'utf8');
    fs.renameSync(tmp, settingsFile);
  } catch (e) {
    console.error('[MainWindow] Failed to save window state:', e);
  }
}
```

### Pattern 5: Save on 'close' Event (Not 'closed')

**What:** The `close` event fires before the window is destroyed. The `closed` event fires after — at which point `mainWindow` is null and `getBounds()` is unavailable.

**Critical detail:** The existing `close` handler in `MainWindow.js` calls `event.preventDefault()` to minimize to tray when `!isQuitting`. Window state must be saved BEFORE this check prevents the window from closing, because the user might force-quit via `app-quit` which goes through a different path. Save unconditionally on `close`:

```js
mainWindow.on('close', () => {
  // Save final state regardless of minimize-to-tray behavior
  saveWindowStateImmediate(mainWindow);
  // ... existing minimize-to-tray logic
});
```

### Anti-Patterns to Avoid

- **Using `setBounds()` after creation instead of constructor params:** Causes visible position jump.
- **Saving `getBounds()` while maximized:** Returns maximized dimensions, not the useful normal size.
- **Skipping screen validation:** Window appears off-screen after display configuration changes.
- **Writing `x`/`y` as `undefined` to BrowserWindow constructor when no saved state:** Pass `undefined` for centering (Electron centers if `x`/`y` are omitted from options object, NOT if passed as `undefined`). Solution: only spread `x`/`y` into options when they are defined numbers.
- **Race condition on app-quit path:** `app-quit` IPC sets `isQuitting = true` then calls `app.quit()`. The `close` event fires on the way out — always save there, not in `before-quit`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Display enumeration | Custom screen detection via native APIs | `electron.screen.getAllDisplays()` | Built-in, returns accurate DPI-aware bounds on Windows HiDPI |
| Window bounds | `getBounds()` re-implementation | `mainWindow.getBounds()` | Returns `{ x, y, width, height }` in physical pixels |
| Is-on-screen check | Complex polygon intersection | Simple `bounds.x <= x < bounds.x + bounds.width` per display | Sufficient; window top-left must land on a display |

**Key insight:** Electron's `screen` module does all the hard multi-monitor work. The custom logic needed is only the "what to do when validation fails" fallback.

---

## Common Pitfalls

### Pitfall 1: HiDPI / DPI Scaling on Windows

**What goes wrong:** On Windows with display scaling (125%, 150%, etc.), `getBounds()` returns logical pixel values but the coordinates may differ from what `screen.getAllDisplays()` reports if the app sets `BrowserWindow`'s `resizable` or if `app.commandLine.appendSwitch('disable-features', 'HiDPISupport')` is used.

**Why it happens:** Electron normalizes coordinates to device-independent pixels (DIPs) by default in Electron 28. `screen.getAllDisplays()` also returns DIP bounds. They should be consistent.

**How to avoid:** No special handling needed in Electron 28 — both APIs use the same coordinate system. Confidence: MEDIUM (consistent behavior documented, but edge cases with mixed-DPI setups are reported in community; verify during UAT on a HiDPI machine).

**Warning signs:** Window appears slightly off from where it was closed on a HiDPI display.

### Pitfall 2: `close` Event vs `before-quit` Event Ordering

**What goes wrong:** Saving window state in `app.on('before-quit')` instead of `mainWindow.on('close')` means state is not saved when the user minimizes to tray and the process later is killed (e.g., Task Manager, system shutdown).

**Why it happens:** `before-quit` only fires when Electron's quit sequence starts, not on process signals.

**How to avoid:** Save on `mainWindow.on('close')` unconditionally (as the final checkpoint), plus the debounced saves on move/resize.

### Pitfall 3: Restoring to Taskbar-Hidden Position (y < 0 or y > screenHeight - taskbarHeight)

**What goes wrong:** On Windows, if the taskbar is at the top and the window was positioned at y=0, restoring to y=0 may put the title bar under the taskbar. The user configured "if off-screen, reset" — but "technically on screen" (y=0 is valid on most displays) is distinct from "accessible."

**Why it happens:** The screen bounds don't account for the taskbar work area.

**How to avoid:** Use `display.workArea` (not `display.bounds`) for the on-screen validation. `workArea` excludes the taskbar and other reserved UI areas on Windows.

```js
// Use workArea, not bounds, for validation
return displays.some(display => {
  const { workArea } = display;
  return x >= workArea.x && x < workArea.x + workArea.width &&
         y >= workArea.y && y < workArea.y + workArea.height;
});
```

### Pitfall 4: `undefined` vs Omitted Keys in BrowserWindow Options

**What goes wrong:** `new BrowserWindow({ x: undefined, y: undefined, ... })` may not center the window on some Electron versions — behavior is inconsistent for explicitly-passed `undefined`.

**How to avoid:** Build the options object conditionally:
```js
const winOpts = { width: ..., height: ..., ... };
if (typeof savedX === 'number' && typeof savedY === 'number') {
  winOpts.x = savedX;
  winOpts.y = savedY;
}
const mainWindow = new BrowserWindow(winOpts);
```

### Pitfall 5: `maximize()` Must Be Called After `loadFile()`

**What goes wrong:** Calling `mainWindow.maximize()` immediately after construction but before `loadFile()` on some Windows versions causes the window to render at incorrect dimensions.

**How to avoid:** Call `maximize()` after `mainWindow.loadFile(htmlPath)` — or use `mainWindow.once('ready-to-show', () => mainWindow.maximize())` if `show: false` is used. The current codebase does NOT use `show: false`, so calling `maximize()` right after `loadFile()` or even after construction should be fine. Confirm during testing.

---

## Code Examples

### loadWindowState() — main process, sync read

```js
// Source: Electron BrowserWindow docs + project conventions
const fs = require('fs');
const { settingsFile } = require('../utils/paths');

function loadWindowState() {
  try {
    if (!fs.existsSync(settingsFile)) return null;
    const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    return settings.windowState || null;
  } catch (e) {
    return null;
  }
}
```

### validateWindowState() — screen bounds check using workArea

```js
// Source: Electron screen module docs
const { screen } = require('electron');

function validateWindowState(state) {
  if (!state || typeof state.x !== 'number' || typeof state.y !== 'number') {
    return null;
  }
  const displays = screen.getAllDisplays();
  const onScreen = displays.some(d => {
    const { workArea } = d;
    return state.x >= workArea.x && state.x < workArea.x + workArea.width &&
           state.y >= workArea.y && state.y < workArea.y + workArea.height;
  });
  if (!onScreen) return null;
  return state;
}
```

### saveWindowState() — atomic merge write

```js
// Source: project convention (TerminalSessionService.js atomic write pattern)
let saveTimer = null;

function saveWindowState(win) {
  const isMaximized = win.isMaximized();
  const bounds = isMaximized ? normalBounds : win.getBounds();
  if (!bounds) return;
  const state = {
    x: bounds.x, y: bounds.y,
    width: bounds.width, height: bounds.height,
    isMaximized
  };
  try {
    let current = {};
    if (fs.existsSync(settingsFile)) {
      current = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    }
    current.windowState = state;
    const tmp = settingsFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(current, null, 2), 'utf8');
    fs.renameSync(tmp, settingsFile);
  } catch (e) {
    console.error('[MainWindow] saveWindowState failed:', e);
  }
}

function debouncedSave(win) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveWindowState(win), 500);
}
```

### Full createMainWindow() integration sketch

```js
function createMainWindow({ isDev = false } = {}) {
  // 1. Load + validate saved state
  const savedState = validateWindowState(loadWindowState());

  // 2. Build window options
  const winOpts = {
    width: savedState ? savedState.width : 1400,
    height: savedState ? savedState.height : 900,
    minWidth: 1000,
    minHeight: 600,
    // ... rest of existing options
  };
  if (savedState) {
    winOpts.x = savedState.x;
    winOpts.y = savedState.y;
  }

  mainWindow = new BrowserWindow(winOpts);
  mainWindow.loadFile(htmlPath);

  // 3. Restore maximized
  if (savedState && savedState.isMaximized) {
    mainWindow.maximize();
  }

  // 4. Track normal bounds
  let normalBounds = savedState && !savedState.isMaximized
    ? { x: savedState.x, y: savedState.y, width: savedState.width, height: savedState.height }
    : null;

  function onBoundsChanged() {
    if (!mainWindow.isMaximized()) {
      normalBounds = mainWindow.getBounds();
      debouncedSave(mainWindow, normalBounds);
    }
  }

  mainWindow.on('resize', onBoundsChanged);
  mainWindow.on('move', onBoundsChanged);
  mainWindow.on('maximize', () => saveWindowStateNow(mainWindow, normalBounds));
  mainWindow.on('unmaximize', () => {
    normalBounds = mainWindow.getBounds();
    saveWindowStateNow(mainWindow, normalBounds);
  });

  // 5. Final save on close
  mainWindow.on('close', () => {
    saveWindowStateNow(mainWindow, normalBounds);
    // existing: if (!isQuitting) { event.preventDefault(); mainWindow.hide(); }
  });

  // ... rest of existing setup
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `electron-window-state` npm package | Hand-rolled in main process using `electron.screen` | N/A — project was always without it | No extra dependency; slightly more code but full control |
| Saving in `app.on('before-quit')` | Saving on `mainWindow.on('close')` | Best practice since Electron ~6 | More crash-resilient (also saves when minimized to tray then process killed) |

**Deprecated/outdated:**
- `screen.on('display-added/removed')` for dynamic monitor detection: Not needed here — we only validate on startup, not dynamically.

---

## Open Questions

1. **HiDPI coordinate consistency on mixed-DPI setups (e.g., laptop screen at 150% + external at 100%)**
   - What we know: Electron 28 uses DIPs; `screen.getAllDisplays()` returns DIP bounds
   - What's unclear: Whether Windows mixed-DPI setups cause coordinate space mismatches in practice
   - Recommendation: Standard validation logic should handle this; flag for UAT on a HiDPI machine if available

2. **Debounce interval: 500ms vs shorter**
   - What we know: The existing codebase uses 300ms (terminal sessions) and 500ms (settings, projects)
   - What's unclear: Whether 500ms is perceptibly slow for window drag responsiveness
   - Recommendation: Use 500ms to match settings.json writes; move/resize events fire rapidly enough that a slightly longer debounce reduces I/O without user-visible impact

3. **`maximize()` timing relative to `loadFile()`**
   - What we know: The codebase does not use `show: false`; window is shown immediately on creation
   - What's unclear: Whether `maximize()` before `ready-to-show` causes a visual glitch on Windows
   - Recommendation: Call `maximize()` right after `loadFile()` as shown in examples; address if UAT reveals a flash

---

## Sources

### Primary (HIGH confidence)

- Electron BrowserWindow docs (https://www.electronjs.org/docs/latest/api/browser-window) — `setBounds`, `getBounds`, `isMaximized`, `maximize`, constructor options, event list
- Electron screen module docs (https://www.electronjs.org/docs/latest/api/screen) — `getAllDisplays`, `workArea` vs `bounds`
- Project codebase: `src/main/windows/MainWindow.js` — existing window creation, close handler, minimize-to-tray pattern
- Project codebase: `src/renderer/services/TerminalSessionService.js` — atomic write pattern (tmp + rename)
- Project codebase: `src/main/utils/paths.js` — `settingsFile` path
- Project codebase: `src/renderer/state/settings.state.js` — 500ms debounce convention

### Secondary (MEDIUM confidence)

- `electron-window-state` source (npm) — confirms the standard pattern for the "save normal bounds while maximized" problem; same approach used here

### Tertiary (LOW confidence)

- Community reports of HiDPI coordinate edge cases in mixed-DPI Windows setups — LOW confidence, unverified against Electron 28 changelog

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all tools are Electron built-ins; no external packages needed
- Architecture: HIGH — patterns derived directly from existing codebase conventions and Electron docs
- Pitfalls: MEDIUM — `workArea` vs `bounds` and `undefined` key gotchas are well-documented; HiDPI edge case is LOW

**Research date:** 2026-02-25
**Valid until:** 2026-08-25 (stable Electron APIs — unlikely to change within 6 months)
