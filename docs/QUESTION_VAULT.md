# Google Drive Question Bank Vault

## Why it is separate from progress backup

The existing hidden `appDataFolder` is optimized for private application state but is not visible in ordinary Google Drive. The Question Bank Vault uses the limited `drive.file` scope to create a dedicated visible folder containing only files created by this app.

The app does not request broad Drive access and cannot browse unrelated files.

## Folder layout

```text
Psychiatry Board Question Vault/
  Production/
    vault-manifest.json
    question-bank-master.json
    question-performance.json
    question-bank-correlated-latest.json
    completed-tests-index.json
  Drafts/
    question-bank-draft.json
  History/
    question-bank-master-<timestamp>-<hash>.json
    question-bank-draft-archive-<timestamp>.json
  Test History/
    test-<completion-time>-<set-id>.json
  Change Sets/
    change-set-<timestamp>.json
    draft-validation-<timestamp>.json
```

## File purposes

- `question-bank-master.json` — complete production question and answer content mirrored from GitHub `main`.
- `question-performance.json` — cumulative per-question status, attempt counts, accuracy, and timing keyed by stable question ID. It records which completed test IDs have already been incorporated so the same attempt is never counted twice.
- `question-bank-correlated-latest.json` — an intentionally refreshed AI-ready export containing question content plus its cumulative performance object.
- `completed-tests-index.json` — an index of all full completed-test files archived by the vault.
- `Test History/test-*.json` — one full preserved record per completed test, including question IDs, responses, timing, score, and category data.
- `question-bank-draft.json` — editable proposed question-bank changes. It never affects the live site automatically.
- `vault-manifest.json` — project identity, hashes, source build, staging branch, test-history counts, and safety rules.
- History and Change Set files are append-only recovery and review records from the app's perspective.

## Sync behavior

- Question content uploads only on initial vault creation or an explicit **Sync production mirror** action.
- Existing production is archived before a changed mirror is written.
- Each newly completed browser test is copied into `Test History` once, using its stable set ID to prevent duplicates.
- Cumulative per-question performance survives deletion of a test from the dashboard and survives the browser's rolling 50-test display limit after that test has been synchronized to the vault.
- Performance is compact and may synchronize after study milestones while connected.
- The large correlated export updates only when the user explicitly requests it.
- No question-history or completed-test-history file is automatically deleted by the app.

## Security boundary

The visible vault requires `drive.file`. This scope permits access only to files the application creates or files the user explicitly opens or shares with the application. The hidden progress backup continues using `drive.appdata`.

OAuth access tokens remain in page memory and are not committed to GitHub or written to local storage.

## Source-of-truth boundary

The visible vault is designed for preservation, analysis, and draft collaboration. The public study site continues to load the reviewed `data.js` from GitHub `main`. A Drive draft or Production mirror cannot silently modify the live question bank. Question-content changes must be applied and reviewed in `question-bank-staging`, validated, and then deliberately merged to `main`.
