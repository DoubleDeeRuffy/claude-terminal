'use strict';

/**
 * WebApp Tools Module for Claude Terminal MCP
 *
 * Provides webapp project-specific tools: stack detection, npm scripts,
 * dev server control via trigger files.
 *
 * Only relevant for projects with type === 'webapp'.
 */

const fs = require('fs');
const path = require('path');

// -- Logging ------------------------------------------------------------------

function log(...args) {
  process.stderr.write(`[ct-mcp:webapp] ${args.join(' ')}\n`);
}

// -- Data access --------------------------------------------------------------

function getDataDir() {
  return process.env.CT_DATA_DIR || '';
}

function loadProjects() {
  const file = path.join(getDataDir(), 'projects.json');
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    log('Error reading projects.json:', e.message);
  }
  return { projects: [], folders: [], rootOrder: [] };
}

function findWebAppProject(nameOrId) {
  const data = loadProjects();
  return data.projects.find(p =>
    p.type === 'webapp' && (
      p.id === nameOrId ||
      (p.name || '').toLowerCase() === nameOrId.toLowerCase() ||
      path.basename(p.path || '').toLowerCase() === nameOrId.toLowerCase()
    )
  );
}

function listWebAppProjects() {
  const data = loadProjects();
  return data.projects.filter(p => p.type === 'webapp');
}

// -- Framework detection ------------------------------------------------------

const FRAMEWORK_SIGNATURES = [
  { deps: ['next'],           name: 'Next.js' },
  { deps: ['nuxt'],           name: 'Nuxt' },
  { deps: ['@sveltejs/kit'],  name: 'SvelteKit' },
  { deps: ['astro'],          name: 'Astro' },
  { deps: ['gatsby'],         name: 'Gatsby' },
  { deps: ['@angular/core'],  name: 'Angular' },
  { deps: ['svelte'],         name: 'Svelte' },
  { deps: ['vue'],            name: 'Vue' },
  { deps: ['react'],          name: 'React' },
  { deps: ['solid-js'],       name: 'Solid' },
  { deps: ['preact'],         name: 'Preact' },
  { deps: ['express'],        name: 'Express' },
  { deps: ['fastify'],        name: 'Fastify' },
  { deps: ['koa'],            name: 'Koa' },
];

const BUNDLER_SIGNATURES = [
  { deps: ['vite'],         name: 'Vite' },
  { deps: ['webpack'],      name: 'Webpack' },
  { deps: ['esbuild'],      name: 'esbuild' },
  { deps: ['parcel'],       name: 'Parcel' },
  { deps: ['turbopack'],    name: 'Turbopack' },
  { deps: ['rollup'],       name: 'Rollup' },
];

const CSS_SIGNATURES = [
  { deps: ['tailwindcss'],         name: 'Tailwind CSS' },
  { deps: ['@chakra-ui/react'],    name: 'Chakra UI' },
  { deps: ['@mui/material'],       name: 'MUI' },
  { deps: ['styled-components'],   name: 'styled-components' },
  { deps: ['@emotion/react'],      name: 'Emotion' },
  { deps: ['sass'],                name: 'Sass' },
  { deps: ['less'],                name: 'Less' },
  { deps: ['bootstrap'],           name: 'Bootstrap' },
  { deps: ['antd'],                name: 'Ant Design' },
];

const TEST_SIGNATURES = [
  { deps: ['vitest'],              name: 'Vitest' },
  { deps: ['jest'],                name: 'Jest' },
  { deps: ['playwright'],          name: 'Playwright' },
  { deps: ['cypress'],             name: 'Cypress' },
  { deps: ['mocha'],               name: 'Mocha' },
];

const LINT_SIGNATURES = [
  { deps: ['eslint'],              name: 'ESLint' },
  { deps: ['@biomejs/biome'],      name: 'Biome' },
  { deps: ['prettier'],            name: 'Prettier' },
  { deps: ['oxlint'],              name: 'Oxlint' },
];

function detectInDeps(pkg, signatures) {
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const sig of signatures) {
    if (sig.deps.some(d => d in allDeps)) {
      const version = allDeps[sig.deps[0]] || '';
      return { name: sig.name, version: version.replace(/[\^~>=<]/g, '') };
    }
  }
  return null;
}

function detectPackageManager(projectPath) {
  if (fs.existsSync(path.join(projectPath, 'bun.lockb')) || fs.existsSync(path.join(projectPath, 'bun.lock'))) return 'bun';
  if (fs.existsSync(path.join(projectPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(projectPath, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

function readPackageJson(projectPath) {
  const pkgPath = path.join(projectPath, 'package.json');
  if (!fs.existsSync(pkgPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch (_) { return null; }
}

// -- Trigger files ------------------------------------------------------------

function writeTrigger(type, data) {
  const triggerDir = path.join(getDataDir(), 'webapp', 'triggers');
  if (!fs.existsSync(triggerDir)) fs.mkdirSync(triggerDir, { recursive: true });

  const triggerFile = path.join(triggerDir, `${type}_${Date.now()}.json`);
  fs.writeFileSync(triggerFile, JSON.stringify({
    type,
    ...data,
    source: 'mcp',
    timestamp: new Date().toISOString(),
  }), 'utf8');
}

// -- Tool definitions ---------------------------------------------------------

const tools = [
  {
    name: 'webapp_stack',
    description: 'Detect the full tech stack of a webapp project: framework, bundler, CSS solution, test runner, linter, package manager, TypeScript, and Node version. One call gives complete project context.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'WebApp project name or ID' },
      },
      required: ['project'],
    },
  },
  {
    name: 'webapp_scripts',
    description: 'List all npm/yarn/pnpm scripts available in the project with their commands. Shows dev, build, test, lint and any custom scripts.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'WebApp project name or ID' },
      },
      required: ['project'],
    },
  },
  {
    name: 'webapp_start',
    description: 'Start the dev server for a webapp project. Uses the configured devCommand or auto-detects from package.json scripts.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'WebApp project name or ID' },
      },
      required: ['project'],
    },
  },
  {
    name: 'webapp_stop',
    description: 'Stop the running dev server for a webapp project.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'WebApp project name or ID' },
      },
      required: ['project'],
    },
  },
];

// -- Tool handler -------------------------------------------------------------

async function handle(name, args) {
  const ok = (text) => ({ content: [{ type: 'text', text }] });
  const fail = (text) => ({ content: [{ type: 'text', text }], isError: true });

  try {
    // ── webapp_stack ──
    if (name === 'webapp_stack') {
      if (!args.project) return fail('Missing required parameter: project');

      const p = findWebAppProject(args.project);
      if (!p) {
        const webapps = listWebAppProjects();
        if (!webapps.length) return fail('No webapp projects found.');
        return fail(`WebApp project "${args.project}" not found. Available: ${webapps.map(p => p.name || path.basename(p.path)).join(', ')}`);
      }
      if (!p.path || !fs.existsSync(p.path)) return fail(`Project path not found: ${p.path}`);

      const pkg = readPackageJson(p.path);
      if (!pkg) return fail(`No package.json found in ${p.path}`);

      const pm = detectPackageManager(p.path);
      const framework = detectInDeps(pkg, FRAMEWORK_SIGNATURES);
      const bundler = detectInDeps(pkg, BUNDLER_SIGNATURES);
      const css = detectInDeps(pkg, CSS_SIGNATURES);
      const test = detectInDeps(pkg, TEST_SIGNATURES);
      const lint = detectInDeps(pkg, LINT_SIGNATURES);
      const hasTs = fs.existsSync(path.join(p.path, 'tsconfig.json'));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      const hasTypescript = 'typescript' in allDeps;
      const tsVersion = hasTypescript ? (allDeps.typescript || '').replace(/[\^~>=<]/g, '') : null;

      // Node version from .nvmrc, .node-version, or engines
      let nodeVersion = null;
      for (const f of ['.nvmrc', '.node-version']) {
        const nvmrc = path.join(p.path, f);
        if (fs.existsSync(nvmrc)) {
          nodeVersion = fs.readFileSync(nvmrc, 'utf8').trim();
          break;
        }
      }
      if (!nodeVersion && pkg.engines?.node) nodeVersion = pkg.engines.node;

      let output = `# ${p.name || path.basename(p.path)} — Tech Stack\n\n`;

      const row = (label, val) => val ? `  ${label.padEnd(18)} ${val}\n` : '';

      output += row('Framework', framework ? `${framework.name} ${framework.version}` : 'not detected');
      output += row('Bundler', bundler ? `${bundler.name} ${bundler.version}` : 'not detected');
      output += row('CSS', css ? `${css.name} ${css.version}` : 'plain CSS');
      output += row('TypeScript', hasTs ? `yes${tsVersion ? ` (${tsVersion})` : ''}` : 'no');
      output += row('Test runner', test ? `${test.name} ${test.version}` : 'none');
      output += row('Linter', lint ? `${lint.name} ${lint.version}` : 'none');
      output += row('Package manager', pm);
      output += row('Node version', nodeVersion || 'not specified');

      // Dev command
      const devCmd = p.devCommand || null;
      if (devCmd) {
        output += row('Dev command', devCmd);
      } else {
        const scripts = pkg.scripts || {};
        const auto = scripts.dev ? `${pm} run dev` : scripts.start ? `${pm} start` : null;
        output += row('Dev command', auto ? `${auto} (auto)` : 'not configured');
      }

      // Dep counts
      const depCount = Object.keys(pkg.dependencies || {}).length;
      const devDepCount = Object.keys(pkg.devDependencies || {}).length;
      output += `\n  Dependencies      ${depCount} prod, ${devDepCount} dev\n`;

      return ok(output);
    }

    // ── webapp_scripts ──
    if (name === 'webapp_scripts') {
      if (!args.project) return fail('Missing required parameter: project');

      const p = findWebAppProject(args.project);
      if (!p) {
        const webapps = listWebAppProjects();
        if (!webapps.length) return fail('No webapp projects found.');
        return fail(`WebApp project "${args.project}" not found. Available: ${webapps.map(p => p.name || path.basename(p.path)).join(', ')}`);
      }

      const pkg = readPackageJson(p.path);
      if (!pkg) return fail(`No package.json found in ${p.path}`);

      const scripts = pkg.scripts || {};
      const keys = Object.keys(scripts);
      if (!keys.length) return ok(`No scripts defined in ${p.name || path.basename(p.path)}/package.json`);

      const pm = detectPackageManager(p.path);
      let output = `Scripts for ${p.name || path.basename(p.path)} (${pm}):\n\n`;

      // Group by common categories
      const categories = {
        'Dev & Build': ['dev', 'start', 'build', 'serve', 'preview', 'watch'],
        'Test': ['test', 'test:watch', 'test:e2e', 'test:unit', 'test:coverage', 'cypress', 'playwright'],
        'Lint & Format': ['lint', 'lint:fix', 'format', 'prettier', 'eslint', 'typecheck', 'check'],
      };

      const categorized = new Set();

      for (const [catName, catKeys] of Object.entries(categories)) {
        const matching = keys.filter(k => catKeys.some(ck => k === ck || k.startsWith(ck + ':')));
        if (matching.length) {
          output += `## ${catName}\n`;
          for (const k of matching) {
            output += `  ${pm} run ${k}\n    → ${scripts[k]}\n`;
            categorized.add(k);
          }
          output += '\n';
        }
      }

      const other = keys.filter(k => !categorized.has(k));
      if (other.length) {
        output += `## Other\n`;
        for (const k of other) {
          output += `  ${pm} run ${k}\n    → ${scripts[k]}\n`;
        }
      }

      return ok(output);
    }

    // ── webapp_start ──
    if (name === 'webapp_start') {
      if (!args.project) return fail('Missing required parameter: project');

      const p = findWebAppProject(args.project);
      if (!p) return fail(`WebApp project "${args.project}" not found.`);

      writeTrigger('start', { projectId: p.id, projectPath: p.path, devCommand: p.devCommand });
      return ok(`Dev server start triggered for "${p.name || path.basename(p.path)}".`);
    }

    // ── webapp_stop ──
    if (name === 'webapp_stop') {
      if (!args.project) return fail('Missing required parameter: project');

      const p = findWebAppProject(args.project);
      if (!p) return fail(`WebApp project "${args.project}" not found.`);

      writeTrigger('stop', { projectId: p.id });
      return ok(`Dev server stop triggered for "${p.name || path.basename(p.path)}".`);
    }

    return fail(`Unknown webapp tool: ${name}`);
  } catch (error) {
    log(`Error in ${name}:`, error.message);
    return fail(`WebApp error: ${error.message}`);
  }
}

// -- Cleanup ------------------------------------------------------------------

async function cleanup() {}

// -- Exports ------------------------------------------------------------------

module.exports = { tools, handle, cleanup };
