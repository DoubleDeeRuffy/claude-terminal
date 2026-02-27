---
phase: 11-explorer-natural-sorting
plan: 01
subsystem: ui
tags: [file-explorer, intl-collator, natural-sort, settings, i18n]

# Dependency graph
requires:
  - phase: 1.1-dotfile-visibility-setting
    provides: Explorer settings group with showDotfiles toggle (pattern reused for new toggle row)
provides:
  - Natural sort comparator (_makeFileComparator) in FileExplorer.js
  - explorerNaturalSort setting (default: true) in settings.state.js
  - explorer-natural-sort-toggle in SettingsPanel Explorer group
  - EN/FR i18n keys for explorerNaturalSort
affects: [file-explorer, settings-panel]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-level Intl.Collator instances for file sort (created once, reused per sort)"
    - "Priority tier for sort order: dotfiles (0), special-char prefix (1), alphanumeric (2)"
    - "!== false guard on explorerNaturalSort so undefined/missing defaults to natural sort ON"
    - "Lazy require('../../state/settings.state') inside async function body for call-time read"

key-files:
  created: []
  modified:
    - src/renderer/ui/components/FileExplorer.js
    - src/renderer/state/settings.state.js
    - src/renderer/ui/panels/SettingsPanel.js
    - src/renderer/i18n/locales/en.json
    - src/renderer/i18n/locales/fr.json

key-decisions:
  - "explorerNaturalSort defaults to true — natural sort ON for all users including existing ones upgrading (safe upgrade path via !== false guard)"
  - "Module-level _collatorNatural/_collatorAlpha (not created per-sort call) — Intl.Collator construction is expensive, reuse for performance"
  - "_getNamePriority implements dotfiles-first then special-chars-first ordering within each group (dirs/files)"
  - "Search results use same collator strategy but no dir-first/priority-tier logic — search results are files only"
  - "[Rule 1 - Bug] Fixed wrong require path in TerminalManager.js shouldSkipOscRename: '../state/settings.state' -> '../../state/settings.state'"

patterns-established:
  - "Natural sort: module-level Intl.Collator + _makeFileComparator factory pattern for reusable file sorting"

requirements-completed: [EXPL-SORT-01]

# Metrics
duration: 12min
completed: 2026-02-25
---

# Phase 11 Plan 01: Explorer Natural Sorting Summary

**Natural sort for the file explorer via Intl.Collator with numeric option, user-togglable from the Explorer settings group, dotfiles and special-char prefixes always sorted first within their group**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-02-25T00:00:00Z
- **Completed:** 2026-02-25T00:12:00Z
- **Tasks:** 2
- **Files modified:** 5 (+ 1 auto-fix in TerminalManager.js)

## Accomplishments
- Natural sort comparator (`_makeFileComparator`) using `Intl.Collator({ numeric: true })` replaces the legacy `localeCompare` sort in `readDirectoryAsync`
- Dotfiles sort before regular items, special-char-prefixed names before alphanumeric, within each dir/file group
- Search results in `performSearch` now sorted with the same collator strategy
- `explorerNaturalSort: true` default setting with toggle in Explorer settings group (alongside `showDotfiles`)
- EN and FR i18n keys added

## Task Commits

Each task was committed atomically:

1. **Task 1: Add explorerNaturalSort setting, toggle UI, i18n keys, and save handler** - `84a89e6` (feat)
2. **Task 2: Add natural sort comparator to FileExplorer, sort tree and search results, build renderer** - `4054438` (feat)

## Files Created/Modified
- `src/renderer/ui/components/FileExplorer.js` - Added _collatorNatural, _collatorAlpha, _getNamePriority, _makeFileComparator; replaced readDirectoryAsync sort; added search result sort
- `src/renderer/state/settings.state.js` - Added explorerNaturalSort: true to defaultSettings
- `src/renderer/ui/panels/SettingsPanel.js` - Added toggle row in Explorer settings card; added save handler reading explorer-natural-sort-toggle
- `src/renderer/i18n/locales/en.json` - Added explorerNaturalSort and explorerNaturalSortDesc keys
- `src/renderer/i18n/locales/fr.json` - Added explorerNaturalSort and explorerNaturalSortDesc keys
- `src/renderer/ui/components/TerminalManager.js` - Auto-fix: corrected wrong require path in shouldSkipOscRename

## Decisions Made
- `explorerNaturalSort` defaults to `true` — new users and upgrading users both get natural sort enabled automatically; the `!== false` guard ensures `undefined`/missing key also defaults to ON
- Module-level `Intl.Collator` instances (not per-call) — construction is expensive; created once at module load and reused for every sort operation
- `_getNamePriority` establishes three tiers: dotfiles first (0), special-char prefix (1), normal alphanumeric last (2)
- Search results skip the priority-tier logic since `collectAllFiles` only returns files (no directories), so a plain name comparison is appropriate

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed wrong require path in TerminalManager.js shouldSkipOscRename**
- **Found during:** Task 2 (build renderer step)
- **Issue:** `shouldSkipOscRename` used `require('../state/settings.state')` from `src/renderer/ui/components/TerminalManager.js`, which resolves to `src/renderer/ui/state/settings.state` — a non-existent path. The renderer build failed with "Could not resolve" error.
- **Fix:** Changed to `require('../../state/settings.state')` — the correct relative path from the `components/` directory to `state/`
- **Files modified:** `src/renderer/ui/components/TerminalManager.js`
- **Verification:** `npm run build:renderer` succeeds; `npm test` 262/262 pass
- **Committed in:** `4054438` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Auto-fix was a blocker for the build step. No scope creep.

## Issues Encountered
- Renderer build failed initially due to pre-existing wrong require path in `TerminalManager.js` (from the `fix/hooks-case-sensitive-path` branch). Applied Rule 1 auto-fix inline.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 11 plan 01 is complete; natural sort is fully functional
- Phase 12 (Dashboard Support for DotNet Projects) can proceed independently

---
*Phase: 11-explorer-natural-sorting*
*Completed: 2026-02-25*
