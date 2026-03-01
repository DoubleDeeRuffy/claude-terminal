# Workflow System Refactor — Design Document

## Problem

The workflow system totals **14,135 lines** across 9 components with 3 critical issues:

1. **LiteGraph dependency** — 600 lines of workarounds (26% of GraphService), constant rendering bugs (pin duplication), fighting the lib instead of using it
2. **Schema duplication** — `NODE_DATA_OUTPUTS`, `NODE_DATA_OUT_OFFSET`, slot repair logic copied in 3 files (GraphService, Runner, MCP tools)
3. **WorkflowPanel monolith** — 3,876 lines mixing UI rendering, editor integration, AI chat, forms, events, autocomplete

## Solution — 3 Phases

### Phase 1: Custom Graph Engine (replace LiteGraph)

**New file:** `src/renderer/services/WorkflowGraphEngine.js` (~1200 lines)

Replaces `WorkflowGraphService.js` (2271 lines) with a zero-dependency canvas engine.

**3 internal layers:**

```
GraphModel       — nodes Map, links Map, typed pins, serialize/configure
GraphInteraction — pan, zoom, drag nodes, drag links, selection, hit testing
GraphRenderer    — Blueprint-style: tinted headers, diamond exec pins, glow data pins, widgets
```

**GraphModel:**
- `nodes: Map<id, NodeDef>` with `{ id, type, pos, size, properties, inputs[], outputs[], widgets[] }`
- `links: Map<id, LinkDef>` with `{ id, originId, originSlot, targetId, targetSlot, type }`
- `addNode(type, pos)` / `removeNode(id)` / `addLink()` / `removeLink()`
- Type validation built-in: `isValidConnection(outType, inType)` using TYPE_COMPAT
- `serialize()` → JSON **compatible with current LiteGraph format** (no migration needed)
- `configure(data)` → load from JSON, rebuild internal maps

**GraphInteraction:**
- Pan: middle-click drag or Space+drag
- Zoom: wheel, clamped 0.3–3.0
- Node drag: mousedown on body → mousemove → mouseup
- Link drag: mousedown on pin → rubber-band line → mouseup on target pin
- Selection: click = select one, Shift+click = toggle, rect drag = multi-select
- Hit testing: `nodeAt(x,y)`, `pinAt(x,y)`, `linkAt(x,y)`
- Keyboard: Delete, Ctrl+Z/Y, Ctrl+D, Ctrl+A (handled via events, not internalized)

**GraphRenderer:**
- Tinted header (accent at 18% opacity)
- Diamond exec pins (outline disconnected, filled connected)
- Circle data pins with glow (shadowBlur 6) when connected
- Widget rendering: flat dark pills (combo, text, toggle)
- Curved bezier links colored by type
- Selection outline with accent glow
- Test button + test result overlay
- Link tooltip on hover
- Grid background

**API surface (identical to current):**
```js
engine.init(canvasElement)
engine.addNode(type, pos) → node
engine.removeNode(id)
engine.serialize() → JSON
engine.configure(data)
engine.resize(w, h)
engine.zoomToFit()
engine.getSelectedNodes() → Node[]
engine.selectAll() / deselectAll()
engine.deleteSelected()
engine.duplicateSelected()
engine.pushSnapshot() / undo() / redo()
engine.setNodeOutput(id, data)    // for run status + test results
engine.setNodeRunStatus(id, status)

// Events
engine.onNodeSelected = (node) => {}
engine.onNodeDeselected = (node) => {}
engine.onGraphChanged = () => {}
engine.onHistoryChanged = () => {}
```

**Compatibility:** The JSON format stays the same as LiteGraph's `serialize()` output. Existing workflows load without migration. The `graph.links` array format is preserved. Node properties, widgets, and slot definitions remain unchanged.

### Phase 2: Shared Schema Module

**New file:** `src/shared/workflow-schema.js` (~100 lines)

Single source of truth for:
- `NODE_TYPES` — all 18 node type definitions
- `NODE_DATA_OUTPUTS` — typed output pins per node type
- `NODE_DATA_OUT_OFFSET` — slot index mapping
- `PIN_TYPES` — type colors and shapes
- `TYPE_COMPAT` — connection compatibility matrix
- `NODE_COLORS` — accent colors per type
- `getOutputKeyForSlot(nodeType, slotIndex)` — shared helper

**Consumers:**
- `WorkflowGraphEngine.js` (renderer) — rendering + validation
- `WorkflowRunner.js` (main) — runtime slot→key mapping
- `workflow.js` (MCP) — slot info for AI tools
- `WorkflowPanel.js` (renderer) — node palette, step types

**Import path:** `require('../shared/workflow-schema')` from renderer, `require('../../shared/workflow-schema')` from main.

### Phase 3: Split WorkflowPanel

**Current:** `WorkflowPanel.js` (3,876 lines) — monolith

**Split into 5 modules:**

| New File | Lines (est.) | Responsibility |
|----------|-------------|----------------|
| `WorkflowListPanel.js` | ~400 | Workflow list, cards, create/delete/rename |
| `WorkflowEditorPanel.js` | ~800 | Graph editor canvas, node property panel, toolbar, variables panel |
| `WorkflowRunsPanel.js` | ~500 | Run history list, run details, step logs |
| `WorkflowAIPanel.js` | ~400 | AI chat integration, system prompt, diagram rendering |
| `WorkflowPanel.js` | ~300 | Tab router (workflows/runs/hub), orchestrates sub-panels |

Each sub-panel:
- Receives the container DOM element
- Has `render()`, `show()`, `hide()`, `destroy()` methods
- Communicates via events (not direct coupling)
- Can access shared state via `workflows.state.js`

**WorkflowEditorPanel** integrates with the new `WorkflowGraphEngine` instead of LiteGraph.

## Files Modified/Created

| Action | File | Notes |
|--------|------|-------|
| **Create** | `src/shared/workflow-schema.js` | Shared type definitions |
| **Create** | `src/renderer/services/WorkflowGraphEngine.js` | Custom canvas engine |
| **Create** | `src/renderer/ui/panels/WorkflowListPanel.js` | Extracted from WorkflowPanel |
| **Create** | `src/renderer/ui/panels/WorkflowEditorPanel.js` | Extracted from WorkflowPanel |
| **Create** | `src/renderer/ui/panels/WorkflowRunsPanel.js` | Extracted from WorkflowPanel |
| **Create** | `src/renderer/ui/panels/WorkflowAIPanel.js` | Extracted from WorkflowPanel |
| **Modify** | `src/renderer/ui/panels/WorkflowPanel.js` | Slim tab router |
| **Modify** | `src/main/services/WorkflowRunner.js` | Import from shared schema |
| **Modify** | `resources/mcp-servers/tools/workflow.js` | Import from shared schema |
| **Delete** | `src/renderer/services/WorkflowGraphService.js` | Replaced by Engine |

## Implementation Order

1. **Phase 2 first** — Extract `workflow-schema.js` (low risk, immediate dedup benefit)
2. **Phase 1** — Build `WorkflowGraphEngine.js` (highest complexity, most value)
3. **Phase 3** — Split `WorkflowPanel.js` (depends on Phase 1 for editor integration)

## Risk Mitigation

- **JSON compatibility**: Engine's `serialize()` outputs the exact same format — verified by diffing output against LiteGraph's
- **Incremental delivery**: Each phase is independently deployable
- **Rollback**: Keep `WorkflowGraphService.js` until Engine is validated
- **Testing**: Verify all 18 node types create/connect/serialize/deserialize correctly
