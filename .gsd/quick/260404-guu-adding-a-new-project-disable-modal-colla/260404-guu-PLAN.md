---
phase: quick
plan: 260404-guu
type: execute
wave: 1
depends_on: []
files_modified: [renderer.js]
autonomous: true
requirements: [QT-260404-guu]

must_haves:
  truths:
    - "Clicking the backdrop while the new-project wizard is open does NOT close the modal"
    - "Clicking the backdrop on any other modal DOES close it (existing behavior preserved)"
    - "ESC key still closes the wizard (unchanged)"
    - "Cancel button and X button still close the wizard (unchanged)"
  artifacts:
    - path: "renderer.js"
      provides: "Guard flag preventing backdrop-close during new-project wizard"
      contains: "wizardModalOpen"
  key_links:
    - from: "renderer.js overlay onclick (line ~3207)"
      to: "closeModal()"
      via: "guard flag check"
      pattern: "wizardModalOpen"
---

<objective>
Prevent the new-project wizard modal from closing when the user clicks the backdrop overlay. This avoids accidental loss of wizard progress (selected type, name, path, clone URL).

Purpose: UX improvement — the wizard has multi-step state that is lost on accidental backdrop clicks.
Output: Modified renderer.js with a guard flag scoped to the new-project wizard only.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@renderer.js (lines 104-116: showModal/closeModal, line 3207: overlay click handler, line 3437+: new-project wizard)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add wizard guard flag to prevent backdrop-close</name>
  <files>renderer.js</files>
  <action>
Three changes in renderer.js:

1. Add a guard variable in the LOCAL STATE section (after line ~118, near `localState`):
   ```js
   let wizardModalOpen = false;
   ```

2. Modify the overlay click handler at line ~3207 to check the guard:
   ```js
   document.getElementById('modal-overlay').onclick = (e) => {
     if (e.target.id === 'modal-overlay' && !wizardModalOpen) closeModal();
   };
   ```

3. In the new-project wizard setup (line ~3437, inside `btn-new-project.onclick`), set the flag to `true` right before or after the `showModal()` call. Then clear it in two places:
   - Wrap `closeModal` in the wizard's Cancel button onclick and the X button to also reset the flag. The simplest approach: override `closeModal` behavior by clearing the flag inside `closeModal()` itself — add `wizardModalOpen = false;` as the first line of `closeModal()`. This is safe because the flag is only `true` during the wizard, and resetting it on every close is a no-op for other modals.

   So the final closeModal becomes:
   ```js
   function closeModal() {
     wizardModalOpen = false;
     document.getElementById('modal-overlay').classList.remove('active');
     document.getElementById('modal')?.classList.remove('modal--sessions');
   }
   ```

   And in btn-new-project.onclick, add after the showModal call:
   ```js
   wizardModalOpen = true;
   ```

This ensures:
- Only the wizard sets the flag
- Every modal close path resets it (closeModal is the single exit point)
- No other modals are affected (flag is false by default)
  </action>
  <verify>
    <automated>npm test</automated>
  </verify>
  <done>Backdrop clicks are ignored while the new-project wizard is open. All other modals retain backdrop-close. ESC and Cancel/X buttons still work for the wizard.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Guard flag preventing backdrop-close on the new-project wizard modal</what-built>
  <how-to-verify>
    1. Run `npm start` to launch the app
    2. Click the "+" button to open the new-project wizard
    3. Click the dark backdrop area outside the modal — modal should stay open
    4. Click Cancel or X — modal should close normally
    5. Open any other modal (e.g., Settings > About, or a git worktree dialog) and click the backdrop — it should close as before
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues</resume-signal>
</task>

</tasks>

<verification>
- `npm test` passes (no regressions)
- Manual: new-project wizard ignores backdrop clicks
- Manual: other modals still close on backdrop click
</verification>

<success_criteria>
- New-project wizard does not close on backdrop click
- All other modals retain existing backdrop-close behavior
- ESC key still closes the wizard
- Cancel and X buttons still close the wizard
- No test regressions
</success_criteria>

<output>
After completion, create `.gsd/quick/260404-guu-adding-a-new-project-disable-modal-colla/260404-guu-SUMMARY.md`
</output>
