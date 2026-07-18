# Question Bank Governance and Editing Workflow

## Purpose

Every live bank must remain recoverable and reviewable while questions, answer choices, correct answers, explanations, categories, tags, or learning objectives are revised. No Drive Draft, AI Request, AI Proposal, or Export can directly alter a live bank.

The platform is for personal ABPN psychiatry study and enforces a 5,000-card total ceiling.

## Environments

### 1. GitHub `main` — live production

- Each published bank loads reviewed source from `main`.
- Changes reach `main` only after validation and review.
- Visible Drive Production folders are mirrors and backups, not runtime sources.

### 2. Git engineering branches — proposed code and content

- Ordinary question edits use `question-bank-staging` or another documented non-production branch.
- Structural changes use a dedicated engineering branch.
- Branches must be based on current `main` before work begins.
- A diff and validation result must be reviewed before merge.
- Live bank content must not be edited directly on `main` for ordinary work.

### 3. Drive `Banks/<bank-id>/Drafts` — editable bank workspace

- `question-bank-draft.json` is the AI- and human-editable working copy for one bank.
- Creating or refreshing a draft archives the prior draft first.
- Draft validation records are stored in that bank's `Change Sets` folder.
- A Drive Draft never auto-publishes.

### 4. Drive `Banks/<bank-id>/History` — append-only content recovery

- The prior Production package is archived before a changed mirror is written.
- Earlier drafts are archived before replacement.
- The application exposes no History deletion control.

### 5. Drive `Banks/<bank-id>/Test History` — append-only performance evidence

- Every synchronized completed test is archived as a separate JSON record.
- The completed-test index prevents duplicate archival of a stable set ID.
- Cumulative metrics retain synchronized attempts even if an older test is later deleted from the dashboard or falls outside the browser's rolling list.
- The application exposes no Test History deletion control.

### 6. Drive `AI Workspace` — requests, proposals, and exports

- Requests describe desired analysis or content work.
- Proposals contain additions, revisions, or retirements against a known base bank hash.
- Exports provide question content correlated with timing, categories, distractor selections, and performance.
- Nothing in the AI Workspace publishes automatically.

## Stable identity

Every bank has a permanent `bankId`. Every question has a permanent ID within that bank. The globally stable identity is:

```text
bankId::questionId
```

Editing content or metadata must not change that composite identity. New questions receive new IDs. Retired IDs must never be reused because progress, timing, analytics, saved tests, cumulative performance, completed-test history, drafts, and AI proposals are keyed to them.

## Required validation

A draft or code change must pass all relevant checks before production:

- The bank ID is valid and unchanged.
- Every question has a unique nonempty ID within its bank.
- Composite identities are unique.
- Chapter and question numbers are valid.
- Question text is present.
- At least two answer choices exist.
- Choice letters and choices have equal lengths.
- The correct answer letter exists among the choices.
- Categories and tags use stable machine-readable IDs when introduced.
- The full question source remains parseable.
- Additions, changes, and retirements are explicitly reported.
- Any retirement receives deliberate review because it can orphan historical analytics.
- The platform remains at or below 5,000 total registered cards.
- Google Drive permissions remain limited to `drive.appdata` and `drive.file`.

## Standard change process

1. Identify the target bank and current Production hash.
2. Refresh that bank's AI context when performance analysis is needed.
3. Record the requested work in an AI Request or directly in the conversation.
4. Create or refresh the bank's Drive Draft.
5. Prepare proposed changes in the Draft and/or a non-production Git branch.
6. Validate the Draft and inspect additions, changes, retirements, and warnings.
7. Review the Git diff and repository validation result.
8. Merge to `main` only after approval.
9. Open the live bank and verify Test and Tutor behavior.
10. Connect the Question Platform and select **Sync active bank**.
11. Select **Sync performance** to archive new tests and update timing/category metrics.
12. Refresh AI context.

## Adding a bank

A new bank must receive:

- A unique permanent bank ID
- A dedicated question source
- Bank metadata and bootstrap configuration
- Separate browser storage namespace
- Separate hidden Drive backup filenames
- Separate visible Drive Production, Drafts, History, Test History, and Change Sets folders
- A non-production import branch
- Full validation and browser smoke testing

Shared engine code must not be duplicated merely to add a bank.

## Recovery guarantees

Question content and correlated performance are recoverable from independent locations:

- Git history on `main`
- Non-production branches during active work
- Platform bank registry
- Bank-specific Drive Production mirror
- Bank-specific append-only History
- Archived bank Drafts
- Append-only full completed-test files and index
- Cumulative per-question performance keyed by composite ID
- AI context exports
- Local and hidden Drive progress backups

The platform is a safety and collaboration layer. It does not replace Git review, automated validation, or browser testing.
