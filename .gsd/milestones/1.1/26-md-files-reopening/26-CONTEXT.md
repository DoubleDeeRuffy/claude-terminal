# Phase 26: MD-Files-Reopening — Context

## Phase Goal
Persist and restore file tabs across app restarts, so users don't lose their open files when closing/reopening Claude Terminal.

## Decisions

### 1. Scope of File Types
- **All file tabs** are persisted and restored — not just `.md` files
- Same mechanism for all types: store `filePath`, call `openFileTab()` on restore
- **No dependency on PR #23** (markdown viewer) — build against current `main`; when the markdown viewer merges, `.md` files will automatically get enhanced rendering
- **No cap** on restored file tabs — restore everything, matching terminal tab behavior

### 2. Restore Behavior
- **Missing files: skip silently** — if the file no longer exists at restore time, don't create the tab, no notification
- **Load strategy: use `openFileTab()` as-is** — call the existing function for each restored file tab; whatever it does today (immediate read + render), keep it
- **Settings: same toggle** — file tab restore is controlled by the existing `restoreTerminalSessions` setting; no new toggle

### 3. Tab Ordering & Active State
- **All tabs preserve original order** — every tab (terminal and file) restores at its exact position; the full tab bar order from shutdown is reproduced on restore
- **Active tab restored** — whichever tab (terminal or file) was active at shutdown becomes active on restore
- **Project scoping: match current behavior** — don't change visibility rules; file tabs follow the same project-scoping as they do today

## Code Context

### Key files to modify
- `src/renderer/services/TerminalSessionService.js` — Add file tab serialization to `saveTerminalSessionsImmediate()` and deserialization to `loadSessionData()` consumer
- `src/renderer/ui/components/TerminalManager.js` — Restore file tabs during session restore flow, use `openFileTab()` for each

### Current session data structure
```json
{
  "version": 1,
  "projects": {
    "<projectId>": {
      "tabs": [
        { "cwd": "...", "isBasic": false, "mode": "terminal", "claudeSessionId": null, "name": null }
      ],
      "activeCwd": "...",
      "activeTabIndex": 0,
      "explorer": { ... }
    }
  }
}
```

### What needs to change
- Tab entries need a `type` field: `"terminal"` (default/existing) or `"file"`
- File tabs store `filePath` instead of `cwd`/`mode`/`claudeSessionId`
- Save loop in `saveTerminalSessionsImmediate()` currently skips non-project tabs (`if (!td.project?.id) continue`) — file tabs may need project association
- Restore loop must interleave file and terminal tabs in original order
- Active tab tracking must work for both file and terminal tabs

### Existing patterns to follow
- Atomic writes (temp + rename) — already used in TerminalSessionService
- `openFileTab()` already deduplicates by filePath — safe to call during restore
- File tabs use `type: 'file'` in terminalsState and ID format `file-${Date.now()}`

## Deferred Ideas
_(None captured during discussion)_
