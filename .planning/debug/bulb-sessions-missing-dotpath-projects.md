# Bug: Lightbulb session list empty for projects with dots in path

## Symptom
Projects whose filesystem path contains dots (e.g. `ConfigHub.Claude`, `ConfigHub.Server`,
`IsyStats.IsyStats`) show zero sessions in the lightbulb resume dialog — even though Claude
Code sessions exist on disk.

## Root Cause
`encodeProjectPath()` in `src/main/ipc/claude.ipc.js` only replaced `:`, `\`, `/` with `-`.

```js
// OLD — broken for dots, spaces, parentheses, etc.
return projectPath.replace(/:/g, '-').replace(/\\/g, '-').replace(/\//g, '-');
```

Claude Code's actual encoding (function `Cx` in `cli.js`) replaces **every non-alphanumeric
character** with `-`:

```js
// Claude Code source (deminified)
function Cx(path) {
  let encoded = path.replace(/[^a-zA-Z0-9]/g, '-');
  if (encoded.length <= 200) return encoded;
  let hash = hMK(path); // DJB2 hash, base36
  return `${encoded.slice(0, 200)}-${hash}`;
}
```

So `C:\Users\uhgde\source\repos\ConfigHub.Claude` encodes as:
- **Claude Code:** `C--Users-uhgde-source-repos-ConfigHub-Claude` (dot → dash)
- **Old code:**   `C--Users-uhgde-source-repos-ConfigHub.Claude` (dot preserved) → directory not found → empty session list

## Fix
Replaced the three chained `.replace()` calls with a single regex matching Claude Code's
actual behavior: `/[^a-zA-Z0-9]/g`. Also added the 200-char truncation + DJB2 hash suffix
for long paths (matches Claude Code's `hMK` function exactly).

## Files Changed
- `src/main/ipc/claude.ipc.js` — `encodeProjectPath()` rewritten

## Impact
Affects **any project** whose path contains characters other than `a-z`, `A-Z`, `0-9`, or
the already-handled `:`, `\`, `/`. Most commonly: dots (`.`), spaces, parentheses, dashes
in folder names (dashes happened to work before since dash→dash is idempotent).

## Verification
1. Open a project whose path contains a dot (e.g. `ConfigHub.Claude`)
2. Click the lightbulb button
3. Sessions should now appear in the modal
