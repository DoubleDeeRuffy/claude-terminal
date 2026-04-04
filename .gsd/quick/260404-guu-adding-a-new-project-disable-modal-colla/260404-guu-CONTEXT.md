# Quick Task 260404-guu: Disable modal collapse on click away - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Task Boundary

When the "Add New Project" wizard modal is open, clicking on the backdrop (outside the modal) should NOT close the modal. This prevents accidental loss of wizard progress (selected type, name, path, clone URL, etc.).

</domain>

<decisions>
## Implementation Decisions

### Scope
- Only the "new project" wizard modal is affected. All other modals using `showModal()` retain their current backdrop-close behavior.

### Backdrop click behavior
- Completely ignore backdrop clicks while the wizard is open. User closes via X button or Cancel button only.

### ESC key handling
- Keep ESC closing the wizard as-is. ESC is an intentional action, not accidental like a misclick on the backdrop.

### Claude's Discretion
- Implementation approach for scoping the fix to only the new-project wizard (flag, CSS class, or conditional check)

</decisions>

<specifics>
## Specific Ideas

- `renderer.js:3207` — global overlay click handler: `document.getElementById('modal-overlay').onclick = (e) => { if (e.target.id === 'modal-overlay') closeModal(); };`
- `renderer.js:3437` — new project wizard opens via `showModal()` into `#modal-overlay`
- The modal system is a single shared `#modal-overlay` element in `index.html:833`
- Simplest approach: add a guard flag (e.g., `wizardOpen`) that the overlay click handler checks before calling `closeModal()`

</specifics>
