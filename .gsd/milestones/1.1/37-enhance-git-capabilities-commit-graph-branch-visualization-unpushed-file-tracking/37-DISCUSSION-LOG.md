# Phase 37: Enhance Git Capabilities - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-04
**Phase:** 37-enhance-git-capabilities
**Areas discussed:** Commit graph quality, Branch visualization, Current branch arrows, Commit detail

---

## Commit Graph Quality

User provided Rider screenshot vs claude-terminal screenshot comparison. Rider shows rich colored branch lanes, inline decorations, single-row layout. Claude-terminal has basic SVG lanes but less informative.

**User's choice:** Must open as a modal, not sub-tab. "I won't change module-tab, have like 5 clicks to see that."

## Commit Graph Modal Trigger

| Option | Description | Selected |
|--------|-------------|----------|
| Button in git sidebar header | Icon button next to branches section, always visible | ✓ |
| Right-click context menu | "Show Log" on branch | |
| Both | Sidebar button + context menu | |

**User's choice:** A — Button in git sidebar header

## Branch Visualization

User provided Rider branch treeview screenshot showing hierarchical tree with Recent/Local/Remote, folder grouping, ahead/behind counts, search bar.

| Option | Description | Selected |
|--------|-------------|----------|
| Replace current flat branch list | Same location, improved rendering | ✓ |
| New modal/dropdown from branch button | Separate from sidebar | |
| Both sidebar + dropdown | Two access points | |

**User's choice:** A — Replace current flat branch list in sidebar

## Current Branch Button Arrows

User wants exact Rider behavior: green arrow = pushable, blue arrow = behind, both = ahead+behind. Ahead/behind counts in branch treeview.

**User's choice:** Exact Rider behavior with colored arrows on branch button.

## Commit Graph Modal Size

| Option | Description | Selected |
|--------|-------------|----------|
| 80% × 80% | Large, comfortable | |
| 90% × 90% | Nearly fullscreen | |
| 30% × 50% | Compact start, resizable | ✓ |

**User's choice:** 30% width × 50% height default, resizable, persistent size in settings.

## Commit Detail & Diff

**User's choice:** "Defer that, this is its own phase later on"

---

## Claude's Discretion

- SVG graph lane colors and rendering improvements
- Search/filter bar implementation in commit graph modal
- Ahead/behind fetch strategy for non-current branches
- Modal resize handle styling
- Branch tree folder detection algorithm

## Deferred Ideas

- Commit detail & diff view improvements — separate phase
