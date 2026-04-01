# Phase 34: Tab-Rename-Contextmenu - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Add an "AI Rename" menu item to the tab right-click context menu that triggers the existing `generateTabName` Haiku mechanism on demand. This is a single new context menu entry — no new AI naming infrastructure, no settings changes.

</domain>

<decisions>
## Implementation Decisions

### Input source
- Use the terminal's current OSC title as input to `api.chat.generateTabName()`
- Same input source as the automatic AI naming already uses

### Menu placement
- Place "AI Rename" directly below the existing "Rename" item in `showTabContextMenu()`
- No additional separator between "Rename" and "AI Rename" — they are grouped as related actions
- Separator after "AI Rename" (the existing one after "Rename" moves down)

### Feedback during rename
- Show brief loading indicator while Haiku generates the name (e.g., set tab name to "..." or similar)
- Revert to original tab name if Haiku fails or times out
- Replace with Haiku's response on success

### Claude's Discretion
- Exact loading indicator style (text like "..." vs opacity/pulse)
- Icon choice for the "AI Rename" menu item
- Whether to disable the menu item when `aiTabNaming` setting is off, or hide it entirely

</decisions>

<specifics>
## Specific Ideas

- Should feel like a quick one-click action — no prompts or dialogs
- Follows the same pattern as the automatic rename but user-initiated

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ChatService.generateTabName(userMessage)` (`src/main/services/ChatService.js:744`): Persistent Haiku session, takes a string, returns a short tab name
- `api.chat.generateTabName({ userMessage })`: Renderer-side IPC call via preload bridge
- `updateTerminalTabName(id, name)`: Updates tab DOM + persists to session-names.json
- `showTabContextMenu(e, id)` (`src/renderer/ui/components/TerminalManager.js:1292`): Builds context menu items

### Established Patterns
- AI tab naming checks `getSetting('aiTabNaming') !== false` before renaming
- Tab name persistence handled by `updateTerminalTabName()` which writes to session-names.json
- Context menu items use `{ label, icon, shortcut?, disabled?, onClick }` shape via `showContextMenu()`

### Integration Points
- `showTabContextMenu()` in TerminalManager.js — add new menu item after "Rename"
- i18n keys needed in `en.json` and `fr.json` under `tabs.` namespace
- OSC title available from xterm terminal instance or from `terminalContext` map

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 34-tab-rename-contextmenu*
*Context gathered: 2026-03-07*
