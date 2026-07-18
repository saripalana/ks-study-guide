# Google Drive Multi-Bank Question Platform

## Why it is separate from progress backup

The hidden `appDataFolder` is optimized for private browser state but is not visible in ordinary Google Drive. The visible Question Platform uses the limited `drive.file` scope to create a dedicated folder containing only files created by this application.

The app does not request broad Drive access and cannot browse unrelated files.

## Folder layout

```text
Psychiatry Board Question Vault/
├── Registry/
│   └── bank-registry.json
├── Banks/
│   └── <bank-id>/
│       ├── Production/
│       │   ├── vault-manifest.json
│       │   ├── question-bank-master.json
│       │   ├── question-performance.json
│       │   ├── question-bank-correlated-latest.json
│       │   └── completed-tests-index.json
│       ├── Drafts/
│       │   └── question-bank-draft.json
│       ├── History/
│       │   ├── question-bank-master-<timestamp>-<hash>.json
│       │   └── question-bank-draft-archive-<timestamp>.json
│       ├── Test History/
│       │   └── test-<completion-time>-<set-id>.json
│       └── Change Sets/
│           ├── change-set-<timestamp>.json
│           └── draft-validation-<timestamp>.json
└── AI Workspace/
    ├── ai-workspace-manifest.json
    ├── Requests/
    │   └── question-change-request-template.json
    ├── Proposals/
    │   └── question-change-proposal-template.json
    └── Exports/
        └── <bank-id>-ai-context-latest.json
```

## File purposes

- `bank-registry.json` — platform-level catalog of registered banks, source locations, card counts, content hashes, and Drive paths.
- `question-bank-master.json` — complete production question and answer content for one bank, mirrored from GitHub `main`.
- `question-performance.json` — cumulative per-question accuracy, omissions, distractor selections, timing bands, recent attempts, category aggregates, and processed test IDs.
- `question-bank-correlated-latest.json` — bank-local AI-ready export containing question content plus performance.
- `AI Workspace/Exports/<bank-id>-ai-context-latest.json` — the same current context in a predictable cross-bank AI workspace.
- `completed-tests-index.json` — index of all full completed-test files archived for that bank.
- `Test History/test-*.json` — one full preserved record per completed test, including question IDs, responses, timing, score, and categories.
- `question-bank-draft.json` — editable proposed changes for that bank. It never affects the live site automatically.
- `vault-manifest.json` — bank identity, hashes, source build, staging branch, archive counts, and safety rules.
- AI Requests and Proposals — machine-readable collaboration records that never publish automatically.
- History and Change Set files — append-only recovery and review records from the app's perspective.

## Sync behavior

- Only the active bank is synchronized during a study session.
- Question content uploads on initial bank creation or an explicit **Sync active bank** action.
- Existing production is archived before a changed mirror is written.
- Each newly completed browser test is copied into that bank's Test History once, using its stable set ID to prevent duplicates.
- Cumulative performance survives dashboard deletion and the browser's rolling 50-test display limit after synchronization.
- Compact performance may synchronize after study milestones while connected.
- The larger AI context export updates only when explicitly requested.
- No bank History, Test History, AI Request, or AI Proposal file is automatically deleted by the app.

## Legacy migration

If the earlier single-bank vault already created root-level `Production`, `Drafts`, or related folders, the multi-bank platform does not delete them. Current-bank JSON files are copied into `Banks/ks-psychiatry-core/Production` when the new namespace is empty, and a non-destructive migration record is created. Original legacy files remain available as recovery copies.

## Security boundary

The visible platform requires `drive.file`, which permits access only to files the application creates or files explicitly opened or shared with it. The hidden progress backup continues using `drive.appdata`.

OAuth access tokens remain in page memory and are not committed to GitHub or written to local storage.

## Source-of-truth boundary

The visible Drive platform supports preservation, analysis, drafts, and AI collaboration. The public study site continues loading reviewed question content from GitHub `main`. A Drive Production mirror, Draft, AI Request, AI Proposal, or Export cannot silently modify a live bank.

Question-content changes must be prepared in a non-production Git branch, validated, reviewed, and deliberately merged. Existing `bankId::questionId` identities must remain stable.
