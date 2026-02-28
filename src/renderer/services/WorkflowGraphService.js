/**
 * WorkflowGraphService
 * LiteGraph.js integration for node-based workflow editor
 * Custom rendering for premium dark theme
 */

const { LiteGraph, LGraph, LGraphCanvas, LGraphNode } = require('litegraph.js');
const { getAgents } = require('./AgentService');
const { getSkills } = require('./SkillService');

// ── Node type colors ────────────────────────────────────────────────────────
const NODE_COLORS = {
  trigger:   { bg: '#101012', border: '#1c1c20', accent: '#4ade80', accentDim: 'rgba(74,222,128,.06)' },
  claude:    { bg: '#101012', border: '#1c1c20', accent: '#f59e0b', accentDim: 'rgba(245,158,11,.06)' },
  shell:     { bg: '#101012', border: '#1c1c20', accent: '#60a5fa', accentDim: 'rgba(96,165,250,.06)' },
  git:       { bg: '#101012', border: '#1c1c20', accent: '#a78bfa', accentDim: 'rgba(167,139,250,.06)' },
  http:      { bg: '#101012', border: '#1c1c20', accent: '#22d3ee', accentDim: 'rgba(34,211,238,.06)' },
  notify:    { bg: '#101012', border: '#1c1c20', accent: '#fbbf24', accentDim: 'rgba(251,191,36,.06)' },
  wait:      { bg: '#101012', border: '#1c1c20', accent: '#6b7280', accentDim: 'rgba(107,114,128,.06)' },
  condition: { bg: '#101012', border: '#1c1c20', accent: '#4ade80', accentDim: 'rgba(74,222,128,.06)' },
  project:   { bg: '#101012', border: '#1c1c20', accent: '#f472b6', accentDim: 'rgba(244,114,182,.06)' },
  file:      { bg: '#101012', border: '#1c1c20', accent: '#a3e635', accentDim: 'rgba(163,230,53,.06)' },
  db:        { bg: '#101012', border: '#1c1c20', accent: '#fb923c', accentDim: 'rgba(251,146,60,.06)' },
  loop:      { bg: '#101012', border: '#1c1c20', accent: '#38bdf8', accentDim: 'rgba(56,189,248,.06)' },
  variable:  { bg: '#101012', border: '#1c1c20', accent: '#c084fc', accentDim: 'rgba(192,132,252,.06)' },
  log:       { bg: '#101012', border: '#1c1c20', accent: '#94a3b8', accentDim: 'rgba(148,163,184,.06)' },
};

const STATUS_COLORS = {
  running: '#f59e0b',
  success: '#22c55e',
  failed:  '#ef4444',
  skipped: '#6b7280',
};

// ── Data type system — describes what each node output/input carries ─────────
const NODE_DATA_TYPES = {
  trigger:   { outputs: [] },
  claude:    { outputs: [{ slot: 0, badge: 'string' },  { slot: 1, badge: 'error' }] },
  shell:     { outputs: [{ slot: 0, badge: '{stdout}' },{ slot: 1, badge: 'error' }] },
  git:       { outputs: [{ slot: 0, badge: '{output}' },{ slot: 1, badge: 'error' }] },
  http:      { outputs: [{ slot: 0, badge: '{body}' },  { slot: 1, badge: 'error' }] },
  file:      { outputs: [{ slot: 0, badge: 'string' },  { slot: 1, badge: 'error' }] },
  db:        { outputs: [{ slot: 0, badge: 'rows[]' },  { slot: 1, badge: 'error' }] },
  condition: { outputs: [{ slot: 0, badge: 'true' },    { slot: 1, badge: 'false' }] },
  loop:      { outputs: [{ slot: 0, badge: 'item' },    { slot: 1, badge: 'done' }],
               inputs:  [{ slot: 1, badge: 'array' }] },
  variable:  { outputs: [{ slot: 0, badge: 'event' },   { slot: 1, badge: 'value' }] },
  notify:    { outputs: [{ slot: 0, badge: 'event' }] },
  wait:      { outputs: [{ slot: 0, badge: 'event' }] },
  log:       { outputs: [{ slot: 0, badge: 'event' }] },
  project:   { outputs: [{ slot: 0, badge: 'event' },   { slot: 1, badge: 'error' }] },
};

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

// ── Helpers ─────────────────────────────────────────────────────────────────
function hexToRgba(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function getNodeColors(node) {
  const type = (node.type || '').replace('workflow/', '');
  return NODE_COLORS[type] || NODE_COLORS.wait;
}

// Draw a small badge (used for type labels in title bar)
function drawBadge(ctx, text, x, y, color) {
  ctx.font = `700 8px ${FONT}`;
  const tw = ctx.measureText(text).width;
  const bx = x - tw - 10;
  roundRect(ctx, bx, y, tw + 10, 14, 3);
  ctx.fillStyle = hexToRgba(color, 0.15);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.fillText(text, bx + 5, y + 10.5);
}

/**
 * Format output data for link tooltip preview.
 * @param {*} output - Node execution output
 * @param {number} slotIndex - Output slot (0=Done/success, 1=Error)
 * @returns {string|null} Multi-line preview string
 */
function formatOutputPreview(output, slotIndex) {
  if (output == null) return null;

  // Error slot — show error message
  if (slotIndex === 1 && output.error) {
    return `Error: ${String(output.error).substring(0, 120)}`;
  }

  // DB output
  if (output.rows && Array.isArray(output.rows)) {
    const lines = [`${output.rowCount ?? output.rows.length} rows (${output.duration || '?'}ms)`];
    const preview = output.rows.slice(0, 3);
    for (const row of preview) {
      lines.push(truncateJson(row, 60));
    }
    if (output.rows.length > 3) lines.push(`... +${output.rows.length - 3} more`);
    return lines.join('\n');
  }

  // Shell output
  if (output.stdout !== undefined) {
    const code = output.exitCode !== undefined ? ` (exit ${output.exitCode})` : '';
    const text = String(output.stdout || '').trim();
    return `stdout${code}: ${text.substring(0, 150)}${text.length > 150 ? '...' : ''}`;
  }

  // HTTP output
  if (output.status !== undefined && output.body !== undefined) {
    const ok = output.ok ? 'OK' : 'FAIL';
    const bodyStr = typeof output.body === 'string' ? output.body : JSON.stringify(output.body);
    return `HTTP ${output.status} ${ok}\n${(bodyStr || '').substring(0, 120)}`;
  }

  // String output
  if (typeof output === 'string') {
    return output.substring(0, 180) + (output.length > 180 ? '...' : '');
  }

  // Generic object
  if (typeof output === 'object') {
    return truncateJson(output, 180);
  }

  return String(output).substring(0, 120);
}

function truncateJson(obj, maxLen) {
  try {
    const s = JSON.stringify(obj);
    return s.length > maxLen ? s.substring(0, maxLen) + '...' : s;
  } catch { return '[Object]'; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CUSTOM RENDERING OVERRIDES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Install custom rendering on all node prototypes.
 *
 * KEY INSIGHT: LiteGraph's rendering hooks work like this:
 * - onDrawTitleBar(ctx, titleH, size, scale, fgcolor) → replaces the title background fill
 * - onDrawTitleBox(ctx, titleH, size, scale) → replaces the circle/square indicator
 * - onDrawTitleText() → called but does NOT prevent the default title text from rendering
 * - onDrawTitle(ctx) → called AFTER all default title rendering (good for overlays)
 * - onDrawBackground(ctx) → called after body fill, before widgets
 * - onDrawForeground(ctx) → called after everything (good for overlays on body)
 *
 * To hide default title text: set constructor.title_text_color = 'transparent'
 * To hide default selection: set NODE_BOX_OUTLINE_COLOR = 'transparent'
 */
function installCustomRendering(NodeClass) {
  // Hide LiteGraph's default title text — we draw our own in onDrawTitle
  NodeClass.title_text_color = 'transparent';

  // ── Custom title bar: flat dark + thin accent line at top ──
  NodeClass.prototype.onDrawTitleBar = function(ctx, titleHeight, size, scale) {
    const c = getNodeColors(this);
    const w = size[0] + 1;
    const r = 8;

    // Title background — slightly lighter than body
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

    // Thin accent stripe at very top (2px)
    ctx.fillStyle = c.accent;
    ctx.globalAlpha = 0.8;
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

  // ── Custom title box: small accent dot ──
  NodeClass.prototype.onDrawTitleBox = function(ctx, titleHeight, size, scale) {
    const c = getNodeColors(this);
    ctx.fillStyle = c.accent;
    ctx.beginPath();
    ctx.arc(12, -titleHeight * 0.5, 3, 0, Math.PI * 2);
    ctx.fill();
  };

  // ── Custom title text + selection outline (drawn AFTER all default title rendering) ──
  NodeClass.prototype.onDrawTitle = function(ctx) {
    const c = getNodeColors(this);
    const titleHeight = LiteGraph.NODE_TITLE_HEIGHT;
    const w = this.size[0];
    const h = this.size[1];

    // Draw title text
    ctx.font = `600 11px ${FONT}`;
    ctx.fillStyle = this.is_selected ? '#fff' : '#bbb';
    ctx.textAlign = 'left';
    const title = this.getTitle ? this.getTitle() : this.title;
    ctx.fillText(title, 22, -titleHeight * 0.5 + 4);

    // Draw selection outline (we disabled the default via NODE_BOX_OUTLINE_COLOR)
    if (this.is_selected) {
      const r = 8;
      ctx.strokeStyle = hexToRgba(c.accent, 0.35);
      ctx.lineWidth = 1.5;
      roundRect(ctx, -0.5, -titleHeight - 0.5, w + 2, h + titleHeight + 1, r);
      ctx.stroke();

      // Subtle glow
      ctx.shadowColor = hexToRgba(c.accent, 0.15);
      ctx.shadowBlur = 12;
      ctx.strokeStyle = 'transparent';
      ctx.lineWidth = 0;
      roundRect(ctx, 0, -titleHeight, w + 1, h + titleHeight, r);
      ctx.stroke();
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    }
  };

  // ── Custom body background ──
  const origOnDrawBackground = NodeClass.prototype.onDrawBackground;
  NodeClass.prototype.onDrawBackground = function(ctx, canvas) {
    const c = getNodeColors(this);
    const w = this.size[0];
    const h = this.size[1];
    const r = 8;

    // Body fill
    ctx.fillStyle = '#101012';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w, 0);
    ctx.lineTo(w, h - r);
    ctx.quadraticCurveTo(w, h, w - r, h);
    ctx.lineTo(r, h);
    ctx.quadraticCurveTo(0, h, 0, h - r);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();

    // Subtle accent glow at top (shorter, softer)
    const grad = ctx.createLinearGradient(0, 0, 0, 12);
    grad.addColorStop(0, c.accentDim);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, 12);

    // Outer border — soft, barely visible
    ctx.strokeStyle = 'rgba(255,255,255,.04)';
    ctx.lineWidth = 0.5;
    roundRect(ctx, 0, -LiteGraph.NODE_TITLE_HEIGHT, w + 1, h + LiteGraph.NODE_TITLE_HEIGHT, r);
    ctx.stroke();

    // Run status bar (left edge)
    if (this._runStatus && STATUS_COLORS[this._runStatus]) {
      const sc = STATUS_COLORS[this._runStatus];
      ctx.fillStyle = sc;
      roundRect(ctx, 0, 0, 2.5, h, 1);
      ctx.fill();
    }

    if (origOnDrawBackground) origOnDrawBackground.call(this, ctx, canvas);
  };
}

/**
 * Override LiteGraph's widget drawing for flat dark widgets.
 */
function installWidgetOverrides(canvasInstance) {
  const origDrawNodeWidgets = LGraphCanvas.prototype.drawNodeWidgets;

  canvasInstance.drawNodeWidgets = function(node, posY, ctx, active_widget) {
    if (!node.widgets || !node.widgets.length) return 0;

    const width = node.size[0];
    const H = LiteGraph.NODE_WIDGET_HEIGHT;
    const show_text = this.ds.scale > 0.5;
    const margin = 10;
    const c = getNodeColors(node);
    const accent = c.accent;

    ctx.save();
    ctx.globalAlpha = this.editor_alpha;
    posY += 2;

    for (let i = 0; i < node.widgets.length; i++) {
      const w = node.widgets[i];
      const y = w.y || posY;
      w.last_y = y;

      if (w.disabled) ctx.globalAlpha *= 0.5;

      const ww = w.width || width;
      const innerW = ww - margin * 2;

      switch (w.type) {
        case 'combo':
        case 'number': {
          // Background pill
          roundRect(ctx, margin, y, innerW, H, 6);
          ctx.fillStyle = '#0c0c0e';
          ctx.fill();
          ctx.strokeStyle = '#1a1a1e';
          ctx.lineWidth = 0.5;
          ctx.stroke();

          if (show_text) {
            // Label (left, dim)
            ctx.fillStyle = '#555';
            ctx.font = `500 9.5px ${FONT}`;
            ctx.textAlign = 'left';
            ctx.fillText(w.label || w.name, margin + 8, y + H * 0.65);

            // Value (right, accent tinted)
            let val = w.type === 'number'
              ? Number(w.value).toFixed(w.options.precision != null ? w.options.precision : 3)
              : w.value;
            if (w.options && w.options.values && typeof w.options.values === 'object' && !Array.isArray(w.options.values)) {
              val = w.options.values[w.value] || val;
            }
            const valStr = String(val);

            // Value pill background
            ctx.font = `600 9.5px ${FONT}`;
            const valW = ctx.measureText(valStr).width;
            const pillW = valW + 12;
            const pillX = ww - margin - pillW - 4;
            const pillY = y + 3;
            const pillH = H - 6;
            roundRect(ctx, pillX, pillY, pillW, pillH, 4);
            ctx.fillStyle = hexToRgba(accent, 0.1);
            ctx.fill();

            // Value text
            ctx.fillStyle = accent;
            ctx.textAlign = 'center';
            ctx.fillText(valStr, pillX + pillW / 2, y + H * 0.65);

            // Combo chevron icon (tiny ▾)
            if (w.type === 'combo') {
              ctx.fillStyle = '#444';
              ctx.font = `8px ${FONT}`;
              ctx.textAlign = 'right';
              ctx.fillText('\u25BE', ww - margin - 3, y + H * 0.6);
            }
          }
          break;
        }

        case 'text':
        case 'string': {
          roundRect(ctx, margin, y, innerW, H, 6);
          ctx.fillStyle = '#0c0c0e';
          ctx.fill();
          ctx.strokeStyle = '#1a1a1e';
          ctx.lineWidth = 0.5;
          ctx.stroke();

          if (show_text) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(margin, y, innerW, H);
            ctx.clip();

            // Label (left, dim)
            ctx.fillStyle = '#555';
            ctx.font = `500 9.5px ${FONT}`;
            ctx.textAlign = 'left';
            ctx.fillText(w.label || w.name, margin + 8, y + H * 0.65);

            if (w.value) {
              // Truncate value for display
              let valStr = String(w.value);
              const maxChars = Math.floor((innerW - 80) / 5.5);
              if (valStr.length > maxChars && maxChars > 3) {
                valStr = valStr.substring(0, maxChars) + '\u2026';
              }
              ctx.fillStyle = '#9a9a9a';
              ctx.font = `10px 'Cascadia Code', 'Fira Code', monospace`;
              ctx.textAlign = 'right';
              ctx.fillText(valStr, ww - margin - 6, y + H * 0.65);
            } else {
              // Empty placeholder
              ctx.fillStyle = '#333';
              ctx.font = `italic 9px ${FONT}`;
              ctx.textAlign = 'right';
              ctx.fillText('\u2014', ww - margin - 6, y + H * 0.65);
            }

            ctx.restore();
          }
          break;
        }

        case 'toggle': {
          roundRect(ctx, margin, y, innerW, H, 6);
          ctx.fillStyle = '#0c0c0e';
          ctx.fill();
          ctx.strokeStyle = '#1a1a1e';
          ctx.lineWidth = 0.5;
          ctx.stroke();

          if (show_text) {
            ctx.fillStyle = '#555';
            ctx.font = `500 9.5px ${FONT}`;
            ctx.textAlign = 'left';
            ctx.fillText(w.label || w.name, margin + 8, y + H * 0.65);

            // Toggle pill indicator
            const pillW = 20;
            const pillH = 10;
            const pillX = ww - margin - pillW - 6;
            const pillY = y + (H - pillH) / 2;
            roundRect(ctx, pillX, pillY, pillW, pillH, 5);
            ctx.fillStyle = w.value ? hexToRgba(accent, 0.25) : '#1a1a1e';
            ctx.fill();

            // Toggle dot
            const dotX = w.value ? pillX + pillW - 5 : pillX + 5;
            ctx.beginPath();
            ctx.arc(dotX, pillY + pillH / 2, 3.5, 0, Math.PI * 2);
            ctx.fillStyle = w.value ? accent : '#3a3a40';
            ctx.fill();
          }
          break;
        }

        case 'button': {
          roundRect(ctx, margin, y, innerW, H, 6);
          ctx.fillStyle = '#0d0d0f';
          ctx.fill();
          ctx.strokeStyle = '#1e1e22';
          ctx.lineWidth = 0.5;
          ctx.stroke();

          if (show_text) {
            ctx.fillStyle = '#777';
            ctx.font = `600 9.5px ${FONT}`;
            ctx.textAlign = 'center';
            ctx.fillText(w.label || w.name, ww * 0.5, y + H * 0.65);
          }
          break;
        }

        default:
          origDrawNodeWidgets.call(this, node, posY, ctx, active_widget);
          ctx.restore();
          return;
      }

      if (w.disabled) ctx.globalAlpha = this.editor_alpha;
      posY += H + 4;
    }

    ctx.restore();
    return posY;
  };
}

// ── LiteGraph global config ──────────────────────────────────────────────────
function configureLiteGraphDefaults() {
  LiteGraph.CANVAS_GRID_SIZE = 20;
  LiteGraph.NODE_TITLE_HEIGHT = 28;
  LiteGraph.NODE_SLOT_HEIGHT = 18;
  LiteGraph.NODE_WIDGET_HEIGHT = 24;
  LiteGraph.NODE_WIDTH = 200;
  LiteGraph.NODE_MIN_WIDTH = 160;
  LiteGraph.NODE_TITLE_TEXT_Y = -8;
  LiteGraph.NODE_TITLE_COLOR = '#ddd';
  LiteGraph.NODE_SELECTED_TITLE_COLOR = '#fff';
  LiteGraph.NODE_TEXT_SIZE = 11;
  LiteGraph.NODE_TEXT_COLOR = '#777';
  LiteGraph.NODE_SUBTEXT_SIZE = 10;
  LiteGraph.NODE_DEFAULT_COLOR = '#1c1c20';
  LiteGraph.NODE_DEFAULT_BGCOLOR = '#101012';
  LiteGraph.NODE_DEFAULT_BOXCOLOR = '#555';
  LiteGraph.NODE_DEFAULT_SHAPE = 'box';
  LiteGraph.DEFAULT_SHADOW_COLOR = 'rgba(0,0,0,0.4)';
  LiteGraph.WIDGET_BGCOLOR = '#0b0b0d';
  LiteGraph.WIDGET_OUTLINE_COLOR = '#1e1e22';
  LiteGraph.WIDGET_TEXT_COLOR = '#aaa';
  LiteGraph.WIDGET_SECONDARY_TEXT_COLOR = '#555';
  LiteGraph.LINK_COLOR = '#2a2a30';
  LiteGraph.EVENT_LINK_COLOR = '#d97706';
  LiteGraph.CONNECTING_LINK_COLOR = '#f59e0b';

  // Make default selection outline invisible — we draw our own in onDrawTitle
  LiteGraph.NODE_BOX_OUTLINE_COLOR = 'transparent';
}

// ═══════════════════════════════════════════════════════════════════════════════
// CUSTOM NODE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

// ── Trigger Node ─────────────────────────────────────────────────────────────
function TriggerNode() {
  this.addOutput('Start', LiteGraph.EVENT);
  this.properties = { triggerType: 'manual', triggerValue: '', hookType: 'PostToolUse' };
  this.addWidget('combo', 'Type', 'manual', (v) => { this.properties.triggerType = v; }, {
    values: ['manual', 'cron', 'hook', 'on_workflow']
  });
  this.size = this.computeSize();
  this.size[0] = Math.max(this.size[0], 200);
  this.removable = false;
}
TriggerNode.title = 'Trigger';
TriggerNode.desc = 'Point de départ du workflow';
TriggerNode.prototype = Object.create(LGraphNode.prototype);
TriggerNode.prototype.constructor = TriggerNode;
TriggerNode.prototype.onDrawForeground = function(ctx) {
  const c = getNodeColors(this);
  const label = this.properties.triggerType.toUpperCase();
  drawBadge(ctx, label, this.size[0] - 6, -LiteGraph.NODE_TITLE_HEIGHT + 7, c.accent);
};
TriggerNode.prototype.getExtraMenuOptions = function() { return []; };

// ── Claude Node ──────────────────────────────────────────────────────────────
function ClaudeNode() {
  this.addInput('In', LiteGraph.ACTION);
  this.addOutput('Done', LiteGraph.EVENT);
  this.addOutput('Error', LiteGraph.EVENT);
  this.properties = {
    mode: 'prompt', prompt: '', agentId: '', skillId: '',
    model: '', effort: '', outputSchema: null
  };
  this.addWidget('combo', 'Mode', 'prompt', (v) => { this.properties.mode = v; }, {
    values: ['prompt', 'agent', 'skill']
  });
  this.addWidget('text', 'Prompt', '', (v) => { this.properties.prompt = v; });
  this.size = this.computeSize();
  this.size[0] = Math.max(this.size[0], 220);
}
ClaudeNode.title = 'Claude';
ClaudeNode.desc = 'Prompt, Agent ou Skill';
ClaudeNode.prototype = Object.create(LGraphNode.prototype);
ClaudeNode.prototype.constructor = ClaudeNode;
ClaudeNode.prototype.onDrawForeground = function(ctx) {
  const c = getNodeColors(this);
  const modeLabel = this.properties.mode === 'agent' ? 'AGENT'
    : this.properties.mode === 'skill' ? 'SKILL' : 'PROMPT';
  drawBadge(ctx, modeLabel, this.size[0] - 6, -LiteGraph.NODE_TITLE_HEIGHT + 7, c.accent);
};

// ── Shell Node ───────────────────────────────────────────────────────────────
function ShellNode() {
  this.addInput('In', LiteGraph.ACTION);
  this.addOutput('Done', LiteGraph.EVENT);
  this.addOutput('Error', LiteGraph.EVENT);
  this.properties = { command: '' };
  this.addWidget('text', 'Command', '', (v) => { this.properties.command = v; });
  this.size = this.computeSize();
  this.size[0] = Math.max(this.size[0], 220);
}
ShellNode.title = 'Shell';
ShellNode.desc = 'Commande bash';
ShellNode.prototype = Object.create(LGraphNode.prototype);
ShellNode.prototype.constructor = ShellNode;
ShellNode.prototype.onDrawForeground = function(ctx) {
  if (this.properties.command) {
    ctx.fillStyle = '#444';
    ctx.font = `10px "Cascadia Code", "Fira Code", monospace`;
    const cmd = this.properties.command.length > 28
      ? this.properties.command.slice(0, 28) + '...' : this.properties.command;
    ctx.textAlign = 'left';
    ctx.fillText('$ ' + cmd, 10, this.size[1] - 6);
  }
};

// ── Git Node ─────────────────────────────────────────────────────────────────
function GitNode() {
  this.addInput('In', LiteGraph.ACTION);
  this.addOutput('Done', LiteGraph.EVENT);
  this.addOutput('Error', LiteGraph.EVENT);
  this.properties = { action: 'pull', branch: '', message: '' };
  this.addWidget('combo', 'Action', 'pull', (v) => { this.properties.action = v; }, {
    values: ['pull', 'push', 'commit', 'checkout', 'merge', 'stash', 'stash-pop', 'reset']
  });
  this.size = this.computeSize();
  this.size[0] = Math.max(this.size[0], 200);
}
GitNode.title = 'Git';
GitNode.desc = 'Opération git';
GitNode.prototype = Object.create(LGraphNode.prototype);
GitNode.prototype.constructor = GitNode;
GitNode.prototype.onDrawForeground = function(ctx) {
  const c = getNodeColors(this);
  drawBadge(ctx, this.properties.action.toUpperCase(), this.size[0] - 6, -LiteGraph.NODE_TITLE_HEIGHT + 7, c.accent);
};

// ── HTTP Node ────────────────────────────────────────────────────────────────
function HttpNode() {
  this.addInput('In', LiteGraph.ACTION);
  this.addOutput('Done', LiteGraph.EVENT);
  this.addOutput('Error', LiteGraph.EVENT);
  this.properties = { method: 'GET', url: '', headers: '', body: '' };
  this.addWidget('combo', 'Method', 'GET', (v) => { this.properties.method = v; }, {
    values: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
  });
  this.addWidget('text', 'URL', '', (v) => { this.properties.url = v; });
  this.size = this.computeSize();
  this.size[0] = Math.max(this.size[0], 220);
}
HttpNode.title = 'HTTP';
HttpNode.desc = 'Requête API';
HttpNode.prototype = Object.create(LGraphNode.prototype);
HttpNode.prototype.constructor = HttpNode;
HttpNode.prototype.onDrawForeground = function(ctx) {
  const label = this.properties.method;
  const methodColors = { GET: '#22c55e', POST: '#3b82f6', PUT: '#f59e0b', PATCH: '#a78bfa', DELETE: '#ef4444' };
  drawBadge(ctx, label, this.size[0] - 6, -LiteGraph.NODE_TITLE_HEIGHT + 7, methodColors[label] || '#22d3ee');
};

// ── Notify Node ──────────────────────────────────────────────────────────────
function NotifyNode() {
  this.addInput('In', LiteGraph.ACTION);
  this.addOutput('Done', LiteGraph.EVENT);
  this.properties = { title: '', message: '' };
  this.addWidget('text', 'Title', '', (v) => { this.properties.title = v; });
  this.size = this.computeSize();
  this.size[0] = Math.max(this.size[0], 200);
}
NotifyNode.title = 'Notify';
NotifyNode.desc = 'Notification';
NotifyNode.prototype = Object.create(LGraphNode.prototype);
NotifyNode.prototype.constructor = NotifyNode;

// ── Wait Node ────────────────────────────────────────────────────────────────
function WaitNode() {
  this.addInput('In', LiteGraph.ACTION);
  this.addOutput('Done', LiteGraph.EVENT);
  this.properties = { duration: '5s' };
  this.addWidget('text', 'Duration', '5s', (v) => { this.properties.duration = v; });
  this.size = this.computeSize();
  this.size[0] = Math.max(this.size[0], 180);
}
WaitNode.title = 'Wait';
WaitNode.desc = 'Temporisation';
WaitNode.prototype = Object.create(LGraphNode.prototype);
WaitNode.prototype.constructor = WaitNode;

// ── Condition Node ───────────────────────────────────────────────────────────
function ConditionNode() {
  this.addInput('In', LiteGraph.ACTION);
  this.addOutput('True', LiteGraph.EVENT);
  this.addOutput('False', LiteGraph.EVENT);
  this.properties = { variable: '$ctx.branch', operator: '==', value: '' };
  this.addWidget('text', 'Expression', '', (v) => { this.properties.expression = v; });
  this.size = this.computeSize();
  this.size[0] = Math.max(this.size[0], 200);
}
ConditionNode.title = 'Condition';
ConditionNode.desc = 'Branchement conditionnel';
ConditionNode.prototype = Object.create(LGraphNode.prototype);
ConditionNode.prototype.constructor = ConditionNode;
ConditionNode.prototype.onDrawForeground = function(ctx) {
  const slotH = LiteGraph.NODE_SLOT_HEIGHT;
  ctx.font = `700 8px ${FONT}`;

  // True badge near first output slot
  ctx.fillStyle = 'rgba(74,222,128,.12)';
  roundRect(ctx, this.size[0] - 36, slotH * 0 + 2, 24, 13, 3);
  ctx.fill();
  ctx.fillStyle = '#4ade80';
  ctx.textAlign = 'center';
  ctx.fillText('TRUE', this.size[0] - 24, slotH * 0 + 12);

  // False badge near second output slot
  ctx.fillStyle = 'rgba(239,68,68,.12)';
  roundRect(ctx, this.size[0] - 40, slotH * 1 + 2, 28, 13, 3);
  ctx.fill();
  ctx.fillStyle = '#ef4444';
  ctx.textAlign = 'center';
  ctx.fillText('FALSE', this.size[0] - 26, slotH * 1 + 12);
};

// ── Project Node ──────────────────────────────────────────────────────────────
function ProjectNode() {
  this.addInput('In', LiteGraph.ACTION);
  this.addOutput('Done', LiteGraph.EVENT);
  this.addOutput('Error', LiteGraph.EVENT);
  this.properties = { projectId: '', projectName: '', action: 'set_context' };
  this.addWidget('combo', 'Action', 'set_context', (v) => { this.properties.action = v; }, {
    values: ['set_context', 'open', 'build', 'install', 'test']
  });
  this.addWidget('text', 'Project', '', (v) => { this.properties.projectName = v; });
  this.size = this.computeSize();
  this.size[0] = Math.max(this.size[0], 220);
}
ProjectNode.title = 'Project';
ProjectNode.desc = 'Cibler un projet';
ProjectNode.prototype = Object.create(LGraphNode.prototype);
ProjectNode.prototype.constructor = ProjectNode;
ProjectNode.prototype.onDrawForeground = function(ctx) {
  const c = getNodeColors(this);
  drawBadge(ctx, this.properties.action.toUpperCase().replace('_', ' '), this.size[0] - 6, -LiteGraph.NODE_TITLE_HEIGHT + 7, c.accent);
  if (this.properties.projectName) {
    ctx.fillStyle = '#555';
    ctx.font = `10px ${FONT}`;
    ctx.textAlign = 'left';
    const name = this.properties.projectName.length > 28
      ? this.properties.projectName.slice(0, 28) + '...' : this.properties.projectName;
    ctx.fillText(name, 10, this.size[1] - 6);
  }
};

// ── File Node ─────────────────────────────────────────────────────────────────
function FileNode() {
  this.addInput('In', LiteGraph.ACTION);
  this.addOutput('Done', LiteGraph.EVENT);
  this.addOutput('Error', LiteGraph.EVENT);
  this.properties = { action: 'read', path: '', destination: '', content: '' };
  this.addWidget('combo', 'Action', 'read', (v) => { this.properties.action = v; }, {
    values: ['read', 'write', 'append', 'copy', 'delete', 'exists']
  });
  this.addWidget('text', 'Path', '', (v) => { this.properties.path = v; });
  this.size = this.computeSize();
  this.size[0] = Math.max(this.size[0], 220);
}
FileNode.title = 'File';
FileNode.desc = 'Opération fichier';
FileNode.prototype = Object.create(LGraphNode.prototype);
FileNode.prototype.constructor = FileNode;
FileNode.prototype.onDrawForeground = function(ctx) {
  const c = getNodeColors(this);
  drawBadge(ctx, this.properties.action.toUpperCase(), this.size[0] - 6, -LiteGraph.NODE_TITLE_HEIGHT + 7, c.accent);
};

// ── DB Node ───────────────────────────────────────────────────────────────────
function DbNode() {
  this.addInput('In', LiteGraph.ACTION);
  this.addOutput('Done', LiteGraph.EVENT);
  this.addOutput('Error', LiteGraph.EVENT);
  this.properties = { connection: '', query: '', action: 'query' };
  this.addWidget('combo', 'Action', 'query', (v) => { this.properties.action = v; }, {
    values: ['query', 'schema', 'tables']
  });
  this.addWidget('text', 'Query', '', (v) => { this.properties.query = v; });
  this.size = this.computeSize();
  this.size[0] = Math.max(this.size[0], 220);
}
DbNode.title = 'Database';
DbNode.desc = 'Requête base de données';
DbNode.prototype = Object.create(LGraphNode.prototype);
DbNode.prototype.constructor = DbNode;
DbNode.prototype.onDrawForeground = function(ctx) {
  const c = getNodeColors(this);
  drawBadge(ctx, this.properties.action.toUpperCase(), this.size[0] - 6, -LiteGraph.NODE_TITLE_HEIGHT + 7, c.accent);
};

// ── Loop Node ─────────────────────────────────────────────────────────────────
function LoopNode() {
  this.addInput('In', LiteGraph.ACTION);
  this.addInput('Items', 'array');
  this.addOutput('Each', LiteGraph.EVENT);
  this.addOutput('Done', LiteGraph.EVENT);
  this.properties = { source: 'auto', filter: '' };
  this.addWidget('combo', 'Source', 'auto', (v) => { this.properties.source = v; }, {
    values: ['auto', 'projects', 'files', 'custom']
  });
  this.size = this.computeSize();
  this.size[0] = Math.max(this.size[0], 200);
}
LoopNode.title = 'Loop';
LoopNode.desc = 'Itérer sur une liste';
LoopNode.prototype = Object.create(LGraphNode.prototype);
LoopNode.prototype.constructor = LoopNode;
LoopNode.prototype.onDrawForeground = function(ctx) {
  const c = getNodeColors(this);
  drawBadge(ctx, this.properties.source.toUpperCase(), this.size[0] - 6, -LiteGraph.NODE_TITLE_HEIGHT + 7, c.accent);
};

// ── Variable Node ─────────────────────────────────────────────────────────────
function VariableNode() {
  this.addInput('In', LiteGraph.ACTION);
  this.addOutput('Done', LiteGraph.EVENT);
  this.addOutput('Value', 'string');
  this.properties = { action: 'set', name: '', value: '' };
  this.addWidget('combo', 'Action', 'set', (v) => { this.properties.action = v; }, {
    values: ['set', 'get', 'increment', 'append']
  });
  this.addWidget('text', 'Name', '', (v) => { this.properties.name = v; });
  this.size = this.computeSize();
  this.size[0] = Math.max(this.size[0], 200);
}
VariableNode.title = 'Variable';
VariableNode.desc = 'Lire/écrire une variable';
VariableNode.prototype = Object.create(LGraphNode.prototype);
VariableNode.prototype.constructor = VariableNode;
VariableNode.prototype.onDrawForeground = function(ctx) {
  const c = getNodeColors(this);
  drawBadge(ctx, this.properties.action.toUpperCase(), this.size[0] - 6, -LiteGraph.NODE_TITLE_HEIGHT + 7, c.accent);
  if (this.properties.name) {
    ctx.fillStyle = '#555';
    ctx.font = `10px "Cascadia Code", "Fira Code", monospace`;
    ctx.textAlign = 'left';
    ctx.fillText('$' + this.properties.name, 10, this.size[1] - 6);
  }
};

// ── Log Node ──────────────────────────────────────────────────────────────────
function LogNode() {
  this.addInput('In', LiteGraph.ACTION);
  this.addOutput('Done', LiteGraph.EVENT);
  this.properties = { level: 'info', message: '' };
  this.addWidget('combo', 'Level', 'info', (v) => { this.properties.level = v; }, {
    values: ['debug', 'info', 'warn', 'error']
  });
  this.addWidget('text', 'Message', '', (v) => { this.properties.message = v; });
  this.size = this.computeSize();
  this.size[0] = Math.max(this.size[0], 200);
}
LogNode.title = 'Log';
LogNode.desc = 'Écrire dans le log';
LogNode.prototype = Object.create(LGraphNode.prototype);
LogNode.prototype.constructor = LogNode;
LogNode.prototype.onDrawForeground = function(ctx) {
  const c = getNodeColors(this);
  const levelColors = { debug: '#94a3b8', info: '#60a5fa', warn: '#fbbf24', error: '#ef4444' };
  drawBadge(ctx, this.properties.level.toUpperCase(), this.size[0] - 6, -LiteGraph.NODE_TITLE_HEIGHT + 7, levelColors[this.properties.level] || c.accent);
};

// ═══════════════════════════════════════════════════════════════════════════════
// NODE REGISTRATION
// ═══════════════════════════════════════════════════════════════════════════════

function registerAllNodeTypes() {
  LiteGraph.clearRegisteredTypes();

  const types = [
    ['workflow/trigger',   TriggerNode,   NODE_COLORS.trigger],
    ['workflow/claude',    ClaudeNode,    NODE_COLORS.claude],
    ['workflow/shell',     ShellNode,     NODE_COLORS.shell],
    ['workflow/git',       GitNode,       NODE_COLORS.git],
    ['workflow/http',      HttpNode,      NODE_COLORS.http],
    ['workflow/notify',    NotifyNode,    NODE_COLORS.notify],
    ['workflow/wait',      WaitNode,      NODE_COLORS.wait],
    ['workflow/condition', ConditionNode, NODE_COLORS.condition],
    ['workflow/project',   ProjectNode,   NODE_COLORS.project],
    ['workflow/file',      FileNode,      NODE_COLORS.file],
    ['workflow/db',        DbNode,        NODE_COLORS.db],
    ['workflow/loop',      LoopNode,      NODE_COLORS.loop],
    ['workflow/variable',  VariableNode,  NODE_COLORS.variable],
    ['workflow/log',       LogNode,       NODE_COLORS.log],
  ];

  for (const [typeName, NodeClass, colors] of types) {
    NodeClass.prototype.color = colors.border;
    NodeClass.prototype.bgcolor = colors.bg;
    // title_color must be set to something dark so LG's default title fill is invisible
    // (our onDrawTitleBar overwrites it anyway, but this prevents a flash)
    NodeClass.title_color = '#161616';

    installCustomRendering(NodeClass);
    LiteGraph.registerNodeType(typeName, NodeClass);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GRAPH SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

class WorkflowGraphService {
  constructor() {
    this.graph = null;
    this.canvas = null;
    this.canvasElement = null;
    this.onNodeSelected = null;
    this.onNodeDeselected = null;
    this.onGraphChanged = null;
    this._lastRunOutputs = new Map(); // litegraphNodeId → output data
  }

  init(canvasElement) {
    configureLiteGraphDefaults();
    registerAllNodeTypes();

    this.canvasElement = canvasElement;
    this.graph = new LGraph();
    this.canvas = new LGraphCanvas(canvasElement, this.graph);

    // Canvas theme
    this.canvas.background_color = '#08080a';
    this.canvas.clear_background_color = '#08080a';
    this.canvas.render_shadows = false;
    this.canvas.render_connections_shadows = false;
    this.canvas.show_info = false;
    this.canvas.allow_searchbox = false;
    this.canvas.allow_dragcanvas = true;
    this.canvas.allow_interaction = true;
    this.canvas.render_curved_connections = true;
    this.canvas.render_connection_arrows = false;
    this.canvas.connections_width = 1.5;
    this.canvas.default_link_color = '#2a2a30';
    this.canvas.highquality_render = true;
    this.canvas.inner_text_font = `11px ${FONT}`;
    this.canvas.title_text_font = `600 11px ${FONT}`;
    this.canvas.node_title_color = 'transparent';
    this.canvas.round_radius = 8;
    this.canvas.render_title_colored = false;
    this.canvas.use_gradients = false;

    this.canvas.default_connection_color = {
      input_off: '#2a2a30', input_on: '#d97706',
      output_off: '#2a2a30', output_on: '#d97706',
    };

    this.canvas.ds.min_scale = 0.3;
    this.canvas.ds.max_scale = 3;

    // Install custom widget rendering
    installWidgetOverrides(this.canvas);

    // Disable widget interactivity — nodes are visual-only, editing happens in the right panel
    this.canvas.processNodeWidgets = function(_node, _pos, _event, _active_widget) {
      return null; // Block all widget clicks/drags on canvas
    };

    // Block LiteGraph's default node panel on double-click (we use the right panel instead)
    this.canvas.onShowNodePanel = function(_node) { /* noop */ };

    // Link tooltip on hover — show last run output preview
    const self = this;
    this.canvas.onDrawLinkTooltip = function(ctx, link, _canvas) {
      if (!link) return;
      const output = self._lastRunOutputs.get(link.origin_id);
      if (!output) return;

      const preview = formatOutputPreview(output, link.origin_slot);
      if (!preview) return;

      // Find the midpoint of the link on canvas
      const originNode = self.graph.getNodeById(link.origin_id);
      const targetNode = self.graph.getNodeById(link.target_id);
      if (!originNode || !targetNode) return;

      const originPos = originNode.getConnectionPos(false, link.origin_slot);
      const targetPos = targetNode.getConnectionPos(true, link.target_slot);
      const mx = (originPos[0] + targetPos[0]) / 2;
      const my = (originPos[1] + targetPos[1]) / 2;

      // Draw tooltip background
      ctx.save();
      ctx.font = `11px 'Cascadia Code', 'Fira Code', monospace`;
      const lines = preview.split('\n');
      const lineHeight = 15;
      const padding = 8;
      let maxW = 0;
      for (const line of lines) {
        const w = ctx.measureText(line).width;
        if (w > maxW) maxW = w;
      }
      maxW = Math.min(maxW, 280);
      const tooltipW = maxW + padding * 2;
      const tooltipH = lines.length * lineHeight + padding * 2;
      const tx = mx - tooltipW / 2;
      const ty = my - tooltipH - 12;

      // Background
      roundRect(ctx, tx, ty, tooltipW, tooltipH, 6);
      ctx.fillStyle = 'rgba(12,12,14,.92)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.08)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Text
      ctx.fillStyle = 'rgba(255,255,255,.7)';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        // Truncate long lines
        while (ctx.measureText(line).width > maxW && line.length > 10) {
          line = line.substring(0, line.length - 4) + '...';
        }
        ctx.fillStyle = i === 0 ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.55)';
        ctx.fillText(line, tx + padding, ty + padding + i * lineHeight);
      }
      ctx.restore();
    };

    // Events
    this.canvas.onNodeSelected = (node) => {
      if (this.onNodeSelected) this.onNodeSelected(node);
    };
    this.canvas.onNodeDeselected = (node) => {
      if (this.onNodeDeselected) this.onNodeDeselected(node);
    };
    this.graph.onNodeAdded = () => {
      if (this.onGraphChanged) this.onGraphChanged();
    };
    this.graph.onNodeRemoved = () => {
      if (this.onGraphChanged) this.onGraphChanged();
    };
    this._prevLinkIds = new Set();
    this.graph.onConnectionChange = () => {
      if (this.onGraphChanged) this.onGraphChanged();
      // Detect new array→single connections for auto-loop suggestion
      this._checkNewConnections();
    };

    this.graph.status = LGraph.STATUS_STOPPED;
    return this;
  }

  resize(width, height) {
    if (this.canvas && this.canvasElement) {
      this.canvasElement.width = width;
      this.canvasElement.height = height;
      this.canvas.resize(width, height);
      this.canvas.setDirty(true, true);
    }
  }

  addNode(typeName, pos) {
    const node = LiteGraph.createNode(typeName);
    if (!node) return null;
    node.pos = pos || [200, 200];
    this.graph.add(node);
    this.canvas.selectNode(node);
    this.canvas.setDirty(true, true);
    return node;
  }

  deleteSelected() {
    const selected = this.canvas.selected_nodes;
    if (!selected) return;
    for (const id in selected) {
      const node = selected[id];
      if (node.removable === false) continue;
      this.graph.remove(node);
    }
    this.canvas.deselectAllNodes();
    this.canvas.setDirty(true, true);
  }

  zoomToFit() {
    if (this.canvas) {
      this.canvas.ds.reset();
      this.canvas.setDirty(true, true);
    }
  }

  getZoom() {
    return this.canvas ? this.canvas.ds.scale : 1;
  }

  setZoom(scale) {
    if (this.canvas) {
      this.canvas.ds.scale = Math.max(0.3, Math.min(3, scale));
      this.canvas.setDirty(true, true);
    }
  }

  getNodeCount() {
    return this.graph ? this.graph._nodes.length : 0;
  }

  serializeToWorkflow() {
    if (!this.graph) return null;
    const data = this.graph.serialize();

    const triggerNode = this.graph._nodes.find(n => n.type === 'workflow/trigger');
    const trigger = triggerNode ? {
      type: triggerNode.properties.triggerType || 'manual',
      value: triggerNode.properties.triggerValue || ''
    } : { type: 'manual', value: '' };
    const hookType = triggerNode ? triggerNode.properties.hookType : 'PostToolUse';

    const steps = [];
    for (const node of data.nodes) {
      if (node.type === 'workflow/trigger') continue;
      steps.push({
        id: `node_${node.id}`,
        type: node.type.replace('workflow/', ''),
        _nodeId: node.id,
        ...node.properties
      });
    }

    return { trigger, hookType, graph: data, steps };
  }

  loadFromWorkflow(workflow) {
    if (!this.graph) return;
    this.graph.clear();
    if (workflow.graph) {
      this.graph.configure(workflow.graph);
    } else if (workflow.steps) {
      this._migrateLegacySteps(workflow);
    }
    // Recalculate node sizes to fit slots + widgets (fixes legacy hardcoded sizes)
    const nodes = this.graph.getNodes ? this.graph.getNodes() : this.graph._nodes || [];
    for (const node of nodes) {
      const computed = node.computeSize();
      node.size[0] = Math.max(node.size[0], computed[0]);
      node.size[1] = Math.max(node.size[1], computed[1]);
    }
    this.canvas.setDirty(true, true);
  }

  createEmpty() {
    if (!this.graph) return;
    this.graph.clear();
    const trigger = this.addNode('workflow/trigger', [100, 200]);
    if (trigger) trigger.removable = false;
    this.canvas.ds.reset();
    this.canvas.setDirty(true, true);
  }

  _migrateLegacySteps(workflow) {
    const SPACING_X = 280;
    const START_X = 100;
    const START_Y = 200;

    const trigger = this.addNode('workflow/trigger', [START_X, START_Y]);
    if (trigger) {
      trigger.removable = false;
      trigger.properties.triggerType = workflow.trigger?.type || 'manual';
      trigger.properties.triggerValue = workflow.trigger?.value || '';
      trigger.properties.hookType = workflow.hookType || 'PostToolUse';
    }

    let prevNode = trigger;
    for (let i = 0; i < (workflow.steps || []).length; i++) {
      const step = workflow.steps[i];
      const typeName = `workflow/${step.type === 'agent' ? 'claude' : step.type}`;
      const node = this.addNode(typeName, [START_X + SPACING_X * (i + 1), START_Y]);
      if (!node) continue;

      Object.assign(node.properties, step);
      delete node.properties.id;
      delete node.properties.type;

      if (node.widgets) {
        for (const w of node.widgets) {
          if (node.properties[w.name] !== undefined) w.value = node.properties[w.name];
        }
      }

      if (prevNode) prevNode.connect(0, node, 0);
      prevNode = node;
    }
  }

  setNodeStatus(nodeId, status) {
    const node = this.graph.getNodeById(nodeId);
    if (!node) return;
    node._runStatus = status;
    this.canvas.setDirty(true, true);
  }

  clearAllStatuses() {
    if (!this.graph) return;
    for (const node of this.graph._nodes) node._runStatus = null;
    this.canvas.setDirty(true, true);
  }

  // ── Auto-loop detection ───────────────────────────────────────────────────

  _checkNewConnections() {
    if (!this.graph) return;
    const currentLinks = new Set();
    const newLinks = [];

    // Collect all current link IDs
    if (this.graph.links) {
      const linksObj = this.graph.links;
      // LiteGraph stores links as object or array
      const entries = linksObj instanceof Map ? [...linksObj.entries()] :
                      Array.isArray(linksObj) ? linksObj.map((l, i) => [i, l]).filter(([, l]) => l) :
                      Object.entries(linksObj).filter(([, l]) => l);

      for (const [id, link] of entries) {
        if (!link) continue;
        currentLinks.add(Number(id));
        if (!this._prevLinkIds.has(Number(id))) {
          newLinks.push(link);
        }
      }
    }

    this._prevLinkIds = currentLinks;

    // Check each new link for array→single mismatch
    for (const link of newLinks) {
      const originNode = this.graph.getNodeById(link.origin_id);
      const targetNode = this.graph.getNodeById(link.target_id);
      if (!originNode || !targetNode) continue;

      const originType = (originNode.type || '').replace('workflow/', '');
      const targetType = (targetNode.type || '').replace('workflow/', '');

      // Skip if target is already a loop
      if (targetType === 'loop') continue;

      // Check if source produces an array on this slot
      const producesArray = this._slotProducesArray(originNode, originType, link.origin_slot);
      if (producesArray && this.onArrayToSingleConnection) {
        this.onArrayToSingleConnection(link, originNode, targetNode);
      }
    }
  }

  _slotProducesArray(node, nodeType, slot) {
    // DB slot 0 with action=query → rows[]
    if (nodeType === 'db' && slot === 0) {
      const action = node.properties?.action || 'query';
      return action === 'query';
    }
    // Loop slot 1 (Done) returns collected items
    if (nodeType === 'loop' && slot === 1) return false; // Done = event, not array
    return false;
  }

  // ── Run output tracking (for link tooltips) ──────────────────────────────

  setNodeOutput(nodeId, output) {
    this._lastRunOutputs.set(nodeId, output);
  }

  getNodeOutput(nodeId) {
    return this._lastRunOutputs.get(nodeId) || null;
  }

  clearRunOutputs() {
    this._lastRunOutputs.clear();
  }

  destroy() {
    if (this.graph) { this.graph.clear(); this.graph = null; }
    if (this.canvas) this.canvas = null;
    this.canvasElement = null;
    this.onNodeSelected = null;
    this.onNodeDeselected = null;
    this.onGraphChanged = null;
  }
}

let instance = null;

function getGraphService() {
  if (!instance) instance = new WorkflowGraphService();
  return instance;
}

function resetGraphService() {
  if (instance) instance.destroy();
  instance = null;
}

module.exports = {
  getGraphService,
  resetGraphService,
  WorkflowGraphService,
  NODE_COLORS,
};
