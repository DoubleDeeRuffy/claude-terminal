# Main Process Reference (`src/main/`)

## IPC Handlers (`src/main/ipc/`)

| File | Handlers | Key Operations |
|------|----------|----------------|
| `terminal.ipc.js` | 4 | Create PTY (node-pty), input, resize, kill |
| `git.ipc.js` | 38 | Status, branches, pull/push, merge, clone, stash, cherry-pick, revert, worktrees (11 ops), AI commit message, file diff |
| `github.ipc.js` | 10 | OAuth Device Flow auth, workflow runs, PRs, create PR, token management |
| `chat.ipc.js` | 11 | Agent SDK streaming sessions, permissions, interrupt, model/effort switching, tab name generation, skill/agent generation |
| `dialog.ipc.js` | 18 | Window controls, file/folder dialogs, open in explorer/editor/browser, notifications, updates, startup settings, clipboard |
| `mcp.ipc.js` | 2 | Start/stop MCP server processes |
| `mcpRegistry.ipc.js` | 3 | Browse/search/detail MCP registry (`registry.modelcontextprotocol.io`) |
| `marketplace.ipc.js` | 6 | Search skills, featured, readme, install/uninstall from `skills.sh` |
| `plugin.ipc.js` | 6 | Installed plugins, catalog, marketplaces, readme, install via Claude CLI PTY |
| `usage.ipc.js` | 4 | Claude usage data (OAuth API primary, PTY `/usage` fallback), monitor start/stop |
| `claude.ipc.js` | 2 | Session listing, conversation history (parses .jsonl session files) |
| `project.ipc.js` | 1 | TODO/FIXME/HACK/XXX scanning, project stats |
| `hooks.ipc.js` | 4 | Install/remove/status/verify hooks in `~/.claude/settings.json` |
| `remote.ipc.js` | 9 | Get/generate PIN, server info/start/stop, notify projects/session/tab/time |
| `fivem.ipc.js` | - | Delegated to `src/project-types/fivem/` |
| `index.js` | - | Orchestrator - registers all handlers |

**Total: 118 IPC handlers**

## Services (`src/main/services/`)

| Service | Purpose | Key Detail |
|---------|---------|------------|
| `TerminalService.js` | node-pty management | PowerShell default, adaptive output batching (4ms/16ms/32ms), Claude CLI launch with `--resume` |
| `ChatService.js` | Claude Agent SDK bridge | Streaming input mode, `maxTurns: 100`, permission forwarding, persistent haiku naming session |
| `GitHubAuthService.js` | GitHub OAuth + API | Device Flow, keytar credential storage, Client ID: `Ov23liYfl42qwDVVk99l` |
| `UsageService.js` | Claude usage tracking | OAuth API (`api.anthropic.com/api/oauth/usage`), PTY fallback, 5min staleness |
| `McpService.js` | MCP server processes | Child process spawning with env vars, force-kill via taskkill |
| `MarketplaceService.js` | Skill marketplace | `skills.sh/api/search`, git clone install, caching (5-30min TTL) |
| `McpRegistryService.js` | MCP server registry | `registry.modelcontextprotocol.io/v0.1`, pagination, caching |
| `PluginService.js` | Claude Code plugins | Read metadata, PTY-based `/plugin install` execution |
| `UpdaterService.js` | Auto-updates | electron-updater, 30min periodic checks, stale cache cleanup |
| `HooksService.js` | Claude hooks management | 15 hook types, non-destructive install, auto-backup/repair |
| `HookEventServer.js` | Hook event receiver | HTTP server on `127.0.0.1:0`, receives POST from hook handler |
| `RemoteServer.js` | WebSocket remote control | WS server on dynamic port, PIN 6-digit auth, broadcast updates to remote-ui |
| `FivemService.js` | FiveM server launcher | Delegated to project-types |

## Windows (`src/main/windows/`)

| Window | Config | Purpose |
|--------|--------|---------|
| `MainWindow.js` | 1400x900, min 1000x600, frameless | Main app, tray minimize, Ctrl+Arrow tab navigation |
| `QuickPickerWindow.js` | 600x400, always-on-top, transparent | Quick project picker (Ctrl+Shift+P) |
| `SetupWizardWindow.js` | 900x650 | 7-step first-launch wizard (language, color, editor, hooks) |
| `TrayManager.js` | System tray | Context menu: Open, Quick Pick, New Terminal, Quit |
| `NotificationWindow.js` | Small overlay | Custom notification with auto-dismiss progress bar |

## Utilities (`src/main/utils/`)

| Utility | Purpose |
|---------|---------|
| `paths.js` | Path constants (`~/.claude-terminal/`, `~/.claude/`), `ensureDataDir()`, `loadAccentColor()` |
| `git.js` | 20+ git operations via `execGit()`, status parsing, safe.directory handling, 15s timeout, worktree support (7 functions) |
| `commitMessageGenerator.js` | AI commit via GitHub Models API (gpt-4o-mini), heuristic fallback |
| `shell.js` | Shell utilities (PATH resolution for macOS/Linux) |
