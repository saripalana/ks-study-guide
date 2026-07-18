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
  Drafts/
    question-bank-draft.json
  History/
    question-bank-master-<timestamp>-<hash>.json
    question-bank-draft-archive-<timestamp>.json
  Change Sets/
    change-set-<timestamp>.json
    draft-validation-<timestamp>.json
```

## File purposes

- `question-bank-master.json` — complete production question and answer content mirrored from GitHub `main`.
- `question-performance.json` — compact per-question status and aggregate performance keyed by stable question ID.
- `question-bank-correlated-latest.json` — an intentionally refreshed AI-ready export containing question content plus its performance object.
- `question-bank-draft.json` — editable proposed question-bank changes. It never affects the live site automatically.
- `vault-manifest.json` — project identity, hashes, source build, staging branch, and safety rules.
- History and Change Set files are append-only recovery and review records.

## Sync behavior

- Question content uploads only on initial vault creation or an explicit **Sync production mirror** action.
- Existing production is archived before a changed mirror is written.
- Performance is compact and may synchronize after study milestones while connected.
- The large correlated export updates only when the user explicitly requests it.
- No question-history file is automatically deleted.

## Security boundary

The visible vault requires `drive.file`. This scope permits access only to files the application creates or files the user explicitly opens or shares with the application. The hidden progress backup continues using `drive.appdata`.

OAuth access tokens remain in page memory and are not committed to GitHub or written to local storage.
