# CSS Architecture (`styles/` - 14 files)

## CSS Variables (`:root` in `base.css`)

```css
/* Colors */
--bg-primary: #0d0d0d;  --bg-secondary: #151515;  --bg-tertiary: #1a1a1a;
--bg-hover: #252525;     --bg-active: #2a2a2a;     --border-color: #2d2d2d;
--text-primary: #e0e0e0; --text-secondary: #888;    --text-muted: #555;
--accent: #d97706;       --accent-hover: #f59e0b;   --accent-dim: rgba(217,119,6,0.15);
--success: #22c55e;      --warning: #f59e0b;        --danger: #ef4444;  --info: #3b82f6;

/* Layout */
--radius: 8px;  --radius-sm: 4px;  --sidebar-width: 200px;  --projects-panel-width: 350px;

/* Typography (rem-based) */
--font-2xs: 0.625rem;  --font-xs: 0.6875rem;  --font-sm: 0.8125rem;
--font-base: 0.875rem;  --font-md: 1rem;  --font-lg: 1.125rem;
```

## CSS Files

| File | Lines | Section |
|------|-------|---------|
| `base.css` | 244 | Variables, fonts, reset |
| `layout.css` | 885 | Sidebar, content grid |
| `terminal.css` | 1528 | xterm, tabs, loading |
| `projects.css` | 3468 | Project list, tree, drag-drop |
| `chat.css` | 2990 | Chat UI, messages, markdown |
| `git.css` | 2871 | Git panel, diff view, worktrees |
| `dashboard.css` | 2065 | Stats cards, sections |
| `settings.css` | 1896 | Settings forms |
| `modals.css` | 1752 | Modal dialogs |
| `time-tracking.css` | 1118 | Charts, stats |
| `skills.css` | 1254 | Skills/agents panel |
| `mcp.css` | 562 | MCP management |
| `memory.css` | 668 | Memory editor |
| `fivem.css` | 2056 | FiveM-specific |

## Naming Convention

```css
.component-name { }           /* Base styles */
.component-name.state { }     /* State modifier (e.g., .project-item.active) */
.component-name[data-x] { }   /* Data attribute conditional */
.component-name:has(.child) {} /* Parent selector */
```
