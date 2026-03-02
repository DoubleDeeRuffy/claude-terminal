/**
 * claude-config field renderer
 * Renders the full Claude node configuration:
 * - CWD picker (project select + optional custom path)
 * - Mode tabs (prompt / agent / skill)
 * - Prompt textarea (prompt mode)
 * - Agent picker grid (agent mode)
 * - Skill picker grid (skill mode)
 * - Additional instructions textarea (agent / skill mode)
 * - Model select
 * - Effort select
 */
const { escapeHtml, escapeAttr } = require('./_registry');

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderCwdSection(props) {
  const projects =
    (typeof window !== 'undefined' && window._projectsState?.get?.()?.projects) || [];
  const isCustom = props.projectId === '__custom__' || (!!props.cwd && !props.projectId);
  const selectedId = isCustom ? '__custom__' : (props.projectId || '');
  const optionsList = projects
    .map(p => `<option value="${esc(p.id)}"${selectedId === p.id ? ' selected' : ''}>${esc(p.name)}</option>`)
    .join('');
  const customInput = selectedId === '__custom__' ? `
<div class="wf-step-edit-field">
  <label class="wf-step-edit-label">Chemin de travail</label>
  <span class="wf-field-hint">Chemin absolu ou variable — ex: $item.path</span>
  <input class="wf-step-edit-input wf-node-prop wf-field-mono wf-claude-cwd-input" data-key="cwd"
    value="${esc(props.cwd || '')}" placeholder="$item.path ou E:\\MonProjet" />
</div>` : '';
  return `<div class="wf-step-edit-field">
  <label class="wf-step-edit-label">Exécuter dans</label>
  <span class="wf-field-hint">Répertoire de travail de la session Claude</span>
  <select class="wf-step-edit-input wf-claude-project-select" data-key="projectId">
    <option value=""${!selectedId ? ' selected' : ''}>Projet courant (contexte workflow)</option>
    ${optionsList}
    <option value="__custom__"${selectedId === '__custom__' ? ' selected' : ''}>Chemin personnalisé…</option>
  </select>
</div>${customInput}`;
}

function renderModeSection(props) {
  const mode = props.mode || 'prompt';
  const agents =
    (typeof window !== 'undefined' && window._skillsAgentsState?.agents) || [];
  const skills =
    ((typeof window !== 'undefined' && window._skillsAgentsState?.skills) || [])
      .filter(s => s.userInvocable !== false);

  const promptSection = (mode === 'prompt' || !mode) ? `
<div class="wf-step-edit-field">
  <label class="wf-step-edit-label">Prompt</label>
  <span class="wf-field-hint">Instructions envoyées à Claude</span>
  <textarea class="wf-step-edit-input wf-node-prop" data-key="prompt" rows="5"
    placeholder="Analyse ce fichier et résume les changements...">${esc(props.prompt || '')}</textarea>
</div>` : '';

  const agentCards = agents.length
    ? agents.map(a => `<div class="wf-agent-card${props.agentId === a.id ? ' active' : ''}" data-agent-id="${esc(a.id)}">
  <div class="wf-agent-card-text">
    <span class="wf-agent-card-name">${esc(a.name)}</span>
    ${a.description ? `<span class="wf-agent-card-desc">${esc(a.description)}</span>` : ''}
  </div>
  <svg class="wf-agent-card-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
</div>`).join('')
    : '<div class="wf-agent-empty">Aucun agent dans ~/.claude/agents/</div>';

  const agentSection = mode === 'agent' ? `
<div class="wf-step-edit-field">
  <label class="wf-step-edit-label">Agent</label>
  <span class="wf-field-hint">Worker autonome avec contexte isolé</span>
  <div class="wf-agent-grid wf-claude-agent-grid">${agentCards}</div>
</div>
<div class="wf-step-edit-field">
  <label class="wf-step-edit-label">Instructions additionnelles</label>
  <span class="wf-field-hint">Contexte additionnel pour l'agent</span>
  <textarea class="wf-step-edit-input wf-node-prop" data-key="prompt" rows="2"
    placeholder="Focus on performance issues...">${esc(props.prompt || '')}</textarea>
</div>` : '';

  const skillCards = skills.length
    ? skills.map(s => `<div class="wf-agent-card${props.skillId === s.id ? ' active' : ''}" data-skill-id="${esc(s.id)}">
  <div class="wf-agent-card-text">
    <span class="wf-agent-card-name">${esc(s.name)}</span>
    ${s.description ? `<span class="wf-agent-card-desc">${esc(s.description)}</span>` : ''}
  </div>
  <svg class="wf-agent-card-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
</div>`).join('')
    : '<div class="wf-agent-empty">Aucun skill dans ~/.claude/skills/</div>';

  const skillSection = mode === 'skill' ? `
<div class="wf-step-edit-field">
  <label class="wf-step-edit-label">Skill</label>
  <span class="wf-field-hint">Commande spécialisée à invoquer</span>
  <div class="wf-agent-grid wf-claude-skill-grid">${skillCards}</div>
</div>
<div class="wf-step-edit-field">
  <label class="wf-step-edit-label">Arguments</label>
  <span class="wf-field-hint">Texte passé au skill comme argument</span>
  <textarea class="wf-step-edit-input wf-node-prop" data-key="prompt" rows="2"
    placeholder="Arguments optionnels...">${esc(props.prompt || '')}</textarea>
</div>` : '';

  return `<div class="wf-step-edit-field">
  <label class="wf-step-edit-label">Mode d'exécution</label>
  <div class="wf-claude-mode-tabs">
    <button class="wf-claude-mode-tab${mode === 'prompt' ? ' active' : ''}" data-mode="prompt">Prompt</button>
    <button class="wf-claude-mode-tab${mode === 'agent' ? ' active' : ''}" data-mode="agent">Agent</button>
    <button class="wf-claude-mode-tab${mode === 'skill' ? ' active' : ''}" data-mode="skill">Skill</button>
  </div>
</div>
<div class="wf-claude-mode-content">
${promptSection}${agentSection}${skillSection}
</div>`;
}

function renderModelEffort(props) {
  return `<div class="wf-field-row">
<div class="wf-step-edit-field wf-field-half">
  <label class="wf-step-edit-label">Modèle</label>
  <select class="wf-step-edit-input wf-node-prop" data-key="model">
    <option value=""${!props.model ? ' selected' : ''}>Auto</option>
    <option value="sonnet"${props.model === 'sonnet' ? ' selected' : ''}>Sonnet</option>
    <option value="opus"${props.model === 'opus' ? ' selected' : ''}>Opus</option>
    <option value="haiku"${props.model === 'haiku' ? ' selected' : ''}>Haiku</option>
  </select>
</div>
<div class="wf-step-edit-field wf-field-half">
  <label class="wf-step-edit-label">Effort</label>
  <select class="wf-step-edit-input wf-node-prop" data-key="effort">
    <option value=""${!props.effort ? ' selected' : ''}>Auto</option>
    <option value="low"${props.effort === 'low' ? ' selected' : ''}>Low</option>
    <option value="medium"${props.effort === 'medium' ? ' selected' : ''}>Medium</option>
    <option value="high"${props.effort === 'high' ? ' selected' : ''}>High</option>
    <option value="max"${props.effort === 'max' ? ' selected' : ''}>Max</option>
  </select>
</div>
</div>`;
}

module.exports = {
  type: 'claude-config',

  render(field, value, node) {
    const props = node.properties || {};
    return `<div class="wf-field-group" data-key="mode">
${renderCwdSection(props)}
${renderModeSection(props)}
${renderModelEffort(props)}
</div>`;
  },

  bind(container, field, node, onChange) {
    // Bind CWD project select
    const projSel = container.querySelector('.wf-claude-project-select');
    if (projSel) {
      projSel.addEventListener('change', () => {
        node.properties.projectId = projSel.value;
        onChange(projSel.value);

        // Toggle custom path input
        const existing = container.querySelector('.wf-claude-cwd-input')?.closest('.wf-step-edit-field');
        if (projSel.value === '__custom__') {
          if (!existing) {
            const div = document.createElement('div');
            div.className = 'wf-step-edit-field';
            div.innerHTML = `<label class="wf-step-edit-label">Chemin de travail</label>
<span class="wf-field-hint">Chemin absolu ou variable — ex: $item.path</span>
<input class="wf-step-edit-input wf-node-prop wf-field-mono wf-claude-cwd-input" data-key="cwd"
  value="" placeholder="$item.path ou E:\\MonProjet" />`;
            projSel.closest('.wf-step-edit-field').after(div);
            div.querySelector('.wf-claude-cwd-input').addEventListener('input', e => {
              node.properties.cwd = e.target.value;
            });
          }
        } else {
          if (existing) existing.remove();
          node.properties.cwd = '';
        }
      });
    }

    // Bind CWD input if already rendered
    const cwdInp = container.querySelector('.wf-claude-cwd-input');
    if (cwdInp) {
      cwdInp.addEventListener('input', () => { node.properties.cwd = cwdInp.value; });
    }

    // Bind mode tabs
    const modeTabs = container.querySelectorAll('.wf-claude-mode-tab');
    modeTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const newMode = tab.dataset.mode;
        node.properties.mode = newMode;
        onChange(newMode);

        modeTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // Re-render mode content
        const modeContent = container.querySelector('.wf-claude-mode-content');
        if (!modeContent) return;
        const props = node.properties || {};

        function e(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

        const agents = (typeof window !== 'undefined' && window._skillsAgentsState?.agents) || [];
        const skills = ((typeof window !== 'undefined' && window._skillsAgentsState?.skills) || []).filter(s => s.userInvocable !== false);

        let html = '';
        if (newMode === 'prompt' || !newMode) {
          html = `<div class="wf-step-edit-field">
  <label class="wf-step-edit-label">Prompt</label>
  <span class="wf-field-hint">Instructions envoyées à Claude</span>
  <textarea class="wf-step-edit-input wf-node-prop" data-key="prompt" rows="5"
    placeholder="Analyse ce fichier et résume les changements...">${e(props.prompt || '')}</textarea>
</div>`;
        } else if (newMode === 'agent') {
          const cards = agents.length
            ? agents.map(a => `<div class="wf-agent-card${props.agentId === a.id ? ' active' : ''}" data-agent-id="${e(a.id)}">
  <div class="wf-agent-card-text">
    <span class="wf-agent-card-name">${e(a.name)}</span>
    ${a.description ? `<span class="wf-agent-card-desc">${e(a.description)}</span>` : ''}
  </div>
  <svg class="wf-agent-card-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
</div>`).join('')
            : '<div class="wf-agent-empty">Aucun agent dans ~/.claude/agents/</div>';
          html = `<div class="wf-step-edit-field">
  <label class="wf-step-edit-label">Agent</label>
  <span class="wf-field-hint">Worker autonome avec contexte isolé</span>
  <div class="wf-agent-grid wf-claude-agent-grid">${cards}</div>
</div>
<div class="wf-step-edit-field">
  <label class="wf-step-edit-label">Instructions additionnelles</label>
  <textarea class="wf-step-edit-input wf-node-prop" data-key="prompt" rows="2"
    placeholder="Focus on performance issues...">${e(props.prompt || '')}</textarea>
</div>`;
        } else if (newMode === 'skill') {
          const cards = skills.length
            ? skills.map(s => `<div class="wf-agent-card${props.skillId === s.id ? ' active' : ''}" data-skill-id="${e(s.id)}">
  <div class="wf-agent-card-text">
    <span class="wf-agent-card-name">${e(s.name)}</span>
    ${s.description ? `<span class="wf-agent-card-desc">${e(s.description)}</span>` : ''}
  </div>
  <svg class="wf-agent-card-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
</div>`).join('')
            : '<div class="wf-agent-empty">Aucun skill dans ~/.claude/skills/</div>';
          html = `<div class="wf-step-edit-field">
  <label class="wf-step-edit-label">Skill</label>
  <span class="wf-field-hint">Commande spécialisée à invoquer</span>
  <div class="wf-agent-grid wf-claude-skill-grid">${cards}</div>
</div>
<div class="wf-step-edit-field">
  <label class="wf-step-edit-label">Arguments</label>
  <textarea class="wf-step-edit-input wf-node-prop" data-key="prompt" rows="2"
    placeholder="Arguments optionnels...">${e(props.prompt || '')}</textarea>
</div>`;
        }

        modeContent.innerHTML = html;

        // Bind re-rendered agent/skill cards
        modeContent.querySelectorAll('[data-agent-id]').forEach(card => {
          card.addEventListener('click', () => {
            modeContent.querySelectorAll('[data-agent-id]').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            node.properties.agentId = card.dataset.agentId;
          });
        });
        modeContent.querySelectorAll('[data-skill-id]').forEach(card => {
          card.addEventListener('click', () => {
            modeContent.querySelectorAll('[data-skill-id]').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            node.properties.skillId = card.dataset.skillId;
          });
        });
        // Re-bind prompt textarea
        const ta = modeContent.querySelector('[data-key="prompt"]');
        if (ta) ta.addEventListener('input', () => { node.properties.prompt = ta.value; });
      });
    });

    // Bind initial agent/skill card clicks
    container.querySelectorAll('[data-agent-id]').forEach(card => {
      card.addEventListener('click', () => {
        container.querySelectorAll('[data-agent-id]').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        node.properties.agentId = card.dataset.agentId;
      });
    });
    container.querySelectorAll('[data-skill-id]').forEach(card => {
      card.addEventListener('click', () => {
        container.querySelectorAll('[data-skill-id]').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        node.properties.skillId = card.dataset.skillId;
      });
    });
  },
};
