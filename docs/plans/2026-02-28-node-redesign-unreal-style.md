# Node Redesign — Unreal Blueprint Style — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make workflow nodes visually distinct and readable like Unreal Engine Blueprints with tinted headers, diamond exec pins, glowing data pins, and larger labels.

**Architecture:** All changes are in `src/renderer/services/WorkflowGraphService.js`. We modify the `installCustomRendering()` function (title bar, pin drawing) and the `configureLiteGraphDefaults()` constants. No new files needed.

**Tech Stack:** LiteGraph.js canvas rendering, HTML5 Canvas API (shadowBlur, rotate, arc)

---

## Task 1: Update LiteGraph constants for larger pins and labels

**Files:**
- Modify: `src/renderer/services/WorkflowGraphService.js:717-727` (inside `configureLiteGraphDefaults()`)

**Step 1: Update constants**

In `configureLiteGraphDefaults()`, change these values:

```js
// BEFORE
LiteGraph.NODE_TITLE_HEIGHT = 28;
LiteGraph.NODE_SLOT_HEIGHT = 18;

// AFTER
LiteGraph.NODE_TITLE_HEIGHT = 30;
LiteGraph.NODE_SLOT_HEIGHT = 22;
```

**Step 2: Build and verify**

Run: `npm run build:renderer`
Expected: Build succeeds, no errors.

**Step 3: Commit**

```bash
git add src/renderer/services/WorkflowGraphService.js
git commit -m "feat(workflow): increase node slot height and title height for blueprint style"
```

---

## Task 2: Tinted header background

**Files:**
- Modify: `src/renderer/services/WorkflowGraphService.js:211-247` (inside `installCustomRendering()` → `onDrawTitleBar`)

**Step 1: Replace solid header with tinted accent background**

Replace the current `onDrawTitleBar` implementation. The current code fills the title bar with solid `#141416`. Change it to use the node's accent color at 20% opacity over a dark base `#141416`.

Replace lines 211-247 with:

```js
NodeClass.prototype.onDrawTitleBar = function(ctx, titleHeight, size, scale) {
  const c = getNodeColors(this);
  const w = size[0] + 1;
  const r = 8;

  // Title background — accent-tinted (20% opacity over dark base)
  ctx.fillStyle = '#141416';
  ctx.beginPath();
  ctx.moveTo(r, -titleHeight);
  ctx.lineTo(w - r, -titleHeight);
  ctx.quadraticCurveTo(w, -titleHeight, w, -titleHeight + r);
  ctx.lineTo(w, 0);
  ctx.lineTo(0, 0);
  ctx.lineTo(0, -titleHeight + r);
  ctx.quadraticCurveTo(0, -titleHeight, r, -titleHeight);
  ctx.closePath();
  ctx.fill();

  // Accent tint overlay (20% opacity)
  ctx.fillStyle = hexToRgba(c.accent, 0.18);
  ctx.fill();  // re-use same path

  // Accent stripe at very top (2px)
  ctx.fillStyle = c.accent;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.moveTo(r, -titleHeight);
  ctx.lineTo(w - r, -titleHeight);
  ctx.quadraticCurveTo(w, -titleHeight, w, -titleHeight + r);
  ctx.lineTo(w, -titleHeight + 2);
  ctx.lineTo(0, -titleHeight + 2);
  ctx.lineTo(0, -titleHeight + r);
  ctx.quadraticCurveTo(0, -titleHeight, r, -titleHeight);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  // Subtle separator line
  ctx.fillStyle = 'rgba(255,255,255,.03)';
  ctx.fillRect(0, -1, w, 1);
};
```

Key change: After drawing the dark base `#141416`, we re-use the same clipping path and fill with `hexToRgba(c.accent, 0.18)` — this gives a visually distinct tinted header per node type (green for trigger, orange for claude, blue for shell, etc.).

**Step 2: Build and verify visually**

Run: `npm run build:renderer`
Expected: Build succeeds. Open the app → Workflow editor → Headers should now have a subtle color tint matching the node type.

**Step 3: Commit**

```bash
git add src/renderer/services/WorkflowGraphService.js
git commit -m "feat(workflow): tinted header background for blueprint-style nodes"
```

---

## Task 3: Diamond exec pins

**Files:**
- Modify: `src/renderer/services/WorkflowGraphService.js` — the wrapped `onDrawForeground` in `registerAllNodeTypes()` (lines 1447-1502)

**Step 1: Add diamond drawing helper at top of file (after `roundRect`)**

Add this helper function after the `roundRect` function (~line 109):

```js
function drawDiamond(ctx, cx, cy, size) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - size);       // top
  ctx.lineTo(cx + size, cy);       // right
  ctx.lineTo(cx, cy + size);       // bottom
  ctx.lineTo(cx - size, cy);       // left
  ctx.closePath();
}
```

**Step 2: Override LiteGraph's default pin rendering**

In `configureLiteGraphDefaults()`, add these lines to hide the default pin circles (LiteGraph draws them in its internal `drawNodeShape` method). We'll draw our own pins in `onDrawForeground`:

```js
// Hide default slot indicators — we draw custom pins in onDrawForeground
LiteGraph.NODE_SLOT_HEIGHT = 22;
```

LiteGraph doesn't provide a clean way to disable its built-in pin circles. The approach: in the wrapped `onDrawForeground` (inside `registerAllNodeTypes`, ~line 1449), draw our custom pins ON TOP of the default ones. The default pins are small (3-4px circles), our custom pins (5px diamonds / 4.5px circles with glow) will visually replace them.

**Step 3: Draw custom pins in the wrapped onDrawForeground**

In the `registerAllNodeTypes()` function, inside the wrapped `onDrawForeground` (the one that already draws data pin labels), add custom pin rendering AFTER the label drawing code. Replace the existing pin label section (lines 1453-1499) with an enhanced version that also draws custom pin shapes:

```js
// 2. Custom pin rendering — skip if collapsed
if (this.flags && this.flags.collapsed) return;
const slotH = LiteGraph.NODE_SLOT_HEIGHT;
const w = this.size[0];

ctx.save();
ctx.font = `500 11px ${FONT}`;
ctx.textBaseline = 'middle';

// ── OUTPUT PINS (right side) ──
if (this.outputs) {
  for (let i = 0; i < this.outputs.length; i++) {
    const slot = this.outputs[i];
    if (!slot) continue;
    const isExec = !slot.type || slot.type === 'exec' || slot.type === -1 || slot.type === LiteGraph.EVENT;
    const sy = (i + 0.7) * slotH;
    const px = w + 1;   // pin X position (right edge)
    const py = sy;       // pin Y position
    const hasLinks = slot.links && slot.links.length > 0;

    if (isExec) {
      // Diamond shape for exec pins
      ctx.save();
      const dSize = 5;
      drawDiamond(ctx, px, py, dSize);
      if (hasLinks) {
        ctx.fillStyle = '#ccc';
        ctx.fill();
      } else {
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.restore();
    } else {
      // Circle with glow for data pins
      const pinColor = (PIN_TYPES[slot.type] || PIN_TYPES.any).color;
      ctx.save();
      if (hasLinks) {
        ctx.shadowColor = pinColor;
        ctx.shadowBlur = 6;
      }
      ctx.beginPath();
      ctx.arc(px, py, 4.5, 0, Math.PI * 2);
      if (hasLinks) {
        ctx.fillStyle = pinColor;
        ctx.fill();
      } else {
        ctx.strokeStyle = hexToRgba(pinColor, 0.6);
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.restore();

      // Label
      const label = slot.label || slot.name || '';
      if (label) {
        ctx.fillStyle = pinColor;
        ctx.globalAlpha = 0.7;
        ctx.textAlign = 'right';
        ctx.fillText(label, w - 20, sy);
      }
    }
  }
}

// ── INPUT PINS (left side) ──
if (this.inputs) {
  for (let i = 0; i < this.inputs.length; i++) {
    const slot = this.inputs[i];
    if (!slot) continue;
    const isExec = !slot.type || slot.type === 'exec' || slot.type === -1 || slot.type === LiteGraph.EVENT;
    const sy = (i + 0.7) * slotH;
    const px = -1;       // pin X position (left edge)
    const py = sy;
    const hasLink = slot.link != null;

    if (isExec) {
      // Diamond shape for exec pins
      ctx.save();
      const dSize = 5;
      drawDiamond(ctx, px, py, dSize);
      if (hasLink) {
        ctx.fillStyle = '#ccc';
        ctx.fill();
      } else {
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.restore();
    } else {
      // Circle with glow for data pins
      const pinColor = (PIN_TYPES[slot.type] || PIN_TYPES.any).color;
      ctx.save();
      if (hasLink) {
        ctx.shadowColor = pinColor;
        ctx.shadowBlur = 6;
      }
      ctx.beginPath();
      ctx.arc(px, py, 4.5, 0, Math.PI * 2);
      if (hasLink) {
        ctx.fillStyle = pinColor;
        ctx.fill();
      } else {
        ctx.strokeStyle = hexToRgba(pinColor, 0.6);
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.restore();

      // Label
      const label = slot.label || slot.name || '';
      if (label) {
        ctx.fillStyle = pinColor;
        ctx.globalAlpha = 0.7;
        ctx.textAlign = 'left';
        ctx.fillText(label, 20, sy);
      }
    }
  }
}

ctx.globalAlpha = 1;
ctx.textBaseline = 'alphabetic';
ctx.restore();
```

**Step 4: Build and verify**

Run: `npm run build:renderer`
Expected: Build succeeds. Exec pins appear as diamonds (outline when disconnected, filled when connected). Data pins appear as circles with glow when connected.

**Step 5: Commit**

```bash
git add src/renderer/services/WorkflowGraphService.js
git commit -m "feat(workflow): diamond exec pins and glowing data pins (blueprint style)"
```

---

## Task 4: Fine-tune visual polish

**Files:**
- Modify: `src/renderer/services/WorkflowGraphService.js`

**Step 1: Increase title dot size in onDrawTitleBox**

In the `onDrawTitleBox` override (~line 250-256), change the dot radius from 3 to 4 and add a subtle glow:

```js
NodeClass.prototype.onDrawTitleBox = function(ctx, titleHeight, size, scale) {
  const c = getNodeColors(this);
  ctx.save();
  ctx.shadowColor = c.accent;
  ctx.shadowBlur = 4;
  ctx.fillStyle = c.accent;
  ctx.beginPath();
  ctx.arc(12, -titleHeight * 0.5, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};
```

**Step 2: Increase title text font weight**

In the `onDrawTitle` override (~line 266), change from `600 11px` to `600 12px`:

```js
ctx.font = `600 12px ${FONT}`;
```

**Step 3: Adjust body accent glow gradient height**

In `onDrawBackground` (~line 416), increase the gradient from 12px to 18px for more visible accent presence:

```js
const grad = ctx.createLinearGradient(0, 0, 0, 18);
```

**Step 4: Build and verify**

Run: `npm run build:renderer`
Expected: Build succeeds. Title dots glow, text is slightly larger, body gradient is more visible.

**Step 5: Commit**

```bash
git add src/renderer/services/WorkflowGraphService.js
git commit -m "feat(workflow): visual polish — title dot glow, larger text, deeper accent gradient"
```

---

## Verification

1. `npm run build:renderer` → no errors
2. Open app → Workflow editor → create a new workflow
3. Add nodes: Trigger → Shell → Condition → Loop → DB → Log
4. **Header tint**: Each node type should have a visually distinct tinted header (green trigger, blue shell, green condition, blue loop, orange DB, gray log)
5. **Diamond exec pins**: Exec pins (In, Done, Error, TRUE, FALSE, Each) should appear as diamond shapes — outline when disconnected, filled when connected
6. **Data pin glow**: Data pins (stdout, stderr, rows, item, etc.) should have colored circles — outline when disconnected, filled with subtle glow when connected
7. **Labels**: Pin labels should be larger (11px) and more readable
8. **Connection validation**: Drag exec → data pin should be rejected. Drag matching data types should connect.
