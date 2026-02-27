/**
 * WorkflowGraphService
 * LiteGraph.js integration for node-based workflow editor
 */

const { LiteGraph, LGraph, LGraphCanvas, LGraphNode } = require('litegraph.js');
const { getAgents } = require('./AgentService');
const { getSkills } = require('./SkillService');

// ── Node type colors (matching workflow.css tokens) ──────────────────────────
const NODE_COLORS = {
  trigger:   { color: '#1a3a1a', bgColor: '#0f1f0f', titleColor: '#4ade80' },
  claude:    { color: '#3a2a0a', bgColor: '#1f1a0a', titleColor: '#f59e0b' },
  shell:     { color: '#0a2a3a', bgColor: '#0a1a2a', titleColor: '#60a5fa' },
  git:       { color: '#2a1a3a', bgColor: '#1a0f2a', titleColor: '#a78bfa' },
  http:      { color: '#0a2a2a', bgColor: '#0a1a1a', titleColor: '#22d3ee' },
  notify:    { color: '#3a2a0a', bgColor: '#2a1a0a', titleColor: '#fbbf24' },
  wait:      { color: '#1a1a1a', bgColor: '#111111', titleColor: '#888888' },
  condition: { color: '#0a2a1a', bgColor: '#0a1f0f', titleColor: '#4ade80' },
};

// ── LiteGraph global config ──────────────────────────────────────────────────
function configureLiteGraphDefaults() {
  LiteGraph.CANVAS_GRID_SIZE = 20;
  LiteGraph.NODE_TITLE_HEIGHT = 26;
  LiteGraph.NODE_SLOT_HEIGHT = 18;
  LiteGraph.NODE_WIDGET_HEIGHT = 24;
  LiteGraph.NODE_WIDTH = 180;
  LiteGraph.NODE_MIN_WIDTH = 140;
  LiteGraph.NODE_TITLE_COLOR = '#ccc';
  LiteGraph.NODE_SELECTED_TITLE_COLOR = '#fff';
  LiteGraph.NODE_TEXT_SIZE = 12;
  LiteGraph.NODE_TEXT_COLOR = '#bbb';
  LiteGraph.NODE_SUBTEXT_SIZE = 10;
  LiteGraph.NODE_DEFAULT_COLOR = '#1a1a1a';
  LiteGraph.NODE_DEFAULT_BGCOLOR = '#111';
  LiteGraph.NODE_DEFAULT_BOXCOLOR = '#888';
  LiteGraph.NODE_DEFAULT_SHAPE = 'box';
  LiteGraph.DEFAULT_SHADOW_COLOR = 'rgba(0,0,0,0.4)';
  LiteGraph.WIDGET_BGCOLOR = '#0d0d0d';
  LiteGraph.WIDGET_OUTLINE_COLOR = '#333';
  LiteGraph.WIDGET_TEXT_COLOR = '#bbb';
  LiteGraph.WIDGET_SECONDARY_TEXT_COLOR = '#666';
  LiteGraph.LINK_COLOR = '#666';
  LiteGraph.EVENT_LINK_COLOR = '#f59e0b';
  LiteGraph.CONNECTING_LINK_COLOR = '#f59e0b';
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
  this.size = [180, 70];
  this.removable = false;
}
TriggerNode.title = 'Trigger';
TriggerNode.desc = 'Point de départ du workflow';
TriggerNode.prototype = Object.create(LGraphNode.prototype);
TriggerNode.prototype.constructor = TriggerNode;
TriggerNode.prototype.onDrawForeground = function(ctx) {
  const c = NODE_COLORS.trigger;
  ctx.fillStyle = c.titleColor;
  ctx.font = 'bold 9px sans-serif';
  ctx.fillText(this.properties.triggerType.toUpperCase(), 8, -6);
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
  this.size = [200, 100];
}
ClaudeNode.title = 'Claude';
ClaudeNode.desc = 'Prompt, Agent ou Skill';
ClaudeNode.prototype = Object.create(LGraphNode.prototype);
ClaudeNode.prototype.constructor = ClaudeNode;
ClaudeNode.prototype.onDrawForeground = function(ctx) {
  const c = NODE_COLORS.claude;
  ctx.fillStyle = c.titleColor;
  ctx.font = 'bold 9px sans-serif';
  const modeLabel = this.properties.mode === 'agent' ? 'AGENT'
    : this.properties.mode === 'skill' ? 'SKILL' : 'PROMPT';
  ctx.fillText(modeLabel, 8, -6);
};

// ── Shell Node ───────────────────────────────────────────────────────────────
function ShellNode() {
  this.addInput('In', LiteGraph.ACTION);
  this.addOutput('Done', LiteGraph.EVENT);
  this.addOutput('Error', LiteGraph.EVENT);
  this.properties = { command: '' };
  this.addWidget('text', 'Command', '', (v) => { this.properties.command = v; });
  this.size = [200, 80];
}
ShellNode.title = 'Shell';
ShellNode.desc = 'Commande bash';
ShellNode.prototype = Object.create(LGraphNode.prototype);
ShellNode.prototype.constructor = ShellNode;
ShellNode.prototype.onDrawForeground = function(ctx) {
  if (this.properties.command) {
    ctx.fillStyle = '#555';
    ctx.font = '9px monospace';
    const cmd = this.properties.command.length > 25
      ? this.properties.command.slice(0, 25) + '…' : this.properties.command;
    ctx.fillText(cmd, 8, this.size[1] - 8);
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
  this.size = [180, 80];
}
GitNode.title = 'Git';
GitNode.desc = 'Opération git';
GitNode.prototype = Object.create(LGraphNode.prototype);
GitNode.prototype.constructor = GitNode;
GitNode.prototype.onDrawForeground = function(ctx) {
  const c = NODE_COLORS.git;
  ctx.fillStyle = c.titleColor;
  ctx.font = 'bold 9px sans-serif';
  ctx.fillText(this.properties.action.toUpperCase(), 8, -6);
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
  this.size = [200, 100];
}
HttpNode.title = 'HTTP';
HttpNode.desc = 'Requête API';
HttpNode.prototype = Object.create(LGraphNode.prototype);
HttpNode.prototype.constructor = HttpNode;
HttpNode.prototype.onDrawForeground = function(ctx) {
  const c = NODE_COLORS.http;
  ctx.fillStyle = c.titleColor;
  ctx.font = 'bold 9px sans-serif';
  ctx.fillText(this.properties.method, 8, -6);
};

// ── Notify Node ──────────────────────────────────────────────────────────────
function NotifyNode() {
  this.addInput('In', LiteGraph.ACTION);
  this.addOutput('Done', LiteGraph.EVENT);
  this.properties = { title: '', message: '' };
  this.addWidget('text', 'Title', '', (v) => { this.properties.title = v; });
  this.size = [180, 70];
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
  this.size = [160, 70];
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
  this.size = [180, 80];
}
ConditionNode.title = 'Condition';
ConditionNode.desc = 'Branchement conditionnel';
ConditionNode.prototype = Object.create(LGraphNode.prototype);
ConditionNode.prototype.constructor = ConditionNode;
ConditionNode.prototype.onDrawForeground = function(ctx) {
  const c = NODE_COLORS.condition;
  // Draw True/False labels near output slots
  ctx.font = '9px sans-serif';
  ctx.fillStyle = '#4ade80';
  ctx.fillText('✓', this.size[0] - 16, LiteGraph.NODE_TITLE_HEIGHT + 10);
  ctx.fillStyle = '#ef4444';
  ctx.fillText('✗', this.size[0] - 16, LiteGraph.NODE_TITLE_HEIGHT + 28);
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
    NodeClass.prototype.color = colors.color;
    NodeClass.prototype.bgcolor = colors.bgColor;
    NodeClass.title_color = colors.titleColor;
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

    // External callbacks
    this.onNodeSelected = null;
    this.onNodeDeselected = null;
    this.onGraphChanged = null;
  }

  /**
   * Initialize LiteGraph canvas on a <canvas> element
   */
  init(canvasElement) {
    configureLiteGraphDefaults();
    registerAllNodeTypes();

    this.canvasElement = canvasElement;
    this.graph = new LGraph();
    this.canvas = new LGraphCanvas(canvasElement, this.graph);

    // ── Canvas theme ──
    this.canvas.background_color = '#0d0d0d';
    this.canvas.clear_background_color = '#0d0d0d';
    this.canvas.render_shadows = false;
    this.canvas.render_connections_shadows = false;
    this.canvas.show_info = false;
    this.canvas.allow_searchbox = false; // We use our own palette
    this.canvas.allow_dragcanvas = true;
    this.canvas.allow_interaction = true;
    this.canvas.render_curved_connections = true;
    this.canvas.render_connection_arrows = false;
    this.canvas.connections_width = 2;
    this.canvas.default_link_color = '#444';
    this.canvas.highquality_render = true;
    this.canvas.inner_text_font = '11px sans-serif';
    this.canvas.title_text_font = 'bold 12px sans-serif';

    // Zoom limits
    this.canvas.ds.min_scale = 0.3;
    this.canvas.ds.max_scale = 3;

    // ── Events ──
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

    // Don't auto-execute — we execute workflows via our own runner
    this.graph.status = LGraph.STATUS_STOPPED;

    return this;
  }

  /**
   * Resize canvas to fit container
   */
  resize(width, height) {
    if (this.canvas && this.canvasElement) {
      this.canvasElement.width = width;
      this.canvasElement.height = height;
      this.canvas.resize(width, height);
      this.canvas.setDirty(true, true);
    }
  }

  /**
   * Add a node at position
   */
  addNode(typeName, pos) {
    const node = LiteGraph.createNode(typeName);
    if (!node) return null;
    node.pos = pos || [200, 200];
    this.graph.add(node);
    this.canvas.selectNode(node);
    this.canvas.setDirty(true, true);
    return node;
  }

  /**
   * Delete currently selected nodes
   */
  deleteSelected() {
    const selected = this.canvas.selected_nodes;
    if (!selected) return;
    for (const id in selected) {
      const node = selected[id];
      if (node.removable === false) continue; // Can't delete trigger
      this.graph.remove(node);
    }
    this.canvas.deselectAllNodes();
    this.canvas.setDirty(true, true);
  }

  /**
   * Center view to fit all nodes
   */
  zoomToFit() {
    if (this.canvas) {
      this.canvas.ds.reset();
      this.canvas.setDirty(true, true);
    }
  }

  /**
   * Get current zoom level
   */
  getZoom() {
    return this.canvas ? this.canvas.ds.scale : 1;
  }

  /**
   * Set zoom level
   */
  setZoom(scale) {
    if (this.canvas) {
      this.canvas.ds.scale = Math.max(0.3, Math.min(3, scale));
      this.canvas.setDirty(true, true);
    }
  }

  /**
   * Get node count
   */
  getNodeCount() {
    return this.graph ? this.graph._nodes.length : 0;
  }

  /**
   * Serialize graph to our workflow format
   */
  serializeToWorkflow() {
    if (!this.graph) return null;
    const data = this.graph.serialize();

    // Extract trigger node properties
    const triggerNode = this.graph._nodes.find(n => n.type === 'workflow/trigger');
    const trigger = triggerNode ? {
      type: triggerNode.properties.triggerType || 'manual',
      value: triggerNode.properties.triggerValue || ''
    } : { type: 'manual', value: '' };

    const hookType = triggerNode ? triggerNode.properties.hookType : 'PostToolUse';

    // Build steps from non-trigger nodes with our format
    const steps = [];
    for (const node of data.nodes) {
      if (node.type === 'workflow/trigger') continue;
      const stepType = node.type.replace('workflow/', '');
      steps.push({
        id: `node_${node.id}`,
        type: stepType,
        _nodeId: node.id,
        ...node.properties
      });
    }

    return {
      trigger,
      hookType,
      graph: data,   // Full LiteGraph serialization
      steps,         // Flattened for runner compatibility
    };
  }

  /**
   * Load graph from workflow data
   */
  loadFromWorkflow(workflow) {
    if (!this.graph) return;
    this.graph.clear();

    if (workflow.graph) {
      // New format — load LiteGraph serialization directly
      this.graph.configure(workflow.graph);
    } else if (workflow.steps) {
      // Legacy linear format — create nodes in a chain
      this._migrateLegacySteps(workflow);
    }

    this.canvas.setDirty(true, true);
  }

  /**
   * Create a new empty workflow with just a trigger node
   */
  createEmpty() {
    if (!this.graph) return;
    this.graph.clear();
    const trigger = this.addNode('workflow/trigger', [100, 200]);
    if (trigger) {
      trigger.removable = false;
    }
    this.canvas.ds.reset();
    this.canvas.setDirty(true, true);
  }

  /**
   * Migrate legacy steps[] format to graph nodes
   */
  _migrateLegacySteps(workflow) {
    const SPACING_X = 280;
    const START_X = 100;
    const START_Y = 200;

    // Create trigger node
    const trigger = this.addNode('workflow/trigger', [START_X, START_Y]);
    if (trigger) {
      trigger.removable = false;
      trigger.properties.triggerType = workflow.trigger?.type || 'manual';
      trigger.properties.triggerValue = workflow.trigger?.value || '';
      trigger.properties.hookType = workflow.hookType || 'PostToolUse';
    }

    // Create step nodes
    let prevNode = trigger;
    const steps = workflow.steps || [];
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const typeName = `workflow/${step.type === 'agent' ? 'claude' : step.type}`;
      const pos = [START_X + SPACING_X * (i + 1), START_Y];
      const node = this.addNode(typeName, pos);
      if (!node) continue;

      // Copy properties
      Object.assign(node.properties, step);
      delete node.properties.id;
      delete node.properties.type;

      // Update widget values to match properties
      if (node.widgets) {
        for (const w of node.widgets) {
          if (node.properties[w.name] !== undefined) {
            w.value = node.properties[w.name];
          }
        }
      }

      // Connect previous node → this node
      if (prevNode) {
        const outSlot = prevNode.type === 'workflow/trigger' ? 0 : 0; // "Start" or "Done"
        prevNode.connect(outSlot, node, 0); // → "In"
      }
      prevNode = node;
    }
  }

  /**
   * Set node execution status (for visual feedback during runs)
   */
  setNodeStatus(nodeId, status) {
    const node = this.graph.getNodeById(nodeId);
    if (!node) return;
    node._runStatus = status; // 'running' | 'success' | 'failed' | 'skipped'
    this.canvas.setDirty(true, true);
  }

  /**
   * Clear all node statuses
   */
  clearAllStatuses() {
    if (!this.graph) return;
    for (const node of this.graph._nodes) {
      node._runStatus = null;
    }
    this.canvas.setDirty(true, true);
  }

  /**
   * Destroy and cleanup
   */
  destroy() {
    if (this.graph) {
      this.graph.clear();
      this.graph = null;
    }
    if (this.canvas) {
      this.canvas = null;
    }
    this.canvasElement = null;
    this.onNodeSelected = null;
    this.onNodeDeselected = null;
    this.onGraphChanged = null;
  }
}

// Singleton
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
