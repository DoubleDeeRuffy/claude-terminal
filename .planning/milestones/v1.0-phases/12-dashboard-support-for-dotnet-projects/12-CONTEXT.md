# Phase 12: Dashboard Support For DotNet Projects - Context

**Gathered:** 2026-02-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a new .NET/C# project type following the existing plugin architecture (like webapp, api, fivem). The type detects .NET projects, shows an SDK-specific badge, and displays target framework + SDK type in the dashboard stats area. No build/run integration, no quick actions, no NuGet display — dashboard detection and display only.

</domain>

<decisions>
## Implementation Decisions

### Project Detection
- Detect projects by presence of `.sln` or `.csproj` files
- Check project root AND one level deep (e.g., `src/MyApp.sln`)
- When both `.sln` and standalone `.csproj` exist, `.sln` takes priority
- Standalone `.csproj` without `.sln` is treated the same as a 1-project solution

### Dashboard Badge
- SDK-specific badge text, not generic ".NET"
- Map known SDK attributes to friendly names:
  - `Microsoft.NET.Sdk` → "Console" (or "Library" if OutputType is Library)
  - `Microsoft.NET.Sdk.Web` → "ASP.NET"
  - `Microsoft.NET.Sdk.BlazorWebAssembly` → "Blazor WASM"
  - `Microsoft.NET.Sdk.Worker` → "Worker Service"
  - `Microsoft.NET.Sdk.Razor` → "Razor"
  - Unknown → ".NET"
- For multi-project solutions, badge uses the main executable project's SDK type (first Exe/Web project found)

### Dashboard Stats
- Show target framework + SDK type (e.g., "net8.0 - Blazor Server")
- Parse `.csproj` XML directly to extract `TargetFramework`/`TargetFrameworks` and `Sdk` attribute — no external `dotnet` CLI commands needed
- For multi-target projects (e.g., `net8.0;net6.0`), show highest version only
- For solutions, show project count (e.g., "3 projects") alongside framework info

### Scope Limits (Phase 12 only)
- No build/run buttons on dashboard
- No custom terminal configuration or environment variables
- No quick actions in project context menu
- No NuGet package display
- No detailed project breakdown (just count)

### Claude's Discretion
- CSS styling and color for the .NET badge
- SVG icon choice for the project type
- Exact layout of stats within the dashboard-quick-stat div
- How to handle `.csproj` files that can't be parsed (malformed XML)
- i18n key naming conventions (follow existing patterns)

</decisions>

<specifics>
## Specific Ideas

- Follow the exact same plugin structure as webapp/api types: `src/project-types/dotnet/` with index.js, renderer/DotNetDashboard.js, i18n/en.json, i18n/fr.json
- The dashboard experience should feel identical to other project types — just a badge and a stats line, nothing more
- Detection should be fast — file existence checks + lightweight XML parsing, no spawning processes

</specifics>

<deferred>
## Deferred Ideas

- Build/run integration (dotnet build, dotnet run, dotnet watch) — future phase
- Quick actions (Open .sln in Visual Studio) — future phase
- NuGet package display — future phase
- Custom terminal configuration (Developer PowerShell, env vars) — future phase
- Detailed solution project tree view — future phase

</deferred>

---

*Phase: 12-dashboard-support-for-dotnet-projects*
*Context gathered: 2026-02-25*
