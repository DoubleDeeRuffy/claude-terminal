# Phase 12: Dashboard Support For DotNet Projects - Research

**Researched:** 2026-02-25
**Domain:** Electron renderer project-type plugin system + .NET project file parsing
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Project Detection**
- Detect projects by presence of `.sln` or `.csproj` files
- Check project root AND one level deep (e.g., `src/MyApp.sln`)
- When both `.sln` and standalone `.csproj` exist, `.sln` takes priority
- Standalone `.csproj` without `.sln` is treated the same as a 1-project solution

**Dashboard Badge**
- SDK-specific badge text, not generic ".NET"
- Map known SDK attributes to friendly names:
  - `Microsoft.NET.Sdk` → "Console" (or "Library" if OutputType is Library)
  - `Microsoft.NET.Sdk.Web` → "ASP.NET"
  - `Microsoft.NET.Sdk.BlazorWebAssembly` → "Blazor WASM"
  - `Microsoft.NET.Sdk.Worker` → "Worker Service"
  - `Microsoft.NET.Sdk.Razor` → "Razor"
  - Unknown → ".NET"
- For multi-project solutions, badge uses the main executable project's SDK type (first Exe/Web project found)

**Dashboard Stats**
- Show target framework + SDK type (e.g., "net8.0 - Blazor Server")
- Parse `.csproj` XML directly to extract `TargetFramework`/`TargetFrameworks` and `Sdk` attribute — no external `dotnet` CLI commands needed
- For multi-target projects (e.g., `net8.0;net6.0`), show highest version only
- For solutions, show project count (e.g., "3 projects") alongside framework info

**Scope Limits (Phase 12 only)**
- No build/run buttons on dashboard
- No custom terminal configuration or environment variables
- No quick actions in project context menu
- No NuGet package display
- No detailed project breakdown (just count)

**Structure**
- Follow the exact same plugin structure as webapp/api types: `src/project-types/dotnet/` with index.js, renderer/DotNetDashboard.js, i18n/en.json, i18n/fr.json

### Claude's Discretion
- CSS styling and color for the .NET badge
- SVG icon choice for the project type
- Exact layout of stats within the dashboard-quick-stat div
- How to handle `.csproj` files that can't be parsed (malformed XML)
- i18n key naming conventions (follow existing patterns)

### Deferred Ideas (OUT OF SCOPE)
- Build/run integration (dotnet build, dotnet run, dotnet watch) — future phase
- Quick actions (Open .sln in Visual Studio) — future phase
- NuGet package display — future phase
- Custom terminal configuration (Developer PowerShell, env vars) — future phase
- Detailed solution project tree view — future phase
</user_constraints>

---

## Summary

Phase 12 adds a `.NET/C#` project type plugin. The plugin follows the **exact same pattern** as `webapp` and `api` types: a directory under `src/project-types/dotnet/` with an `index.js` (type descriptor), `renderer/DotNetDashboard.js` (badge + stats), and `i18n/en.json` + `i18n/fr.json`. Because this phase is **detection and display only** (no IPC, no server lifecycle, no console), the implementation is dramatically simpler than webapp or api — it needs zero main-process code and zero state management.

The two key technical challenges are: (1) parsing `.csproj` XML synchronously in the renderer process (Node.js `fs` sync APIs are available via the preload bridge's `window.electron_nodeModules.fs`), and (2) extending detection to check one level deep. The XML parsing is straightforward regex-based attribute extraction — no XML library needed since `.csproj` format is well-defined and the attributes we need are in the root `<Project>` element.

There are **two separate type-detection systems** that both need updating: the plugin registry (`src/project-types/registry.js`) and the `PROJECT_TYPE_MARKERS` array in `DashboardService.js`. The plugin registry drives the badge+stats via `getDashboardBadge()`/`getDashboardStats()`. The `PROJECT_TYPE_MARKERS` array drives the `overview-type-badge` (a simpler colored label in the git overview section) and is independent.

**Primary recommendation:** Implement `src/project-types/dotnet/` as a minimal plugin (no main process, no state), register it in `registry.js`, and also update `DashboardService.js` to support one-level-deep detection for `.sln`/`.csproj`.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `window.electron_nodeModules.fs` | built-in | Sync filesystem reads for `.csproj`/`.sln` parsing | Already available in renderer via preload bridge — no new dependency |
| `window.electron_nodeModules.path` | built-in | Path joining for one-level-deep scan | Same as above |

### Supporting

No additional npm packages needed. The `.csproj` format is XML but the attributes we need (`Sdk` on `<Project>`, `<TargetFramework>`, `<OutputType>`) are parseable with simple regex — no XML parser library required.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Regex-based `.csproj` parsing | Full XML parser (e.g. `fast-xml-parser`) | XML parser handles edge cases better but adds a dependency; regex is sufficient for the specific fields needed (Sdk attribute, single tags) |
| In-renderer detection | IPC call to main process | IPC adds latency and complexity; `fs` sync is available in renderer via preload — no benefit to IPC for simple file reads |

**Installation:** No new packages needed.

---

## Architecture Patterns

### Recommended Project Structure

```
src/project-types/dotnet/
├── index.js                    # Type descriptor (createType wrapper)
├── renderer/
│   └── DotNetDashboard.js      # getDashboardBadge() + getDashboardStats()
└── i18n/
    ├── en.json
    └── fr.json
```

No `main/` subdirectory needed — zero IPC handlers for this phase.

### Pattern 1: Minimal Plugin (Detection-Only Type)

**What:** A project type that only overrides `getDashboardBadge`, `getDashboardStats`, `getProjectIcon`, and `getDashboardIcon`. Everything else inherits from `BASE_TYPE` no-ops.

**When to use:** When the type has no server lifecycle, no IPC, no console — purely informational.

**Example (based on existing `general/index.js` + dashboard patterns):**

```javascript
// src/project-types/dotnet/index.js
const { createType } = require('../base-type');

module.exports = createType({
  id: 'dotnet',
  nameKey: 'newProject.types.dotnet',
  descKey: 'newProject.types.dotnetDesc',
  category: 'general',
  icon: '<svg viewBox="0 0 24 24" ...> ... </svg>',

  mainModule: () => null,
  initialize: () => {},
  cleanup: () => {},

  getProjectIcon: () => require('./renderer/DotNetDashboard').getProjectIcon(),
  getDashboardIcon: () => require('./renderer/DotNetDashboard').getProjectIcon(),

  getDashboardBadge: (project) =>
    require('./renderer/DotNetDashboard').getDashboardBadge(project),

  getDashboardStats: (ctx) =>
    require('./renderer/DotNetDashboard').getDashboardStats(ctx),

  getTranslations: () => ({
    en: require('./i18n/en.json'),
    fr: require('./i18n/fr.json')
  }),

  getStyles: () => `
    .dashboard-project-type.dotnet { background: rgba(81,43,212,0.15); color: #7c6af7; }
    .project-type-icon.dotnet svg { color: #7c6af7; }
    .project-item.dotnet-project .project-name svg { color: #7c6af7; width: 14px; height: 14px; margin-right: 6px; flex-shrink: 0; }
    .dotnet-stat { display: flex; align-items: center; gap: 6px; font-size: var(--font-xs); }
  `,

  // No preload bridge needed — no IPC channels
  getPreloadBridge: () => null
});
```

### Pattern 2: getDashboardBadge with Dynamic Text

**What:** The badge text is determined by parsing the `.csproj` at call time (the project path is available from `project.path`).

**Important:** `getDashboardBadge(project)` receives the full `project` object which has `.path`. The detection logic runs synchronously using `fs.readdirSync` and `fs.readFileSync` (both available via `window.electron_nodeModules.fs`).

```javascript
// src/project-types/dotnet/renderer/DotNetDashboard.js

const fs = window.electron_nodeModules.fs;
const path = window.electron_nodeModules.path;

function detectDotNetInfo(projectPath) {
  // 1. Check root for .sln and .csproj
  // 2. Check one level deep if not found at root
  // 3. Parse first applicable .csproj XML
  // Returns: { sdk, targetFramework, projectCount, hasSlnFile }
}

function getDashboardBadge(project) {
  const info = detectDotNetInfo(project.path);
  if (!info) return { text: '.NET', cssClass: 'dotnet' };
  return { text: sdkToBadgeText(info.sdk, info.outputType), cssClass: 'dotnet' };
}

function getDashboardStats(ctx) {
  const { project, t } = ctx;
  const info = detectDotNetInfo(project.path);
  if (!info) return '';
  // e.g. "net8.0 - ASP.NET · 3 projects"
  const frameworkText = info.targetFramework || '';
  const sdkLabel = sdkToFriendlyName(info.sdk);
  const countText = info.projectCount > 1 ? ` · ${info.projectCount} projects` : '';
  return `
    <div class="dashboard-quick-stat dotnet-stat">
      <span>${frameworkText}${frameworkText && sdkLabel ? ' - ' : ''}${sdkLabel}${countText}</span>
    </div>
  `;
}
```

### Pattern 3: .csproj XML Attribute Extraction

**What:** Parse `Sdk` attribute from `<Project Sdk="...">` and child elements `<TargetFramework>`, `<TargetFrameworks>`, `<OutputType>`.

**Why regex is sufficient:** The `Sdk` attribute is always on the root `<Project>` element. The child elements are always simple text nodes. No nested structures needed.

```javascript
function parseCsproj(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    // Sdk attribute: <Project Sdk="Microsoft.NET.Sdk.Web">
    const sdkMatch = content.match(/<Project[^>]*\bSdk="([^"]+)"/i);
    const sdk = sdkMatch ? sdkMatch[1] : null;

    // Target framework(s)
    const tfMatch = content.match(/<TargetFramework(?:s)?>([^<]+)<\/TargetFramework(?:s)?>/i);
    let targetFramework = tfMatch ? tfMatch[1].trim() : null;

    // If multi-target (net8.0;net6.0), pick highest
    if (targetFramework && targetFramework.includes(';')) {
      targetFramework = pickHighestFramework(targetFramework.split(';'));
    }

    // OutputType (for distinguishing Console vs Library)
    const otMatch = content.match(/<OutputType>([^<]+)<\/OutputType>/i);
    const outputType = otMatch ? otMatch[1].trim().toLowerCase() : null;

    return { sdk, targetFramework, outputType };
  } catch (e) {
    return null; // malformed XML or unreadable file — graceful degradation
  }
}
```

### Pattern 4: One-Level-Deep Detection

**What:** The CONTEXT requires checking root AND one level deep (e.g., `src/MyApp.sln`).

```javascript
function findDotNetFiles(projectPath) {
  // Check root
  const rootEntries = safeReaddir(projectPath);
  const rootSln = rootEntries.find(e => e.endsWith('.sln'));
  const rootCsproj = rootEntries.find(e => e.endsWith('.csproj'));

  if (rootSln || rootCsproj) {
    return { slnFile: rootSln ? path.join(projectPath, rootSln) : null,
             csprojFile: rootCsproj ? path.join(projectPath, rootCsproj) : null,
             basePath: projectPath };
  }

  // Check one level deep (subdirectories only)
  for (const entry of rootEntries) {
    const subPath = path.join(projectPath, entry);
    try {
      if (!fs.statSync(subPath).isDirectory()) continue;
    } catch (e) { continue; }
    const subEntries = safeReaddir(subPath);
    const subSln = subEntries.find(e => e.endsWith('.sln'));
    const subCsproj = subEntries.find(e => e.endsWith('.csproj'));
    if (subSln || subCsproj) {
      return { slnFile: subSln ? path.join(subPath, subSln) : null,
               csprojFile: subCsproj ? path.join(subPath, subCsproj) : null,
               basePath: subPath };
    }
  }

  return null;
}
```

### Pattern 5: .sln File Parsing for Project Count

**What:** Count `.csproj` references in a `.sln` file to determine project count.

**.sln file format:** Solution files contain lines like:
```
Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "MyApp", "MyApp\MyApp.csproj", "{GUID}"
```

```javascript
function countProjectsInSln(slnPath) {
  try {
    const content = fs.readFileSync(slnPath, 'utf-8');
    // Count Project( lines that reference .csproj files
    const matches = content.match(/Project\("[^"]+"\)\s*=\s*"[^"]+",\s*"[^"]+\.csproj"/g);
    return matches ? matches.length : 1;
  } catch (e) {
    return 1;
  }
}
```

### Pattern 6: Picking Highest Framework Version

**What:** For multi-target `net8.0;net6.0`, pick `net8.0`.

```javascript
function pickHighestFramework(frameworks) {
  // Sort by version number descending, prefer net* over netstandard* over netcoreapp*
  const parsed = frameworks.map(f => f.trim()).filter(Boolean);
  parsed.sort((a, b) => {
    const vA = parseFloat(a.replace(/^net/, '').replace(/[^0-9.]/g, '')) || 0;
    const vB = parseFloat(b.replace(/^net/, '').replace(/[^0-9.]/g, '')) || 0;
    return vB - vA;
  });
  return parsed[0] || null;
}
```

### Pattern 7: Registering in registry.js

The `dotnet` type must be added to `discoverAll()` in `src/project-types/registry.js` following the exact same pattern as other types:

```javascript
try {
  register(require('./dotnet'));
} catch (e) {
  console.warn('[Registry] Failed to load dotnet type:', e.message);
}
```

### Pattern 8: DashboardService.js Detection Update

The `PROJECT_TYPE_MARKERS` array in `DashboardService.js` already has an entry for `csharp` that covers root-level `.sln` and `.csproj`:

```javascript
{ type: 'csharp', label: 'C#', color: '#512BD4', files: ['*.sln', '*.csproj'] },
```

However, the `fileMatchExists` function **only checks the root directory** — it does NOT check one level deep. Since the CONTEXT requires one-level-deep detection, `detectProjectType` in `DashboardService.js` needs to also check one level deep for `.sln`/`.csproj` files when the root check fails.

This update is separate from the plugin — the `PROJECT_TYPE_MARKERS` check feeds the `overview-type-badge` (colored label in the git overview card), while the plugin's `getDashboardBadge` feeds the main dashboard header badge. Both need to detect correctly.

**The approach:** Extend `detectProjectType` to run a second pass that checks one level deep for the `csharp` marker type (or more generically, for any marker that supports sub-directory checking).

### Anti-Patterns to Avoid

- **Spawning `dotnet` CLI:** The CONTEXT explicitly forbids external CLI calls. Parse XML directly.
- **Async file reads in `getDashboardBadge`:** The badge hook is called synchronously in template rendering. Use `fs.readFileSync` (available via `window.electron_nodeModules.fs`).
- **Adding main-process IPC:** Not needed for detection-only type. No `webapp.ipc.js` equivalent.
- **Adding `getPreloadBridge()`:** No IPC channels needed, return `null` (base default).
- **Adding `getConsoleConfig()`:** No type-specific console. Base no-op is correct.
- **Adding wizard fields:** The dotnet type uses the generic project wizard without custom fields.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| File detection | Custom glob walker | `fs.readdirSync` + `.endsWith()` | Already the pattern used by `fileMatchExists` in DashboardService |
| XML parsing | Full DOM parser | Regex on known fields | `.csproj` format is stable; the 3 fields we need are simple text nodes or root attributes |
| SDK label mapping | Dynamic lookup | Static `switch/if-else` map | The SDK strings are Microsoft-defined constants, not user-extensible |

**Key insight:** This phase is intentionally minimal. Resist scope creep toward build/run integration — the CONTEXT explicitly defers that.

---

## Common Pitfalls

### Pitfall 1: Calling `fs.readFileSync` Before preload is Ready

**What goes wrong:** `window.electron_nodeModules.fs` is available but the module-level destructure may fail if the module loads before the preload bridge is set up.

**Why it happens:** `const fs = window.electron_nodeModules.fs` at module top-level could be `undefined` if the file is `require()`d before the renderer's init sequence completes.

**How to avoid:** Access `window.electron_nodeModules.fs` inside the function body (lazy access), not at module top-level. Look at how existing types like `WebAppService.js` access Node modules.

**Warning signs:** `Cannot read property 'readFileSync' of undefined` in renderer console.

### Pitfall 2: Forgetting `project.type` Must Match Plugin ID

**What goes wrong:** The dashboard renders using `registry.get(project.type)` — if a project's saved `type` is `'standalone'` (the default), it will use the `general` type handler regardless of what files exist in the project folder.

**Why it happens:** `project.type` is set when the project is added via the wizard, and persists in `projects.json`. Projects added before this plugin exists will have `type: 'standalone'`.

**How to avoid:** This is expected behavior — existing projects won't automatically get the `dotnet` type. New projects can be added with type `dotnet`, OR a future migration could auto-detect and update. For Phase 12, this is acceptable (the CONTEXT says detection-and-display, not migration).

**Warning signs:** Badge shows "Standalone" for a .NET project → user must re-add or re-select type.

**Clarification:** The `getDashboardStats` and `getDashboardBadge` hooks only fire when `project.type === 'dotnet'`. The `detectProjectType` in DashboardService (for the overview badge) fires for ALL projects regardless of type — so the overview-type-badge will show "C#" even for `standalone` type .NET projects.

### Pitfall 3: .sln Priority Not Implemented

**What goes wrong:** When both `.sln` and `.csproj` exist at root, picking `.csproj` gives wrong stats.

**Why it happens:** `readdirSync` returns files in arbitrary order; naive `find()` might pick `.csproj` first.

**How to avoid:** In `findDotNetFiles`, always prefer `.sln` over standalone `.csproj` — check for `.sln` first, only fall back to `.csproj` if no `.sln` found.

### Pitfall 4: `getDashboardStats` Called with No `project` in ctx

**What goes wrong:** The `ctx` object passed to `getDashboardStats` has `{ projectIndex, t, fivemStatus, project }` — some callers may pass minimal context.

**Why it happens:** Looking at the DashboardService call site: `typeHandler.getDashboardStats({ fivemStatus, projectIndex, project, t })`. The `project` is included.

**How to avoid:** Always guard: `if (!ctx.project || !ctx.project.path) return '';`

### Pitfall 5: Multi-Target Framework Regex Match

**What goes wrong:** `<TargetFrameworks>net8.0;net6.0</TargetFrameworks>` (plural) vs `<TargetFramework>net8.0</TargetFramework>` (singular).

**Why it happens:** The regex must handle both tag names.

**How to avoid:** Use `<TargetFramework(?:s)?>` to match both. The existing code examples above already demonstrate this.

### Pitfall 6: DashboardService `csharp` Marker Already Exists

**What goes wrong:** The `PROJECT_TYPE_MARKERS` already has `csharp` with `*.sln` and `*.csproj` patterns. This means the overview-type-badge already works for root-level files. The ONLY missing piece is one-level-deep support.

**Why it matters:** Don't duplicate the marker — just extend the detection logic. Adding a second `dotnet` marker entry would create a conflict.

---

## Code Examples

### SDK-to-Badge Mapping

```javascript
// Source: CONTEXT.md user decisions
const SDK_MAP = {
  'Microsoft.NET.Sdk.Web':               'ASP.NET',
  'Microsoft.NET.Sdk.BlazorWebAssembly': 'Blazor WASM',
  'Microsoft.NET.Sdk.Blazor':            'Blazor Server',
  'Microsoft.NET.Sdk.Worker':            'Worker Service',
  'Microsoft.NET.Sdk.Razor':             'Razor',
  'Microsoft.NET.Sdk':                   null  // resolved below with OutputType check
};

function sdkToBadgeText(sdk, outputType) {
  if (!sdk) return '.NET';
  const mapped = SDK_MAP[sdk];
  if (mapped) return mapped;
  if (sdk === 'Microsoft.NET.Sdk') {
    return (outputType === 'library') ? 'Library' : 'Console';
  }
  return '.NET';
}
```

### .NET Badge Color

The .NET brand color is `#512BD4` (official .NET purple). A slightly lighter version works well for the badge text on dark backgrounds: `#7c6af7` for text, `rgba(81,43,212,0.15)` for background.

This follows the same pattern as the `api` type (`#a855f7` for text, `rgba(168,85,247,0.15)` for background).

### i18n Keys Pattern

Based on existing conventions in `webapp/i18n/en.json`:

```json
// src/project-types/dotnet/i18n/en.json
{
  "dotnet": {
    "framework": "Framework",
    "projects": "{count} projects",
    "badgeLabel": ".NET"
  },
  "newProject": {
    "types": {
      "dotnet": ".NET / C#",
      "dotnetDesc": "C# project with .sln or .csproj"
    }
  }
}
```

### Full detectDotNetInfo Function

```javascript
function detectDotNetInfo(projectPath) {
  const nodeFs = window.electron_nodeModules.fs;
  const nodePath = window.electron_nodeModules.path;

  function safeReaddir(dir) {
    try { return nodeFs.readdirSync(dir); } catch (e) { return []; }
  }

  function findInDir(dir) {
    const entries = safeReaddir(dir);
    const sln = entries.find(e => e.endsWith('.sln'));
    const csproj = entries.find(e => e.endsWith('.csproj'));
    return { sln: sln ? nodePath.join(dir, sln) : null,
             csproj: csproj ? nodePath.join(dir, csproj) : null };
  }

  // Root check
  let found = findInDir(projectPath);

  // One level deep if not found at root
  if (!found.sln && !found.csproj) {
    const rootEntries = safeReaddir(projectPath);
    for (const entry of rootEntries) {
      const subPath = nodePath.join(projectPath, entry);
      try {
        if (!nodeFs.statSync(subPath).isDirectory()) continue;
      } catch (e) { continue; }
      found = findInDir(subPath);
      if (found.sln || found.csproj) break;
    }
  }

  if (!found.sln && !found.csproj) return null;

  // .sln takes priority over standalone .csproj
  const csprojToAnalyze = found.sln
    ? findFirstCsprojFromSln(found.sln, nodePath, nodeFs)
    : found.csproj;

  const projectCount = found.sln
    ? countProjectsInSln(found.sln, nodeFs)
    : 1;

  const csprojInfo = csprojToAnalyze
    ? parseCsproj(csprojToAnalyze, nodeFs)
    : null;

  return {
    sdk: csprojInfo?.sdk || null,
    targetFramework: csprojInfo?.targetFramework || null,
    outputType: csprojInfo?.outputType || null,
    projectCount,
    hasSlnFile: !!found.sln
  };
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `<Project>` without `Sdk` attribute (old-style .NET Framework) | `<Project Sdk="...">` (SDK-style introduced .NET Core) | ~2017 with .NET Core 1.0 | Old-style projects won't have an Sdk attribute — gracefully fall back to ".NET" label |
| `.csproj` as complex XML with ItemGroups | Minimal SDK-style `.csproj` (just `<Project Sdk="...">`, `<PropertyGroup>`) | .NET Core 2.0+ | Modern .csproj files are very small and easy to parse with regex |

**Deprecated/outdated:**
- Old-style `.csproj` format (MSBuild-heavy, with `xmlns` namespace): Has no `Sdk` attribute — the regex `<Project[^>]*\bSdk="([^"]+)"` won't match. This is a graceful degradation — badge shows `.NET` and stats show whatever TargetFramework was found.
- `.NET Framework` project files use `<TargetFrameworkVersion>v4.8</TargetFrameworkVersion>` instead of `<TargetFramework>net48</TargetFramework>` — the regex must optionally handle both (or just gracefully skip old format).

---

## Open Questions

1. **Should `getDashboardBadge` be cached?**
   - What we know: The badge is re-computed on every dashboard render, which calls `fs.readFileSync` each time.
   - What's unclear: How frequently the dashboard re-renders in practice.
   - Recommendation: No caching for Phase 12. The files are small and `readFileSync` is fast. Add caching only if performance is observed to be a problem (future phase concern).

2. **How to find the "main" .csproj from a .sln file for badge determination?**
   - What we know: `.sln` files list all projects. The CONTEXT says "first Exe/Web project found" for multi-project solutions.
   - What's unclear: Whether `OutputType` is always explicit (default is `Exe` for console, implicit for web).
   - Recommendation: Parse `.sln` to get `.csproj` paths, then iterate through them parsing `Sdk` attribute. First one with `Microsoft.NET.Sdk.Web` or `Microsoft.NET.Sdk.BlazorWebAssembly` wins; fallback to the first `.csproj` found.

3. **DashboardService one-level-deep detection scope**
   - What we know: Only `.sln`/`.csproj` need one-level-deep per the CONTEXT.
   - What's unclear: Whether to make this a general capability or csharp-specific.
   - Recommendation: Make it csharp-specific in `detectProjectType` — add a check after the main loop for `csharp` marker type if the root check failed. Keeps the general `fileMatchExists` function simple.

---

## Sources

### Primary (HIGH confidence)

- Direct code inspection of `src/project-types/webapp/index.js` — type descriptor pattern
- Direct code inspection of `src/project-types/webapp/renderer/WebAppDashboard.js` — badge/stats pattern
- Direct code inspection of `src/project-types/base-type.js` — BASE_TYPE interface
- Direct code inspection of `src/project-types/registry.js` — registration and discoverAll pattern
- Direct code inspection of `src/renderer/services/DashboardService.js` lines 98-197 — PROJECT_TYPE_MARKERS and detectProjectType
- Direct code inspection of `src/renderer/services/DashboardService.js` line 1042-1108 — dashboard render uses `registry.get(project.type)` and `getDashboardStats`

### Secondary (MEDIUM confidence)

- `.csproj` SDK-style format documentation (Microsoft, widely documented): `<Project Sdk="Microsoft.NET.Sdk.Web">` is the root element with optional `Sdk` attribute for all modern .NET Core/.NET 5+ projects
- `.sln` format: `Project("{type-guid}") = "name", "path.csproj", "{project-guid}"` line format is stable since Visual Studio 2010

### Tertiary (LOW confidence)

- `Microsoft.NET.Sdk.Blazor` for Blazor Server (as opposed to `BlazorWebAssembly`) — should be verified against a real Blazor Server `.csproj` if exact SDK string matters

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, all patterns directly from existing codebase
- Architecture: HIGH — follows exact same plugin structure as webapp/api, verified by reading all files
- Pitfalls: HIGH for detection/registration pitfalls (code-verified), MEDIUM for .csproj format edge cases (stable format but limited real-world sample)

**Research date:** 2026-02-25
**Valid until:** 2026-04-25 (stable domain — .csproj format and plugin architecture won't change)
