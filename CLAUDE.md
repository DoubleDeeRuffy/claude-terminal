# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claude Terminal is a cross-platform Electron desktop application (v0.9.6) for managing Claude Code projects with an integrated terminal, chat UI, git management, and plugin ecosystem. Primary target: Windows 10/11 with NSIS installer. Also builds for macOS (DMG) and Linux (AppImage).

**Repository:** `github.com/Sterll/claude-terminal` | **License:** GPL-3.0 | **Author:** Yanis

## Build & Development Commands

```bash
npm install              # Install dependencies (Node >=18 required, runs electron-rebuild)
npm start                # Build renderer + run app
npm start -- --dev       # Run with DevTools enabled (start:dev script)
npm run watch            # Build renderer in watch mode (esbuild)
npm run build:renderer   # Build renderer only → dist/renderer.bundle.js
npm run build            # Build installer (NSIS/DMG/AppImage) → build/
npm test                 # Run Jest tests (jsdom environment)
npm run test:watch       # Jest in watch mode
```

**Important:** Always run `npm run build:renderer` after modifying any file in `src/renderer/`, `src/project-types/`, or `renderer.js`.

## Architecture Overview

```
Electron Main Process (Node.js)
├── main.js                          # Bootstrap, lifecycle, single-instance lock, global shortcuts
├── src/main/preload.js              # IPC bridge (26 namespaces, 118+ methods as electron_api)
├── src/main/ipc/                    # IPC handlers (16 files, 118 handlers)
├── src/main/services/               # Business logic (13 services)
├── src/main/windows/                # Window managers (5 windows)
└── src/main/utils/                  # Git operations, paths, AI commit, shell

Electron Renderer Process (Browser)
├── renderer.js                      # Entry point & orchestrator (bundled by esbuild → dist/)
├── src/renderer/index.js            # Module loader & initialization
├── src/renderer/state/              # Observable state management (9 modules)
├── src/renderer/services/           # IPC wrappers & business logic (13 services)
├── src/renderer/ui/components/      # UI components (12 components)
├── src/renderer/ui/panels/          # UI panels (10 panels)
├── src/renderer/features/           # Keyboard shortcuts, quick picker, drag-drop
├── src/renderer/events/             # Claude event bus + hook/scraping providers
├── src/renderer/i18n/               # EN/FR internationalization (~800 keys each)
└── src/renderer/utils/              # DOM, color, format, paths, icons, syntax highlighting

Project Types (Plugin System)
└── src/project-types/               # api, fivem, minecraft, python, webapp, general (61 files)

Styles
└── styles/                          # 14 modular CSS files

Remote UI
└── remote-ui/                       # Web interface for remote control (PWA)
```

**Detailed references:** [Main Process](.planning/knowledge/main-process.md) | [Renderer Process](.planning/knowledge/renderer-process.md) | [CSS Architecture](.planning/knowledge/css-architecture.md) | [Infrastructure](.planning/knowledge/infrastructure.md)

## Key Implementation Details

- **No context isolation in preload:** `contextIsolation: false` + `nodeIntegration: false` with full `electron_api` bridge
- **Single instance:** `app.requestSingleInstanceLock()` prevents multiple instances
- **Tray integration:** Close button minimizes to tray, `app-quit` for real exit
- **Frameless window:** Custom titlebar in HTML/CSS with `-webkit-app-region: drag`
- **Terminal:** xterm.js (WebGL addon) in renderer, node-pty (PowerShell) in main, adaptive batching
- **Chat:** Agent SDK streaming input mode with async iterator for multi-turn conversations
- **Hooks:** 15 hook types installed into `~/.claude/settings.json`, HTTP event server for real-time events
- **Time tracking:** 15min idle timeout, 2min output idle, 30min session merge, midnight rollover, monthly archival
- **Renderer bundling:** esbuild IIFE bundle → `dist/renderer.bundle.js` with sourcemaps
- **Persistence:** Atomic writes (temp file + rename), backup files (`.bak`), corruption recovery
- **Resume dialogs:** Two independent implementations that must stay in sync — see [resume-dialogs.md](.planning/knowledge/resume-dialogs.md)

## Testing

```bash
npm test                    # Run all tests
npm run test:watch          # Watch mode
```

- **Framework:** Jest with jsdom environment
- **Setup:** `tests/setup.js` mocks `window.electron_nodeModules` and `window.electron_api`
- **Pattern:** `**/tests/**/*.test.js`
- **Suites:** `tests/state/`, `tests/services/`, `tests/features/`, `tests/utils/`, `tests/remote-ui/`

## Conventions

- **Commits:** `feat(scope): description` in English, imperative mood
- **IPC pattern:** Service (main) -> IPC handler -> Preload bridge -> Renderer service
- **Dashboard sections:** `buildXxxHtml()` functions in `DashboardService.js`
- **CSS:** `.component-name.state` pattern, CSS variables for theming, 14 modular files in `styles/`
- **i18n:** Add keys to both `en.json` and `fr.json`, use `t('dot.path')` in code. Error messages in main process must be in English (not hardcoded French).
- **State updates:** Use `state.set()` or `state.setProp()`, subscribe with `state.subscribe()`
- **File I/O:** Always use atomic writes for user data (temp + rename)
- **Project types:** Extend `BaseType`, register in `registry.js`, provide service + IPC + dashboard + i18n

## Knowledge Base

Detailed architecture and gotchas in `.planning/knowledge/`:

| File | Content |
|------|---------|
| [main-process.md](.planning/knowledge/main-process.md) | IPC handlers, services, windows, utilities |
| [renderer-process.md](.planning/knowledge/renderer-process.md) | State, services, components, panels, features, events, i18n |
| [css-architecture.md](.planning/knowledge/css-architecture.md) | Variables, file index, naming conventions |
| [infrastructure.md](.planning/knowledge/infrastructure.md) | Preload bridge, data storage, dependencies, HTML pages, project types, remote control, CI/CD, bundled resources |
| [resume-dialogs.md](.planning/knowledge/resume-dialogs.md) | Two resume dialog implementations that must stay in sync |
