# Phase 11: Explorer Natural Sorting - Research

**Researched:** 2026-02-25
**Domain:** JavaScript string comparison, FileExplorer sorting, Settings toggle pattern
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- Natural numeric sorting: treat numeric segments as numbers (file1 < file2 < file10 < file20)
- Case-insensitive comparison (apple.txt and Apple.txt sort together)
- Leading zeros ignored (file01 and file1 treated as same numeric value)
- Reference: Windows Explorer natural sort behavior
- Directories always sort before files (current behavior preserved)
- Dotfiles/dotfolders sort at the top within their group (before regular items)
- Special-character-prefixed names (_utils, -config, #notes) sort before alphanumeric names
- Natural sort applies to both folder tree view AND search results
- FileExplorer only — Project List sidebar keeps its user-defined order
- Toggle lives in Explorer settings group (alongside existing dotfiles toggle)
- Default for new users: natural sort ON

### Claude's Discretion

- Natural sort algorithm implementation (regex-based, `Intl.Collator` with `numeric: true`, or custom)
- i18n key naming and label wording for the toggle
- How to handle edge cases (emoji filenames, Unicode, very long numeric sequences)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope

</user_constraints>

## Summary

This phase adds natural sort to FileExplorer's directory listing and search results, replacing the current `localeCompare` alphabetical sort. The setting is toggled in the Explorer settings group (alongside `showDotfiles`), stored in `settings.json` under a new key (e.g. `explorerNaturalSort`), and read at call-time inside `readDirectoryAsync()` — exactly the same pattern used by `showDotfiles` in Phase 1.1.

The core sorting algorithm is the most consequential decision. `Intl.Collator` with `{ numeric: true, sensitivity: 'base' }` handles the main case (numeric segments as numbers, case-insensitive) with near-zero code and native C++ performance. The remaining sort-order rules — dotfiles/dotfolders first within their group, then special-character prefixes before alphanumeric — require a two-key comparator: first a computed `priority` integer (0 = dot-prefix, 1 = special-char-prefix, 2 = normal), then `Intl.Collator` on the name. This cleanly separates the ordering concerns.

Search results (`renderSearchResults`) currently show files in the order returned by `collectAllFiles`, which is filesystem/readdir order. For consistency with the locked decision ("natural sort applies to both folder tree view AND search results"), the search results array must be sorted by name with the same comparator before rendering.

**Primary recommendation:** Use `Intl.Collator({ numeric: true, sensitivity: 'base' })` for name comparison, with a priority tier computed per-item (dot > special > normal). Read setting with `getSetting('explorerNaturalSort')` at call-time; no module-level cache needed.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `Intl.Collator` | Built-in (V8/Chrome 120) | Locale-aware numeric string comparison | Native, zero-dependency, handles Unicode, `numeric: true` gives Windows Explorer-like behavior |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None needed | — | — | All logic fits in a single comparator function |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `Intl.Collator` | Regex-split custom comparator | Custom regex handles edge cases explicitly but is ~30 lines of brittle code; Collator handles them better via ICU |
| `Intl.Collator` | `natural-compare` npm package | External dep, no advantage over Collator in Chromium 120 context |

**Installation:** No new packages required.

## Architecture Patterns

### Recommended Project Structure

No structural changes needed. All changes land in:

```
src/renderer/
├── ui/panels/SettingsPanel.js   # Add toggle HTML + read in saveSettings()
├── ui/components/FileExplorer.js # Replace sort comparator in readDirectoryAsync(); sort searchResults
└── state/settings.state.js      # Add explorerNaturalSort: true to defaultSettings
src/renderer/i18n/locales/
├── en.json                      # Add explorerNaturalSort + explorerNaturalSortDesc keys
└── fr.json                      # Add explorerNaturalSort + explorerNaturalSortDesc keys
```

### Pattern 1: Call-time Setting Read (established by Phase 1.1)

**What:** `getSetting()` is called inside the async function body each time it runs, not cached at module level. This makes the toggle take effect immediately on the next directory read without any reload or re-wiring.

**When to use:** Every setting consumed by FileExplorer.

**Example (from existing `readDirectoryAsync`):**
```js
// Source: FileExplorer.js lines 245-246 (Phase 1.1 pattern)
const { getSetting } = require('../../state/settings.state');
const showDotfiles = getSetting('showDotfiles');
```

Apply identically for the new setting:
```js
const explorerNaturalSort = getSetting('explorerNaturalSort');
```

### Pattern 2: Natural Sort Comparator

**What:** A two-key comparator: first compare priority tier (dot-prefix = 0, special-char-prefix = 1, normal = 2 — within each isDirectory group), then compare names using `Intl.Collator`.

**When to use:** Replace the existing sort in `readDirectoryAsync()` and apply to search results.

**Example:**
```js
// Recommended implementation
const collatorNatural = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const collatorAlpha   = new Intl.Collator(undefined, { sensitivity: 'base' });

function getNamePriority(name) {
  if (name.startsWith('.')) return 0;             // dotfiles/dotfolders first
  if (/^[^a-zA-Z0-9\u00C0-\u024F]/.test(name)) return 1; // special chars (_,-,#,@,…) second
  return 2;                                        // normal alphanumeric last
}

function makeComparator(naturalSort) {
  const collator = naturalSort ? collatorNatural : collatorAlpha;
  return (a, b) => {
    // Directories always before files
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    // Within same type: priority tier first
    const pa = getNamePriority(a.name);
    const pb = getNamePriority(b.name);
    if (pa !== pb) return pa - pb;
    // Same priority: name comparison
    return collator.compare(a.name, b.name);
  };
}
```

### Pattern 3: Settings Toggle (established by Phase 1.1)

**What:** Toggle HTML inside the existing Explorer `settings-group` `settings-card`, followed by reading it in `saveSettings()`.

**When to use:** All boolean Explorer settings.

**Example (existing dotfiles toggle, lines 540-549):**
```html
<div class="settings-toggle-row">
  <div class="settings-toggle-label">
    <div>${t('settings.showDotfiles')}</div>
    <div class="settings-toggle-desc">${t('settings.showDotfilesDesc')}</div>
  </div>
  <label class="settings-toggle">
    <input type="checkbox" id="show-dotfiles-toggle" ${settings.showDotfiles !== false ? 'checked' : ''}>
    <span class="settings-toggle-slider"></span>
  </label>
</div>
```

New toggle for natural sort (append inside same `settings-card`, after the dotfiles row):
```html
<div class="settings-toggle-row">
  <div class="settings-toggle-label">
    <div>${t('settings.explorerNaturalSort')}</div>
    <div class="settings-toggle-desc">${t('settings.explorerNaturalSortDesc')}</div>
  </div>
  <label class="settings-toggle">
    <input type="checkbox" id="explorer-natural-sort-toggle" ${settings.explorerNaturalSort !== false ? 'checked' : ''}>
    <span class="settings-toggle-slider"></span>
  </label>
</div>
```

Note the `!== false` guard — same as `showDotfiles` — so that `undefined`/missing key defaults to `true` (natural sort ON for new users and safe upgrade path).

### Anti-Patterns to Avoid

- **Caching the setting at module level:** Would require re-wiring on change. Read at call-time instead (established Phase 1.1 pattern).
- **Sorting `searchResults` inside `collectAllFiles`:** `collectAllFiles` returns all files for filtering; sort should happen in `performSearch` after filtering so the filtered set is sorted, not the pre-filtered full set.
- **Creating `Intl.Collator` inside the comparator on every call:** Create it once outside the sort call; reuse across all comparisons.
- **Assuming `readdir` returns sorted names:** `fs.promises.readdir` order is OS-dependent (NTFS returns alphabetical on Windows, but do not rely on it). Always sort explicitly.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Numeric string comparison | Regex split-and-compare | `Intl.Collator({ numeric: true })` | ICU handles Unicode numerics, locale edge cases, leading zeros automatically |
| Case-insensitive comparison | `.toLowerCase()` before compare | `Intl.Collator({ sensitivity: 'base' })` | Handles accented characters (é, ü) correctly for French filenames |

**Key insight:** Both required behaviors (numeric, case-insensitive) are single options on one `Intl.Collator`. No custom parser needed.

## Common Pitfalls

### Pitfall 1: `Intl.Collator` and leading zeros

**What goes wrong:** `file01` and `file1` sort identically under `{ numeric: true }` (both have numeric value 1). This is the desired behavior per CONTEXT.md ("leading zeros ignored"), but may surprise if order relative to each other needs to be stable.

**Why it happens:** `numeric: true` compares numeric segments by value, not lexicographically.

**How to avoid:** Accept this behavior — it matches the locked decision. The tie-break is whatever the collator returns (implementation-defined stable order). No action needed.

**Warning signs:** None — this is intentional.

### Pitfall 2: Special-character priority regex and Unicode filenames

**What goes wrong:** A filename like `ñoño.txt` starts with `ñ` which is not in `[a-zA-Z0-9]` but is a regular Unicode letter. The regex `/^[^a-zA-Z0-9\u00C0-\u024F]/` must include the Latin Extended blocks to avoid promoting accented-letter-prefixed files to the "special character" priority tier.

**Why it happens:** Simple `[^a-zA-Z0-9]` treats all non-ASCII as "special".

**How to avoid:** Use the Unicode range `\u00C0-\u024F` (Latin Extended-A and Extended-B) to cover common European characters. Emoji and CJK filenames will still land in priority 1 (special char), which is acceptable behavior under "Claude's Discretion" per CONTEXT.md.

**Warning signs:** A filename like `ähnlich.txt` appearing before `aardvark.txt` in the tree.

### Pitfall 3: Search results not sorted

**What goes wrong:** Natural sort toggle appears to work in the tree but not in search results because `performSearch` does not sort after filtering.

**Why it happens:** `collectAllFiles` returns files in BFS/readdir order. The filter is applied but no sort follows.

**How to avoid:** In `performSearch`, after `allFiles.filter(...)`, apply `.sort(makeComparator(explorerNaturalSort))`. The sort comparator for search results uses only name comparison (no `isDirectory` split since search results are files only).

**Warning signs:** Search results appear in seemingly random order regardless of toggle state.

### Pitfall 4: Setting saved but tree not refreshed

**What goes wrong:** User toggles natural sort, saves settings, but the tree still shows old order because expanded folders are cached in `expandedFolders` Map.

**Why it happens:** `readDirectoryAsync` is only called when a folder is first expanded or explicitly refreshed. Cached `entry.children` arrays are not re-sorted when the setting changes.

**How to avoid:** After saving settings, the existing `expandedFolders.clear(); render();` call (used by the Refresh button) is the correct approach. However, this phase should NOT auto-refresh on setting save — the standard settings save path does not do live tree updates for other toggles (showDotfiles also does not auto-refresh). Document that the user needs to collapse/expand folders or click Refresh to see the new sort order. This is consistent behavior and acceptable.

**Warning signs:** Tree shows old order; after manual refresh it sorts correctly.

## Code Examples

### Complete comparator (recommended implementation)

```js
// Source: Research synthesis from Intl.Collator MDN + Phase 1.1 codebase pattern
// Create collators once at module level (outside readDirectoryAsync)
const _collatorNatural = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const _collatorAlpha   = new Intl.Collator(undefined, { sensitivity: 'base' });

function _getNamePriority(name) {
  if (name.startsWith('.')) return 0;
  if (/^[^a-zA-Z0-9\u00C0-\u024F]/.test(name)) return 1;
  return 2;
}

function _makeFileComparator(naturalSort) {
  const collator = naturalSort ? _collatorNatural : _collatorAlpha;
  return (a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    const pa = _getNamePriority(a.name);
    const pb = _getNamePriority(b.name);
    if (pa !== pb) return pa - pb;
    return collator.compare(a.name, b.name);
  };
}
```

### Replacing the sort in `readDirectoryAsync` (lines 274-279 of FileExplorer.js)

```js
// Before (Phase 1.1 state):
result.sort((a, b) => {
  if (a.isDirectory && !b.isDirectory) return -1;
  if (!a.isDirectory && b.isDirectory) return 1;
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
});

// After:
const explorerNaturalSort = getSetting('explorerNaturalSort');
result.sort(_makeFileComparator(explorerNaturalSort !== false));
```

### Sorting search results in `performSearch`

```js
// After existing filter line inside performSearch:
searchResults = allFiles.filter(f => f.name.toLowerCase().includes(query));

// Add sort:
const explorerNaturalSort = getSetting('explorerNaturalSort');
const collator = (explorerNaturalSort !== false) ? _collatorNatural : _collatorAlpha;
searchResults.sort((a, b) => collator.compare(a.name, b.name));
```

### Adding `explorerNaturalSort` to defaultSettings

```js
// In settings.state.js defaultSettings object, near showDotfiles:
showDotfiles: true,
explorerNaturalSort: true,  // true = natural sort (numbers as numbers), false = alphabetical
```

### i18n keys (en.json — after showDotfilesDesc line)

```json
"showDotfiles": "Show dotfiles",
"showDotfilesDesc": "Show hidden files and folders (starting with a dot) in the file explorer",
"explorerNaturalSort": "Natural sort",
"explorerNaturalSortDesc": "Sort filenames with numbers as values (file2 before file10). Matches Windows Explorer behavior.",
```

### i18n keys (fr.json — after showDotfilesDesc line)

```json
"showDotfiles": "Afficher les dotfiles",
"showDotfilesDesc": "Afficher les fichiers et dossiers cachés (commençant par un point) dans l'explorateur de fichiers",
"explorerNaturalSort": "Tri naturel",
"explorerNaturalSortDesc": "Trie les noms de fichiers en traitant les chiffres comme des valeurs (fichier2 avant fichier10). Correspond au comportement de l'Explorateur Windows.",
```

### saveSettings() addition in SettingsPanel.js

```js
// After existing showDotfilesToggle block (lines 1119-1120):
const explorerNaturalSortToggle = document.getElementById('explorer-natural-sort-toggle');
const newExplorerNaturalSort = explorerNaturalSortToggle ? explorerNaturalSortToggle.checked : true;

// Add to newSettings object:
explorerNaturalSort: newExplorerNaturalSort,
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `String.localeCompare` with numeric option | `Intl.Collator` (separate object) | Chrome 57+ / V8 stable | `Intl.Collator` is faster for repeated comparisons because it compiles the collation rules once |
| `localeCompare(b, undefined, { numeric: true })` | `new Intl.Collator(undefined, { numeric: true })` | Long-standing best practice | Same semantic result, better perf for sort arrays |

**Note:** `localeCompare` with options is functionally equivalent to `Intl.Collator` for individual comparisons; the performance advantage of `Intl.Collator` only matters when reused across many comparisons in a sort. Given `MAX_DISPLAY_ENTRIES = 500`, the difference is negligible but the Collator pattern is cleaner.

## Open Questions

1. **Auto-refresh tree after toggle save?**
   - What we know: Other Explorer settings (showDotfiles) do NOT auto-refresh the tree after save. The tree uses cached `expandedFolders` entries.
   - What's unclear: Whether users will notice the tree is stale after toggling natural sort vs. dotfiles (which requires a folder expand to see change).
   - Recommendation: Keep consistent — no auto-refresh on save. User clicks Refresh button or collapses/expands a folder. Document in toggle description if needed.

2. **Should `collectAllFiles` (BFS for search) also sort subdirectory order?**
   - What we know: `collectAllFiles` uses a BFS queue where subdirectory order affects which subtrees are traversed first, but the final result is filtered by filename match. Sort is applied post-filter.
   - What's unclear: Whether subdirectory traversal order matters for search result quality.
   - Recommendation: Do not sort the queue inside `collectAllFiles` — sorting after filter is sufficient and simpler.

## Sources

### Primary (HIGH confidence)

- MDN Web Docs — `Intl.Collator` constructor: `https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Collator/Collator` — verified `numeric` and `sensitivity` options, browser compatibility (Chrome 24+, so Chromium 120 is fully supported)
- Codebase direct inspection — `FileExplorer.js` lines 240-294 (readDirectoryAsync sort block), lines 381-424 (collectAllFiles + performSearch)
- Codebase direct inspection — `SettingsPanel.js` lines 537-551 (Explorer group with showDotfiles toggle), lines 1119-1120 + 1139 (saveSettings pattern)
- Codebase direct inspection — `settings.state.js` lines 35 (`showDotfiles: true` default), line 82 (getSetting pattern)
- Codebase direct inspection — `i18n/locales/en.json` lines 535-537, `fr.json` lines 601-603 (existing Explorer i18n keys)

### Secondary (MEDIUM confidence)

- CONTEXT.md decision: "Match Windows Explorer's natural sort behavior as closely as possible" — `Intl.Collator({ numeric: true })` matches this behavior (verified via MDN)

### Tertiary (LOW confidence)

- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `Intl.Collator` is a V8 built-in, no external deps; fully verified against MDN
- Architecture: HIGH — follows established Phase 1.1 patterns exactly; all touch points confirmed by direct code inspection
- Pitfalls: HIGH — identified from direct code reading (cache invalidation, search results gap); standard JS gotchas

**Research date:** 2026-02-25
**Valid until:** 2026-05-25 (stable — no external dependencies)
