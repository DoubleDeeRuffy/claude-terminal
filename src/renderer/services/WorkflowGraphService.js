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
  trigger:   { bg: '#111', border: '#222', accent: '#4ade80', accentDim: 'rgba(74,222,128,.08)' },
  claude:    { bg: '#111', border: '#222', accent: '#f59e0b', accentDim: 'rgba(245,158,11,.08)' },
  shell:     { bg: '#111', border: '#222', accent: '#60a5fa', accentDim: 'rgba(96,165,250,.08)' },
  git:       { bg: '#111', border: '#222', accent: '#a78bfa', accentDim: 'rgba(167,139,250,.08)' },
  http:      { bg: '#111', border: '#222', accent: '#22d3ee', accentDim: 'rgba(34,211,238,.08)' },
  notify:    { bg: '#111', border: '#222', accent: '#fbbf24', accentDim: 'rgba(251,191,36,.08)' },
  wait:      { bg: '#111', border: '#222', accent: '#6b7280', accentDim: 'rgba(107,114,128,.08)' },
  condition: { bg: '#111', border: '#222', accent: '#4ade80', accentDim: 'rgba(74,222,128,.08)' },
};

const STATUS_COLORS = {
  running: '#f59e0b',
  success: '#22c55e',
  failed:  '#ef4444',
  skipped: '#6b7280',
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
    const r = 6;

    // Title background
    ctx.fillStyle = '#161616';
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

    // Thin accent stripe at very top (2.5px)
    ctx.fillStyle = c.accent;
    ctx.beginPath();
    ctx.moveTo(r, -titleHeight);
    ctx.lineTo(w - r, -titleHeight);
    ctx.quadraticCurveTo(w, -titleHeight, w, -titleHeight + r);
    ctx.lineTo(w, -titleHeight + 2.5);
    ctx.lineTo(0, -titleHeight + 2.5);
    ctx.lineTo(0, -titleHeight + r);
    ctx.quadraticCurveTo(0, -titleHeight, r, -titleHeight);
    ctx.closePath();
    ctx.fill();

    // Subtle separator
    ctx.fillStyle = 'rgba(255,255,255,.04)';
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
    ctx.fillStyle = this.is_selected ? '#fff' : '#ccc';
    ctx.textAlign = 'left';
    const title = this.getTitle ? this.getTitle() : this.title;
    ctx.fillText(title, 22, -titleHeight * 0.5 + 4);

    // Draw selection outline (we disabled the default via NODE_BOX_OUTLINE_COLOR)
    if (this.is_selected) {
      const r = 6;
      ctx.strokeStyle = hexToRgba(c.accent, 0.45);
      ctx.lineWidth = 1.5;
      roundRect(ctx, 0, -titleHeight, w + 1, h + titleHeight, r);
      ctx.stroke();
    }
  };

  // ── Custom body background ──
  const origOnDrawBackground = NodeClass.prototype.onDrawBackground;
  NodeClass.prototype.onDrawBackground = function(ctx, canvas) {
    const c = getNodeColors(this);
    const w = this.size[0];
    const h = this.size[1];
    const r = 6;

    // Body fill
    ctx.fillStyle = '#111';
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

    // Subtle accent glow at top
    const grad = ctx.createLinearGradient(0, 0, 0, 16);
    grad.addColorStop(0, c.accentDim);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, 16);

    // Run status bar (left edge)
    if (this._runStatus && STATUS_COLORS[this._runStatus]) {
      const sc = STATUS_COLORS[this._runStatus];
      ctx.fillStyle = sc;
      ctx.fillRect(0, 0, 2, h);
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
    const margin = 12;

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
          roundRect(ctx, margin, y, innerW, H, 4);
          ctx.fillStyle = '#0d0d0d';
          ctx.fill();
          ctx.strokeStyle = '#222';
          ctx.lineWidth = 1;
          ctx.stroke();

          if (show_text) {
            ctx.fillStyle = '#555';
            ctx.font = `500 10px ${FONT}`;
            ctx.textAlign = 'left';
            ctx.fillText(w.label || w.name, margin + 8, y + H * 0.65);

            ctx.fillStyle = '#bbb';
            ctx.font = `500 11px ${FONT}`;
            ctx.textAlign = 'right';
            let val = w.type === 'number'
              ? Number(w.value).toFixed(w.options.precision != null ? w.options.precision : 3)
              : w.value;
            if (w.options && w.options.values && typeof w.options.values === 'object' && !Array.isArray(w.options.values)) {
              val = w.options.values[w.value] || val;
            }
            ctx.fillText(String(val), ww - margin - 8, y + H * 0.65);
          }
          break;
        }

        case 'text':
        case 'string': {
          roundRect(ctx, margin, y, innerW, H, 4);
          ctx.fillStyle = '#0d0d0d';
          ctx.fill();
          ctx.strokeStyle = '#222';
          ctx.lineWidth = 1;
          ctx.stroke();

          if (show_text) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(margin, y, innerW, H);
            ctx.clip();

            ctx.fillStyle = '#555';
            ctx.font = `500 10px ${FONT}`;
            ctx.textAlign = 'left';
            ctx.fillText(w.label || w.name, margin + 8, y + H * 0.65);

            if (w.value) {
              ctx.fillStyle = '#999';
              ctx.font = `11px ${FONT}`;
              ctx.textAlign = 'right';
              ctx.fillText(String(w.value), ww - margin - 8, y + H * 0.65);
            }

            ctx.restore();
          }
          break;
        }

        case 'toggle': {
          roundRect(ctx, margin, y, innerW, H, 4);
          ctx.fillStyle = '#0d0d0d';
          ctx.fill();
          ctx.strokeStyle = '#222';
          ctx.lineWidth = 1;
          ctx.stroke();

          if (show_text) {
            ctx.fillStyle = '#555';
            ctx.font = `500 10px ${FONT}`;
            ctx.textAlign = 'left';
            ctx.fillText(w.label || w.name, margin + 8, y + H * 0.65);

            const dotX = ww - margin - 12;
            ctx.beginPath();
            ctx.arc(dotX, y + H * 0.5, 4, 0, Math.PI * 2);
            ctx.fillStyle = w.value ? '#d97706' : '#333';
            ctx.fill();
          }
          break;
        }

        case 'button': {
          roundRect(ctx, margin, y, innerW, H, 4);
          ctx.fillStyle = w.clicked ? '#1a1a1a' : '#0f0f0f';
          ctx.fill();
          ctx.strokeStyle = '#2a2a2a';
          ctx.lineWidth = 1;
          ctx.stroke();
          if (w.clicked) { w.clicked = false; this.dirty_canvas = true; }

          if (show_text) {
            ctx.fillStyle = '#bbb';
            ctx.font = `600 11px ${FONT}`;
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
  LiteGraph.NODE_TEXT_COLOR = '#888';
  LiteGraph.NODE_SUBTEXT_SIZE = 10;
  LiteGraph.NODE_DEFAULT_COLOR = '#222';
  LiteGraph.NODE_DEFAULT_BGCOLOR = '#111';
  LiteGraph.NODE_DEFAULT_BOXCOLOR = '#555';
  LiteGraph.NODE_DEFAULT_SHAPE = 'box';
  LiteGraph.DEFAULT_SHADOW_COLOR = 'rgba(0,0,0,0.3)';
  LiteGraph.WIDGET_BGCOLOR = '#0d0d0d';
  LiteGraph.WIDGET_OUTLINE_COLOR = '#222';
  LiteGraph.WIDGET_TEXT_COLOR = '#bbb';
  LiteGraph.WIDGET_SECONDARY_TEXT_COLOR = '#555';
  LiteGraph.LINK_COLOR = '#333';
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
  this.size = [200, 56];
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
  this.size = [220, 84];
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
  this.size = [220, 64];
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
  this.size = [200, 56];
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
  this.size = [220, 84];
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
  this.size = [200, 56];
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
  this.size = [180, 56];
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
  this.size = [200, 64];
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
  }

  init(canvasElement) {
    configureLiteGraphDefaults();
    registerAllNodeTypes();

    this.canvasElement = canvasElement;
    this.graph = new LGraph();
    this.canvas = new LGraphCanvas(canvasElement, this.graph);

    // Canvas theme
    this.canvas.background_color = '#0a0a0a';
    this.canvas.clear_background_color = '#0a0a0a';
    this.canvas.render_shadows = false;
    this.canvas.render_connections_shadows = false;
    this.canvas.show_info = false;
    this.canvas.allow_searchbox = false;
    this.canvas.allow_dragcanvas = true;
    this.canvas.allow_interaction = true;
    this.canvas.render_curved_connections = true;
    this.canvas.render_connection_arrows = false;
    this.canvas.connections_width = 2;
    this.canvas.default_link_color = '#333';
    this.canvas.highquality_render = true;
    this.canvas.inner_text_font = `11px ${FONT}`;
    this.canvas.title_text_font = `600 12px ${FONT}`;
    this.canvas.node_title_color = 'transparent'; // We draw our own title text
    this.canvas.round_radius = 6;
    this.canvas.render_title_colored = false;
    this.canvas.use_gradients = false;

    this.canvas.default_connection_color = {
      input_off: '#333', input_on: '#d97706',
      output_off: '#333', output_on: '#d97706',
    };

    this.canvas.ds.min_scale = 0.3;
    this.canvas.ds.max_scale = 3;

    // Install custom widget rendering
    installWidgetOverrides(this.canvas);

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
    this.graph.onConnectionChange = () => {
      if (this.onGraphChanged) this.onGraphChanged();
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
