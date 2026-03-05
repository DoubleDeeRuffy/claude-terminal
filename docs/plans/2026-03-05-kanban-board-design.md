# Kanban Board — Design Document

**Date:** 2026-03-05
**Status:** Approved
**Replaces:** Simple task list (buildTasksHtml in DashboardService)

## Overview

Replace the flat task list in the project dashboard with a full Kanban board in a dedicated tab. Supports customizable columns per project, labels/tags with colors, card descriptions, drag & drop between columns, and Claude session linking.

## Data Model

### New fields on `project`

```js
project.kanbanColumns = [
  { id: "col-todo",       title: "To Do",       color: "#3b82f6", order: 0 },
  { id: "col-inprogress", title: "In Progress",  color: "#f59e0b", order: 1 },
  { id: "col-done",       title: "Done",         color: "#22c55e", order: 2 }
]

project.kanbanLabels = [
  { id: string, name: string, color: string }
]
```

### Updated `task` shape

```js
task = {
  id: string,           // unchanged
  title: string,        // unchanged
  description: string,  // NEW — free text
  labels: string[],     // NEW — array of kanbanLabel IDs
  columnId: string,     // NEW — replaces status field
  sessionId: string | null,  // unchanged
  order: number,        // NEW — position within column (0-based)
  createdAt: number,    // unchanged
  updatedAt: number     // unchanged
}
```

### Migration

Existing tasks are migrated on first load:
- `status: "in_progress"` → `columnId: "col-inprogress"`
- `status: "done"` → `columnId: "col-done"`
- `status: "todo"` or missing → `columnId: "col-todo"`
- `order` assigned by array index

Projects without `kanbanColumns` get the 3 default columns on first access.

## Architecture

### New files

| File | Purpose |
|------|---------|
| `src/renderer/ui/panels/KanbanPanel.js` | Full panel: columns, cards, drag & drop, modals |
| `styles/kanban.css` | Dedicated CSS (~400 lines) |

### Modified files

| File | Change |
|------|--------|
| `src/renderer/state/projects.state.js` | Add column CRUD, label CRUD, update task schema (columnId, order, description, labels), migration logic |
| `src/renderer/services/DashboardService.js` | Remove `buildTasksHtml()`, wire `KanbanPanel` in project dashboard |
| `index.html` | Add "Kanban" tab in project dashboard tab bar |
| `src/renderer/i18n/locales/fr.json` | New i18n keys under `kanban.*` |
| `src/renderer/i18n/locales/en.json` | Same |
| `styles/dashboard.css` | Remove obsolete `.task-*` styles |

### No new IPC handlers

Tasks persist through existing `projectsState` → `projects.json` atomic writes.

## UI Layout

### Kanban tab

```
┌─────────────────────────────────────────────────────────────┐
│ [Dashboard] [Git] [Terminal] [Kanban]                        │
├─────────────────────────────────────────────────────────────┤
│ Kanban  ──────────────────────────  [+ Colonne] [⚙ Labels]  │
│                                                              │
│  ┌─── To Do ──────┐  ┌─── In Progress ─┐  ┌─── Done ──────┐│
│  │  [+ Ajouter]   │  │  [+ Ajouter]    │  │               ││
│  │                │  │                 │  │               ││
│  │ ┌────────────┐ │  │ ┌────────────┐  │  │ ┌──────────┐  ││
│  │ │ Fix login  │ │  │ │ API auth   │  │  │ │ Setup CI │  ││
│  │ │ 🔴 bug     │ │  │ │ 🔵 feature │  │  │ │          │  ││
│  │ │ abc123…    │ │  │ │            │  │  │ └──────────┘  ││
│  │ └────────────┘ │  │ └────────────┘  │  │               ││
│  └────────────────┘  └─────────────────┘  └───────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### Card (hover state)

- Drag handle `⠿` visible on hover (left side)
- Title
- Label chips (colored pill badges)
- Session badge if linked (truncated session ID)
- Delete button `✕` on hover (top right)

### Edit modal (click on card)

```
┌─────────────────────────────────────┐
│ Titre  [__________________________] │
│                                     │
│ Description                         │
│ [textarea 3 rows__________________ ]│
│                                     │
│ Labels  [🔴 bug ✕] [+ Ajouter]     │
│                                     │
│ Session  [🔗 Lier session] abc123…  │
│                                     │
│              [Annuler] [Enregistrer]│
└─────────────────────────────────────┘
```

### Column header (click to rename, right-click for options)

- Title (inline-editable on double-click)
- Card count badge
- Color dot (clickable → color picker with 8 presets)
- Delete column button (only if empty)

### Labels manager (⚙ Labels button)

Modal listing project labels with name + color. Add, rename, recolor, delete.

## Drag & Drop (mouse events custom)

1. `mousedown` on drag handle → start drag, create floating clone that follows cursor
2. Placeholder element inserted at hover position within target column
3. `mousemove` on document → update clone position, detect target column/position
4. `mouseup` → drop: update `task.columnId` + recalculate `order` for affected columns, remove clone/placeholder
5. `Escape` → cancel drag, restore original position

No auto-scroll (Electron fixed window, columns scroll independently if overflow).

## i18n Keys (new, under `kanban.*`)

```
kanban.tab, kanban.addColumn, kanban.manageLabels,
kanban.addCard, kanban.noCards, kanban.editCard,
kanban.cardTitle, kanban.cardDescription, kanban.cardLabels, kanban.cardSession,
kanban.columnTitle, kanban.deleteColumn, kanban.deleteColumnDisabled,
kanban.labelName, kanban.labelColor, kanban.addLabel, kanban.deleteLabel,
kanban.save, kanban.cancel, kanban.delete, kanban.confirmDelete
```

## State Functions (new/updated)

```js
// Columns
getKanbanColumns(projectId)          // returns columns sorted by order
addKanbanColumn(projectId, { title, color })
updateKanbanColumn(projectId, columnId, updates)
deleteKanbanColumn(projectId, columnId)  // only if no tasks in column
reorderKanbanColumns(projectId, newOrder)

// Labels
getKanbanLabels(projectId)
addKanbanLabel(projectId, { name, color })
updateKanbanLabel(projectId, labelId, updates)
deleteKanbanLabel(projectId, labelId)   // also removes from task.labels

// Tasks (updated)
addTask(projectId, { title, description, labels, columnId })
updateTask(projectId, taskId, updates)  // now includes description, labels, columnId, order
moveTask(projectId, taskId, targetColumnId, targetOrder)
```

## Migration Strategy

`migrateTasksToKanban(project)` runs once when `KanbanPanel` first renders a project:
- Skip if `project.kanbanColumns` already exists
- Create default 3 columns
- Map each task's `status` → `columnId`
- Assign `order` by array index
- Save via `updateProject()`
