# Question Bank Governance and Editing Workflow

## Purpose

The live question bank must remain recoverable and reviewable even when questions, answer choices, correct answers, or explanations are being revised. No Drive draft can directly alter the live site.

## Environments

### 1. GitHub `main` — live production

- `data.js` on `main` is the question bank loaded by the public study site.
- Changes reach `main` only after validation and review.
- The visible Drive `Production` folder is a mirror and backup of this reviewed bank; it is not the runtime source.

### 2. GitHub `question-bank-staging` — proposed code changes

- All requested question-bank edits should first be committed to this branch.
- The branch must remain based on the latest `main` before work begins.
- A diff and validation result should be reviewed before merging.
- The live question bank must never be edited directly on `main` for ordinary content work.

### 3. Google Drive `Drafts` — editable data workspace

- `question-bank-draft.json` is the AI- and human-editable working copy.
- Creating or refreshing a draft archives the prior draft first.
- Draft validation records are stored in `Change Sets`.
- A Drive draft never auto-publishes to GitHub or to the live site.

### 4. Google Drive `History` — append-only content recovery

- The prior Production package is archived before a changed production mirror is written.
- Earlier drafts are archived before replacement.
- The application exposes no History deletion control.

### 5. Google Drive `Test History` — append-only performance evidence

- Every completed test is archived as a separate JSON record after the vault is connected.
- The completed-test index prevents duplicate archival of the same stable set ID.
- Cumulative per-question metrics retain already-synchronized attempts even if an older test is later deleted from the dashboard or falls outside the browser's rolling 50-test list.
- The application exposes no completed-test-history deletion control.

## Stable identity

Every question must keep a stable `id`. Editing text, answer choices, the correct answer, or an explanation must not change the ID. New questions receive new IDs. IDs must never be reused after a question is retired because progress, analytics, saved tests, cumulative performance, and completed-test history are keyed to them.

## Required validation

A draft or code change must pass all of the following before production:

- Every question has a unique nonempty ID.
- Chapter and question numbers are valid.
- Question text is present.
- At least two answer choices exist.
- Choice letters and choices have equal lengths.
- The correct answer letter exists among the choices.
- The full question source remains parseable.
- Additions, changes, and removals are explicitly reported.
- Any removal receives deliberate review because it can orphan historical analytics.

## Standard change process

1. Create or refresh the Drive draft from Production.
2. Make requested changes only in the Drive draft and/or GitHub staging branch.
3. Validate the draft and inspect the generated change summary.
4. Apply the same reviewed changes to `question-bank-staging`.
5. Run repository validation and review the Git diff.
6. Merge to `main` only after approval.
7. Open the live site, connect the Question Vault, and select **Sync production mirror**.
8. Select **Sync performance** to archive any new completed tests and update cumulative per-question metrics.
9. Refresh the AI-ready correlated export.

## Recovery guarantees

Question content and correlated performance are recoverable from multiple independent locations:

- Git history on `main`
- The `question-bank-staging` branch during active work
- Drive Production mirror
- Drive append-only question-bank History versions
- Drive archived drafts
- Drive append-only full completed-test files and their index
- Drive cumulative per-question performance keyed by stable question ID
- Local and hidden Drive progress backups for current user response data

The vault is a safety and collaboration layer. It does not replace Git review, browser testing, or the repository validator.
