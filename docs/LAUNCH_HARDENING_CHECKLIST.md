# Launch Hardening and Full Functional Test Plan

This checklist governs the pre-launch UI refactor and final release validation for the personal ABPN study application.

## Safety rules

- [ ] Work only in `saripalana/ks-study-guide`.
- [ ] Keep the live `main` branch usable throughout development.
- [ ] Do not alter original question text in `data.js` during the UI refactor.
- [ ] Preserve all stable question IDs.
- [ ] Preserve all existing browser storage keys.
- [ ] Preserve hidden Google Drive backup filenames and formats.
- [ ] Preserve the visible Question Vault folder and production filenames.
- [ ] Do not broaden Google Drive permissions beyond `drive.appdata` and `drive.file`.
- [ ] Do not merge until automated validation and browser regression checks pass.

## Phase 1 — Current production baseline

- [x] Main dashboard loads.
- [x] Existing saved test remains visible.
- [x] Progress-management controls render.
- [x] Visible Question Vault initializes successfully.
- [x] ABPN countdown is deployed.
- [x] Absolute-reset dialog opens without changing data.
- [ ] Absolute-reset dialog closes through Cancel without changing data.
- [ ] Countdown visibly updates once per second.
- [ ] Existing question count and progress remain unchanged after the dialog test.

## Phase 2 — UI foundation refactor

### Design system

- [ ] Move design tokens into a dedicated stylesheet.
- [ ] Centralize spacing, radius, typography, shadows, surfaces, borders, and semantic status colors.
- [ ] Preserve the current visual appearance unless a change is explicitly approved.
- [ ] Define reusable focus, hover, disabled, warning, success, and danger states.

### Reusable components

- [ ] Add a shared dashboard-card component.
- [ ] Add shared button and action-row patterns.
- [ ] Add a shared status-message component.
- [ ] Add a shared confirmation-dialog component.
- [ ] Add a shared empty-state component.
- [ ] Add shared form-field and checkbox patterns.

### Dashboard composition

- [ ] Add named dashboard regions.
- [ ] Add deterministic panel ordering.
- [ ] Remove brittle feature placement based on nearby element IDs where practical.
- [ ] Allow future panels to be moved or hidden through configuration.
- [ ] Keep the existing dashboard order during the refactor.

### Separation of responsibilities

- [ ] Move feature-specific embedded CSS out of JavaScript.
- [ ] Keep Drive authorization and storage operations out of view components.
- [ ] Keep question-bank and analytics calculations out of presentation components.
- [ ] Keep destructive-action coordination separate from dialog rendering.
- [ ] Preserve current global module interfaces until dependent modules are migrated.

### Accessibility and responsive behavior

- [ ] Visible keyboard focus for every interactive control.
- [ ] Dialog focus is trapped while open and returns to its trigger when closed.
- [ ] Escape closes non-running dialogs.
- [ ] Status changes use an appropriate live region.
- [ ] Buttons and fields have accessible names.
- [ ] Color is not the only status indicator.
- [ ] Desktop layout remains usable at 1440 px and larger.
- [ ] Laptop layout remains usable near 1280 px.
- [ ] Tablet layout remains usable near 768–1024 px.
- [ ] Phone layout remains usable near 375–430 px.

## Phase 3 — Automated validation

- [ ] Every local asset referenced by HTML exists.
- [ ] Every JavaScript file passes syntax validation.
- [ ] All 602 current original questions load with unique stable IDs.
- [ ] Required limited Google Drive scopes are present and no broad scope is introduced.
- [ ] No client secret, refresh token, or private key is committed.
- [ ] UI modules load in a deterministic order.
- [ ] Required dashboard regions and components are registered.
- [ ] Hard-reset safeguards remain present.
- [ ] Countdown target remains September 8, 2026 unless explicitly changed.
- [ ] No storage key or Drive filename changes without a migration test.

## Phase 4 — Full browser functional test

### General navigation

- [ ] Main page loads without console errors.
- [ ] Original study guide link works.
- [ ] Dashboard renders all expected sections.
- [ ] Hard refresh does not erase progress.
- [ ] Reload during an active set preserves state.

### Practice-set builder

- [ ] Question-count limits work.
- [ ] Test mode can be selected.
- [ ] Tutor mode can be selected.
- [ ] Timed mode accepts hours, minutes, and seconds.
- [ ] Untimed mode disables timer controls appropriately.
- [ ] Board-pace calculation updates correctly.
- [ ] Randomized set starts with the requested number of questions.

### Exam behavior

- [ ] Question text and choices display correctly.
- [ ] Answers can be selected and changed.
- [ ] Flags can be added and removed.
- [ ] Next, previous, and navigator controls work.
- [ ] Timed countdown continues correctly.
- [ ] Hidden-tab timing behavior matches the approved design.
- [ ] Test-mode explanations remain hidden until submission.
- [ ] Tutor-mode explanations appear at the intended time.
- [ ] Submission calculates correct, incorrect, and omitted results.
- [ ] Completed test is saved and reviewable.

### Dashboard and analytics

- [ ] Summary counts match recorded results.
- [ ] Question tiles show correct status.
- [ ] Status filters work.
- [ ] Incorrect review creates the intended set.
- [ ] Flagged review creates the intended set.
- [ ] Analytics totals match completed tests.
- [ ] Chapter statistics match underlying results.
- [ ] Previous-test review works.
- [ ] Previous-test deletion requires confirmation and updates the dashboard.

### Local recovery

- [ ] Manual recovery backup can be created.
- [ ] Backup download works.
- [ ] Restore creates a rescue backup first.
- [ ] Restore returns the expected progress and tests.
- [ ] Selected-question reset works and preserves saved tests.
- [ ] Entire-bank progress reset works and preserves saved tests.

### Hidden Google Drive backup

- [ ] Connection succeeds with `drive.appdata` only.
- [ ] Initial backup is created.
- [ ] Automatic current-state backup occurs while connected.
- [ ] Significant milestones create historical snapshots.
- [ ] Manual backup works.
- [ ] Latest restore works.
- [ ] Historical restore works.
- [ ] Conflict handling does not silently overwrite data.
- [ ] Token expiry produces a clear reconnect state.

### Visible Question Vault

- [ ] Connection succeeds with `drive.file` only.
- [ ] Existing vault is found rather than duplicated.
- [ ] Production mirror matches the live reviewed bank.
- [ ] Performance file updates.
- [ ] AI-ready correlated export updates.
- [ ] Draft creation works without publishing.
- [ ] Draft validation writes a Change Set.
- [ ] Completed tests are archived in Test History.
- [ ] Existing history is preserved.

### Countdown

- [ ] Countdown updates once per second.
- [ ] Date label shows September 8, 2026.
- [ ] Browser-local timezone behavior is documented.
- [ ] Exam-day message appears on the target date.
- [ ] Passed-date message appears after the date.

### Absolute reset

- [ ] Dialog opens and closes without changing data.
- [ ] Wrong code is rejected.
- [ ] Wrong confirmation phrase is rejected.
- [ ] Missing acknowledgment is rejected.
- [ ] Correct reset downloads a recovery file before clearing data.
- [ ] Hidden Drive state is archived before replacement.
- [ ] Visible performance and test index are archived before replacement.
- [ ] Active browser progress, tests, timing, flags, analytics, and recovery records restart at zero.
- [ ] Original question bank remains unchanged.
- [ ] Historical Drive archives remain available.
- [ ] A failed reset restores browser state when possible.

## Phase 5 — Capacity and performance

- [ ] Dashboard remains responsive with 2,500 cards.
- [ ] Dashboard remains usable at the 5,000-card ceiling.
- [ ] Question filtering does not freeze the browser.
- [ ] Saved tests remain bounded by configured limits.
- [ ] Local recovery remains bounded by configured limits.
- [ ] Drive exports remain within practical personal-use size limits.

## Phase 6 — Release gate

- [ ] Automated validation passes on the final head commit.
- [ ] Desktop functional test passes.
- [ ] Mobile functional test passes.
- [ ] Hidden Drive regression test passes.
- [ ] Visible Question Vault regression test passes.
- [ ] Existing user progress is preserved across the upgrade.
- [ ] Rollback commit is identified before merge.
- [ ] Final pull request documents changed files, migrations, risks, and test results.
- [ ] User approves the final production merge.
