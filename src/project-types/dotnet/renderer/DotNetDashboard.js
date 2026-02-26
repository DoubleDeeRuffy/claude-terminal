/**
 * DotNet Dashboard
 * Detection and display logic for .NET / C# projects.
 * Uses lazy access to window.electron_nodeModules to avoid preload timing issues.
 */

const DOTNET_SVG = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1.5 14.5v-9l7 4.5-7 4.5zM6.5 12a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0z"/></svg>';

/**
 * Parse a .csproj file to extract SDK, TargetFramework, and OutputType.
 * @param {string} filePath
 * @param {Object} nodeFs - fs module (lazy access)
 * @returns {{ sdk: string|null, targetFramework: string|null, outputType: string|null }|null}
 */
function parseCsproj(filePath, nodeFs) {
  try {
    const content = nodeFs.readFileSync(filePath, 'utf-8');

    // Extract Sdk attribute from <Project Sdk="...">
    const sdkMatch = content.match(/<Project[^>]*\bSdk="([^"]+)"/i);
    const sdk = sdkMatch ? sdkMatch[1].trim() : null;

    // Extract TargetFramework or TargetFrameworks (handle plural)
    const tfMatch = content.match(/<TargetFramework(?:s)?>([^<]+)<\/TargetFramework(?:s)?>/i);
    let targetFramework = tfMatch ? tfMatch[1].trim() : null;

    // Handle multi-target frameworks (pick highest)
    if (targetFramework && targetFramework.includes(';')) {
      targetFramework = pickHighestFramework(targetFramework);
    }

    // Handle old-style .NET Framework: <TargetFrameworkVersion>v4.8</TargetFrameworkVersion>
    if (!targetFramework) {
      const oldMatch = content.match(/<TargetFrameworkVersion>v(\d+\.\d+)<\/TargetFrameworkVersion>/i);
      if (oldMatch) {
        targetFramework = 'net' + oldMatch[1].replace('.', '');
      }
    }

    // Extract OutputType
    const outputTypeMatch = content.match(/<OutputType>([^<]+)<\/OutputType>/i);
    const outputType = outputTypeMatch ? outputTypeMatch[1].trim().toLowerCase() : null;

    return { sdk, targetFramework, outputType };
  } catch (e) {
    return null;
  }
}

/**
 * Pick the highest target framework from a semicolon-separated list.
 * @param {string} frameworks - e.g. "net8.0;net6.0;netstandard2.0"
 * @returns {string}
 */
function pickHighestFramework(frameworks) {
  const parts = frameworks.split(';').map(f => f.trim()).filter(Boolean);
  if (parts.length === 0) return frameworks;
  if (parts.length === 1) return parts[0];

  parts.sort((a, b) => {
    // Extract numeric portion for comparison: net8.0 -> 8.0, netstandard2.1 -> 2.1
    const numA = parseFloat(a.replace(/^[a-z]+/i, '')) || 0;
    const numB = parseFloat(b.replace(/^[a-z]+/i, '')) || 0;
    return numB - numA;
  });
  return parts[0];
}

/**
 * Count projects referenced in a .sln file.
 * @param {string} slnPath
 * @param {Object} nodeFs
 * @returns {number}
 */
function countProjectsInSln(slnPath, nodeFs) {
  try {
    const content = nodeFs.readFileSync(slnPath, 'utf-8');
    const matches = content.match(/Project\("[^"]*"\)\s*=\s*"[^"]*",\s*"[^"]*\.csproj"/gi);
    return matches ? matches.length : 1;
  } catch (e) {
    return 1;
  }
}

/**
 * Find the first relevant .csproj from a .sln file.
 * Prefers Web/Worker SDK projects; falls back to first existing .csproj.
 * @param {string} slnPath
 * @param {Object} nodePath
 * @param {Object} nodeFs
 * @returns {{ path: string, info: Object }|null}
 */
function findFirstCsprojFromSln(slnPath, nodePath, nodeFs) {
  try {
    const content = nodeFs.readFileSync(slnPath, 'utf-8');
    const slnDir = nodePath.dirname(slnPath);

    // Extract relative .csproj paths from Project() lines
    const lineRegex = /Project\("[^"]*"\)\s*=\s*"[^"]*",\s*"([^"]*\.csproj)"/gi;
    const csprojPaths = [];
    let match;
    while ((match = lineRegex.exec(content)) !== null) {
      // Normalize path separators to OS style
      const rel = match[1].replace(/\\/g, nodePath.sep);
      const abs = nodePath.resolve(slnDir, rel);
      csprojPaths.push(abs);
    }

    if (csprojPaths.length === 0) return null;

    // First pass: look for Web/Worker/Blazor SDK
    for (const csprojPath of csprojPaths) {
      try {
        if (!nodeFs.existsSync(csprojPath)) continue;
        const info = parseCsproj(csprojPath, nodeFs);
        if (!info) continue;
        if (info.sdk && (
          info.sdk === 'Microsoft.NET.Sdk.Web' ||
          info.sdk === 'Microsoft.NET.Sdk.BlazorWebAssembly' ||
          info.sdk === 'Microsoft.NET.Sdk.Blazor' ||
          info.sdk === 'Microsoft.NET.Sdk.Worker'
        )) {
          return { path: csprojPath, info };
        }
      } catch (e) { continue; }
    }

    // Second pass: fall back to first existing .csproj
    for (const csprojPath of csprojPaths) {
      try {
        if (!nodeFs.existsSync(csprojPath)) continue;
        const info = parseCsproj(csprojPath, nodeFs);
        if (info) return { path: csprojPath, info };
      } catch (e) { continue; }
    }

    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Safe readdir that returns empty array on error.
 * @param {string} dir
 * @param {Object} nodeFs
 * @returns {string[]}
 */
function safeReaddir(dir, nodeFs) {
  try {
    return nodeFs.readdirSync(dir);
  } catch (e) {
    return [];
  }
}

/**
 * Detect .NET info for a project directory.
 * Checks root first, then one level deep.
 * @param {string} projectPath
 * @returns {{ sdk: string|null, targetFramework: string|null, outputType: string|null, projectCount: number, hasSlnFile: boolean }|null}
 */
function detectDotNetInfo(projectPath) {
  // Lazy access to avoid preload timing issues
  const nodeFs = window.electron_nodeModules.fs;
  const nodePath = window.electron_nodeModules.path;

  const rootEntries = safeReaddir(projectPath, nodeFs);
  if (rootEntries.length === 0) return null;

  // Check root for .sln and .csproj files
  const rootSlnFiles = rootEntries.filter(e => e.endsWith('.sln'));
  const rootCsprojFiles = rootEntries.filter(e => e.endsWith('.csproj'));

  // .sln takes priority over standalone .csproj
  if (rootSlnFiles.length > 0) {
    const slnPath = nodePath.join(projectPath, rootSlnFiles[0]);
    const projectCount = countProjectsInSln(slnPath, nodeFs);
    const found = findFirstCsprojFromSln(slnPath, nodePath, nodeFs);
    if (found) {
      return {
        sdk: found.info.sdk,
        targetFramework: found.info.targetFramework,
        outputType: found.info.outputType,
        projectCount,
        hasSlnFile: true
      };
    }
    // .sln found but no parseable .csproj — still a .NET project
    return { sdk: null, targetFramework: null, outputType: null, projectCount, hasSlnFile: true };
  }

  if (rootCsprojFiles.length > 0) {
    const csprojPath = nodePath.join(projectPath, rootCsprojFiles[0]);
    const info = parseCsproj(csprojPath, nodeFs);
    if (info) {
      return { ...info, projectCount: 1, hasSlnFile: false };
    }
    return { sdk: null, targetFramework: null, outputType: null, projectCount: 1, hasSlnFile: false };
  }

  // One-level-deep check
  for (const entry of rootEntries) {
    if (entry.startsWith('.') || entry === 'node_modules' || entry === 'bin' || entry === 'obj') continue;
    const subPath = nodePath.join(projectPath, entry);
    try {
      if (!nodeFs.statSync(subPath).isDirectory()) continue;
    } catch (e) { continue; }

    const subEntries = safeReaddir(subPath, nodeFs);
    const subSlnFiles = subEntries.filter(e => e.endsWith('.sln'));
    const subCsprojFiles = subEntries.filter(e => e.endsWith('.csproj'));

    if (subSlnFiles.length > 0) {
      const slnPath = nodePath.join(subPath, subSlnFiles[0]);
      const projectCount = countProjectsInSln(slnPath, nodeFs);
      const found = findFirstCsprojFromSln(slnPath, nodePath, nodeFs);
      if (found) {
        return {
          sdk: found.info.sdk,
          targetFramework: found.info.targetFramework,
          outputType: found.info.outputType,
          projectCount,
          hasSlnFile: true
        };
      }
      return { sdk: null, targetFramework: null, outputType: null, projectCount, hasSlnFile: true };
    }

    if (subCsprojFiles.length > 0) {
      const csprojPath = nodePath.join(subPath, subCsprojFiles[0]);
      const info = parseCsproj(csprojPath, nodeFs);
      if (info) {
        return { ...info, projectCount: 1, hasSlnFile: false };
      }
      return { sdk: null, targetFramework: null, outputType: null, projectCount: 1, hasSlnFile: false };
    }
  }

  return null;
}

/**
 * Map SDK string + output type to a friendly badge label.
 * @param {string|null} sdk
 * @param {string|null} outputType
 * @returns {string}
 */
function sdkToBadgeText(sdk, outputType) {
  if (!sdk) return '.NET';
  switch (sdk) {
    case 'Microsoft.NET.Sdk.Web':              return 'ASP.NET';
    case 'Microsoft.NET.Sdk.BlazorWebAssembly': return 'Blazor WASM';
    case 'Microsoft.NET.Sdk.Blazor':           return 'Blazor Server';
    case 'Microsoft.NET.Sdk.Worker':           return 'Worker Service';
    case 'Microsoft.NET.Sdk.Razor':            return 'Razor';
    case 'Microsoft.NET.Sdk':
      return (outputType === 'library') ? 'Library' : 'Console';
    default:
      return '.NET';
  }
}

/**
 * Return the project icon SVG string.
 * @returns {string}
 */
function getProjectIcon() {
  return DOTNET_SVG;
}

/**
 * Get the dashboard badge for a .NET project.
 * @param {Object} project
 * @returns {{ text: string, cssClass: string }|null}
 */
function getDashboardBadge(project) {
  if (!project || !project.path) return null;
  try {
    const info = detectDotNetInfo(project.path);
    if (!info) return { text: '.NET', cssClass: 'dotnet' };
    return { text: sdkToBadgeText(info.sdk, info.outputType), cssClass: 'dotnet' };
  } catch (e) {
    return { text: '.NET', cssClass: 'dotnet' };
  }
}

/**
 * Get the dashboard stats HTML for a .NET project.
 * @param {Object} ctx - { project, t }
 * @returns {string}
 */
function getDashboardStats(ctx) {
  if (!ctx.project || !ctx.project.path) return '';
  try {
    const info = detectDotNetInfo(ctx.project.path);
    if (!info) return '';

    const framework = info.targetFramework || '.NET';
    const sdkLabel = sdkToBadgeText(info.sdk, info.outputType);

    let countText = '';
    if (info.projectCount > 1) {
      // Use i18n if available, else hardcode
      try {
        countText = ' \u00B7 ' + (ctx.t ? ctx.t('dotnet.projects', { count: info.projectCount }) : `${info.projectCount} projects`);
      } catch (e) {
        countText = ` \u00B7 ${info.projectCount} projects`;
      }
    }

    return `<div class="dashboard-quick-stat dotnet-stat"><span>${framework} - ${sdkLabel}${countText}</span></div>`;
  } catch (e) {
    return '';
  }
}

module.exports = { getDashboardBadge, getDashboardStats, getProjectIcon };
