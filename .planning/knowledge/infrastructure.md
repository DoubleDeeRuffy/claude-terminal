# Infrastructure Reference

## Preload Bridge (`src/main/preload.js`)

Exposes 26 API namespaces to renderer via `window.electron_api`:

`terminal` | `git` (38 methods) | `github` | `chat` | `mcp` | `mcpRegistry` | `marketplace` | `plugins` | `dialog` | `window` | `app` | `notification` | `usage` | `project` | `claude` | `hooks` | `updates` | `setupWizard` | `lifecycle` | `quickPicker` | `tray` | `fivem` | `webapp` | `api` | `python` | `remote`

Also exposes `window.electron_nodeModules`: `path`, `fs` (sync + promises), `os.homedir()`, `process.env`, `child_process.execSync`

## Data Storage

```
~/.claude-terminal/                    # App data directory
├── projects.json                      # Projects with folder hierarchy & quick actions
├── settings.json                      # User preferences (accent color, language, editor, etc.)
├── timetracking.json                  # Time tracking data (v2 format)
├── marketplace.json                   # Installed skills manifest
├── hooks/port                         # Hook event server port file
└── archives/YYYY/MM/archive-data.json # Archived time tracking sessions

~/.claude/                             # Claude Code directory
├── settings.json                      # Claude Code settings (with hooks definitions)
├── .claude.json                       # MCP server configurations
├── .credentials.json                  # OAuth tokens (accessToken, refreshToken)
├── skills/                            # Installed skills (SKILL.md + files)
├── agents/                            # Custom agents (AGENT.md + files)
├── projects/{encoded-path}/           # Session data per project
│   └── sessions-index.json
└── plugins/
    ├── installed_plugins.json
    └── known_marketplaces.json

Windows Credential Manager (via keytar)  # GitHub token storage
```

## Key Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `electron` | ^28.0.0 | Desktop framework (Chromium 120) |
| `@anthropic-ai/claude-agent-sdk` | ^0.2.42 | Claude Code streaming chat integration |
| `@xterm/xterm` | ^6.0.0 | Terminal emulator |
| `@xterm/addon-webgl` | ^0.19.0 | WebGL-accelerated terminal rendering |
| `@xterm/addon-fit` | ^0.11.0 | Auto-fit terminal to container |
| `node-pty` | ^1.1.0 | PTY process management |
| `keytar` | ^7.9.0 | OS credential storage (Windows Credential Manager) |
| `marked` | ^17.0.3 | Markdown to HTML rendering |
| `electron-updater` | ^6.1.7 | Auto-update with generic provider |
| `ws` | ^8.19.0 | WebSocket server for remote control |
| `qrcode` | ^1.5.4 | QR code generation for remote access |
| `esbuild` | ^0.27.2 | Renderer bundling (IIFE, Chrome 120 target, sourcemaps) |
| `jest` | ^29.7.0 | Unit testing (jsdom environment) |
| `playwright` | ^1.58.2 | Browser automation (screenshots, tests) |

## HTML Pages

| File | Lines | Purpose |
|------|-------|---------|
| `index.html` | 772 | Main app: titlebar (usage, time, controls), sidebar (11+ tabs), content panels, modals |
| `quick-picker.html` | 286 | Standalone quick picker with inline Node.js script |
| `setup-wizard.html` | 1476 | 7-step onboarding wizard with embedded EN/FR translations |
| `notification.html` | 207 | Custom notification with auto-dismiss progress bar |

## Project Types (`src/project-types/`)

Pluggable project type system with base class (`base-type.js`) and registry (`registry.js`):

| Type | Features |
|------|----------|
| `api/` | Route detection, API testing, dashboard |
| `fivem/` | FiveM server launcher, resource scanning, console management |
| `minecraft/` | Minecraft server support |
| `python/` | Python environment detection, venv |
| `webapp/` | Web framework detection, dev server |
| `general/` | Default fallback type |

Each type provides: `main/[Type]Service.js`, `main/[type].ipc.js`, `renderer/[Type]Dashboard.js`, `renderer/[Type]ProjectList.js`, `renderer/[Type]RendererService.js`, `renderer/[Type]State.js`, `renderer/[Type]TerminalPanel.js`, `renderer/[Type]Wizard.js`, `i18n/en.json`, `i18n/fr.json`.

## Remote Control System

- **`remote-ui/`** — PWA web interface for remote control from mobile/browser
- **`RemoteServer.js`** — WebSocket server (main process) on dynamic port, PIN 6-digit auth
- **`remote.ipc.js`** — 9 IPC handlers: get/generate PIN, server info/start/stop, notify updates
- **`RemotePanel.js`** — UI panel: PIN display, QR code generation, server status
- **Authentication:** 6-digit PIN, unique per session
- **Transport:** WebSocket (`ws` package v8.19.0)
- **QR code:** Generated via `qrcode` package v1.5.4

## CI/CD

**GitHub Actions:**

- **`ci.yml`:** Triggers on push to `main` and PRs. Matrix: Node 18 + 20 on windows-latest, ubuntu-latest, macos-latest. Steps: checkout, npm ci, build:renderer, test.
- **`release.yml`:** Triggers on `v*` tags. Builds NSIS (Windows x64), DMG (macOS arm64 + x64), AppImage (Linux x64).

**Installer:** electron-builder config in `electron-builder.config.js`. AppId: `com.yanis.claude-terminal`. NSIS per-user install with custom images. Publishes to GitHub releases.

## Bundled Resources

- **`resources/bundled-skills/`:** `create-skill` (skill creation guide), `create-agents` (agent creation guide with templates)
- **`resources/hooks/claude-terminal-hook-handler.js`:** Node.js script called by Claude hooks, forwards events via HTTP POST
- **`assets/`:** `icon.ico`, `icon.png`, `claude-mascot.svg`, `mascot-dance.svg`
- **`website/`:** Landing page, changelog, privacy policy, legal terms, mascot demo, OG generator
- **`remote-ui/`:** PWA web interface for remote control (bundled via extraResources)
