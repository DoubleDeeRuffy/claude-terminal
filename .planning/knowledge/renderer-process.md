# Renderer Process Reference (`src/renderer/`)

## Initialization Flow (`src/renderer/index.js`)

1. Platform detection (add class `platform-{win32|darwin|linux}` on body)
2. `utils.ensureDirectories()` - Create data dirs
3. `state.initializeState()` - Load all state modules
4. Load i18n with saved language or auto-detect
5. Initialize settings (apply accent color)
6. Register MCP, WebApp, FiveM event listeners
7. Initialize Claude event bus (hooks/scraping providers)
8. Load disk-cached dashboard data
9. Preload all projects (500ms delay)

## State Management (`src/renderer/state/`)

Base class `State.js`: Observable with `subscribe()`, batched notifications via `requestAnimationFrame`.

| Module | State Shape | Key Features |
|--------|-------------|--------------|
| `projects.state.js` | `{ projects[], folders[], rootOrder[], selectedProjectFilter, openedProjectId }` | CRUD, folder nesting, quick actions, color/icon, debounced save (500ms), atomic writes |
| `terminals.state.js` | `{ terminals: Map, activeTerminal, detailTerminal }` | Per-project terminal tracking, stats |
| `settings.state.js` | `{ editor, accentColor, language, defaultTerminalMode, chatModel, ... }` | 15 settings, debounced persistence |
| `timeTracking.state.js` | `{ version, month, global, projects }` per session | 15min idle timeout, midnight rollover, 30min session merge, monthly archival |
| `mcp.state.js` | `{ mcps[], mcpProcesses{}, selectedMcp }` | Status tracking, 1000-entry log limit |
| `git.state.js` | `{ gitOperations: Map, gitRepoStatus: Map }` | Pull/push/merge state per project |
| `fivem.state.js` | FiveM resource state | Resource scanning results |

**Additional simple states (in index.js):** `quickPickerState`, `dragState`, `contextMenuState`, `skillsAgentsState`

## Services (`src/renderer/services/`)

| Service | Purpose |
|---------|---------|
| `TerminalService.js` | xterm.js creation (WebGL, 10k scrollback), mount, fit, IPC wrappers |
| `ProjectService.js` | Add/delete/open projects, editor integration, git status check |
| `SettingsService.js` | Accent color DOM application, notification permissions, window title |
| `DashboardService.js` | HTML builders (`buildXxxHtml()`), data caching (30s TTL), disk cache |
| `TimeTrackingDashboard.js` | Time tracking charts & statistics |
| `GitTabService.js` | Git operations UI helpers, status display |
| `McpService.js` | Load/save MCP configs from `~/.claude.json` |
| `SkillService.js` | Load skills from `~/.claude/skills/` with YAML frontmatter |
| `AgentService.js` | Load agents from `~/.claude/agents/` |
| `ArchiveService.js` | Past-month time tracking archival |
| `FivemService.js` | FiveM IPC wrapper |
| `ContextPromptService.js` | Context prompts management for chat |

## UI Components (`src/renderer/ui/components/`)

| Component | Purpose |
|-----------|---------|
| `ProjectList.js` | Hierarchical project/folder tree with drag-drop |
| `TerminalManager.js` | Terminal tabs, xterm rendering, active switching, multi-terminal per project |
| `ChatView.js` | Chat interface for Agent SDK sessions, markdown rendering, permission handling |
| `FileExplorer.js` | Integrated file tree browser with file operations |
| `Modal.js` | Reusable modal (small/medium/large), ESC/overlay close |
| `CustomizePicker.js` | Project customization (color, icon, name) |
| `QuickActions.js` | Per-project quick action configuration |
| `ContextMenu.js` | Right-click menus for projects/folders |
| `Tab.js` | Tab navigation component |
| `Toast.js` | Non-blocking toast notifications |
| `MenuSection.js` | Menu section grouping |

## UI Panels (`src/renderer/ui/panels/`)

| Panel | Purpose |
|-------|---------|
| `SettingsPanel.js` | App settings, accent color, language, editor, startup, hooks config |
| `GitChangesPanel.js` | Git status, staging, unstaging, commit, push/pull, inline diff viewer |
| `McpPanel.js` | MCP server management, start/stop, config |
| `PluginsPanel.js` | Claude Code plugins browse, install, uninstall |
| `SkillsAgentsPanel.js` | Skills and agents display |
| `MarketplacePanel.js` | Skill marketplace search and installation |
| `MemoryEditor.js` | MEMORY.md editor |
| `ShortcutsManager.js` | Keyboard shortcuts configuration |
| `RemotePanel.js` | Remote control interface (PIN display, QR code, server start/stop) |

## Features (`src/renderer/features/`)

| Feature | Shortcuts |
|---------|-----------|
| `KeyboardShortcuts.js` | `Ctrl+T` new terminal, `Ctrl+W` close, `Ctrl+P` quick picker, `Ctrl+,` settings, `Ctrl+Tab`/`Ctrl+Shift+Tab` switch terminals, `Escape` close overlays |
| `QuickPicker.js` | Arrow navigation, Enter select, Escape close, real-time search |
| `DragDrop.js` | HTML5 drag-drop for projects/folders reordering |

**Global shortcuts** (registered in main process): `Ctrl+Shift+P` (quick picker), `Ctrl+Shift+T` (new terminal)

## Events System (`src/renderer/events/`)

| Module | Purpose |
|--------|---------|
| `ClaudeEventBus.js` | Pub-sub for Claude activity (SESSION_START/END, TOOL_START/END, PROMPT_SUBMIT) |
| `HooksProvider.js` | Event detection via Claude hooks (HTTP event server) |
| `ScrapingProvider.js` | Fallback event detection via terminal output parsing |
| `index.js` | Provider selection, wires consumers (time tracking, notifications, dashboard) |

## Internationalization (`src/renderer/i18n/`)

- **Languages:** French (default), English
- **Keys:** ~800 per locale file
- **System:** Dot-notation keys with `{variable}` interpolation
- **Detection:** Auto-detect from `navigator.language`, fallback to `fr`
- **Files:** `locales/en.json`, `locales/fr.json`
- **Usage:** `t('projects.openFolder')`, `t('key', { count: 5 })`
- **HTML:** `data-i18n` attributes for static text
