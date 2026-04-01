# Phase 17: Taskbar Pin Lost on Update - Context

**Gathered:** 2026-02-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Investigate why the Windows taskbar pin is lost when the app auto-updates via electron-updater + NSIS, and fix it. The install location stays the same across updates, yet the pin breaks every time. This phase covers root cause analysis and implementing a fix within the NSIS installer system.

</domain>

<decisions>
## Implementation Decisions

### Update mechanism investigation
- Determine exactly what NSIS does during an auto-update: full uninstall+reinstall, or in-place file replacement?
- Document the findings in a research report (RESEARCH.md)
- Focus: what causes Windows to lose the taskbar pin identity (shortcut recreation, AppUserModelId change, exe path shift, etc.)

### Installer type
- Switching from assisted (wizard) to one-click NSIS is acceptable if it helps fix the issue
- Must stay with NSIS — no migration to MSI or MSIX
- Transition must be seamless for existing users — no manual uninstall required

### Platform scope
- Windows only — macOS and Linux update behavior deferred
- No need to investigate data safety (settings, projects, etc.) — only shortcut stability

### Shortcut stability
- All shortcuts must survive updates: taskbar pin, Start Menu shortcut, desktop shortcut
- No shortcut duplication or recreation on update
- Happens on every update — not a version-specific regression

### Output
- Research report documenting exactly what happens during update
- Implement the fix based on findings

### Claude's Discretion
- Specific NSIS configuration changes needed
- Whether to set explicit AppUserModelId
- Technical approach to preventing shortcut recreation during updates

</decisions>

<specifics>
## Specific Ideas

- The pin breaks on every single update, not a specific version transition
- Install path stays the same (`AppData\Local\Programs\Claude Terminal`) across updates
- Current config: `oneClick: false`, `perMachine: false`, `allowToChangeInstallationDirectory: true`
- User is open to switching to `oneClick: true` if it helps

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 17-on-update-installation-the-pinned-taskbar-icon-gets-lost-is-there-a-whole-uninstall-and-install-happening*
*Context gathered: 2026-02-26*
