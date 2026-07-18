# Multi-Bank ABPN Study Platform

## Purpose

This repository is a personal, browser-first ABPN psychiatry study platform. It is designed to support approximately 2,500 total cards and enforces a 5,000-card platform ceiling without requiring a paid server, database, or AI API.

The current K&S question bank is the first registered bank. Future banks share the exam, analytics, backup, validation, and Drive infrastructure while retaining independent content, progress, performance, drafts, history, and identifiers.

## Capacity and efficiency

- Platform ceiling: 5,000 total registered cards.
- Current expected scale: fewer than 2,500 total cards.
- Only the active bank is loaded into the exam engine.
- Browser progress keys are namespaced per bank.
- Hidden Drive progress files are namespaced per bank.
- Visible Drive content and performance are stored under a separate folder for each bank.
- Compact per-question performance is updated incrementally.
- Complete tests are stored as separate append-only files rather than embedded repeatedly in every export.
- Recent attempt samples are capped per question; complete attempts remain recoverable from Test History.

## Bank identity

Every bank requires a stable lowercase `bankId`, for example:

```text
ks-psychiatry-core
psychopharmacology-intensive
neurology-for-psychiatry
custom-missed-concepts
```

Every question has a stable ID inside its bank. The globally stable identity is:

```text
bankId::questionId
```

Question text, choices, correct answers, explanations, categories, and tags may change without changing this composite identity. Retired IDs must never be reused.

## Runtime model

`BoardsConfig.platform.activeBank` describes the bank loaded by the page. The current bank uses legacy browser keys so existing progress remains unchanged. Future banks receive namespaced keys such as:

```text
abpnBank:<bankId>:app:v1
abpnBank:<bankId>:tests:v1
abpnBank:<bankId>:question-history:v1
```

A future bank page supplies `window.BOARDS_BANK_BOOTSTRAP` before `boards-config.js`, loads that bank's question source, and then loads the shared modules. This keeps banks independent while avoiding duplicate exam and analytics code.

## Google Drive structure

```text
Psychiatry Board Question Vault/
├── Registry/
│   └── bank-registry.json
├── Banks/
│   ├── ks-psychiatry-core/
│   │   ├── Production/
│   │   ├── Drafts/
│   │   ├── History/
│   │   ├── Test History/
│   │   └── Change Sets/
│   └── <future-bank-id>/
│       └── ...same protected structure...
└── AI Workspace/
    ├── Requests/
    ├── Proposals/
    └── Exports/
```

The registry records bank identity, source, question count, content hash, staging branch, and Drive path. Total registered cards may not exceed 5,000.

## Performance model

Each question's compact performance record includes:

- Correct, incorrect, omitted, and total attempt counts
- Accuracy percentage
- Total, average, fastest, and slowest response time
- Response-time bands: under 30, 30–59, 60–89, 90–119, and 120+ seconds
- Latest status and flag state
- Distractor/letter selection counts
- A capped list of recent attempts
- Stable bank and composite identity

Category-level summaries aggregate attempts, accuracy, omissions, average time, and timing bands. Categories may represent chapters, subjects, domains, tags, learning objectives, or future custom classifications.

Full completed tests remain append-only in each bank's Test History folder so compact summaries can be rebuilt or audited.

## AI-assisted workflow

The website does not call a paid AI API. AI work is initiated by the user in ChatGPT.

When the user asks ChatGPT to analyze performance or modify questions:

1. Refresh the bank's AI context export.
2. ChatGPT reads the visible Drive export through the connected Google Drive source.
3. The requested work is represented as a request and proposal, not a production edit.
4. Proposed additions or changes use the bank's current production hash as their base.
5. Existing composite IDs are preserved; new questions receive new IDs.
6. The proposal is applied to a Drive Draft and/or a GitHub engineering branch.
7. Validation reports additions, changes, retirements, and errors.
8. Only reviewed changes are merged into GitHub `main`.
9. The Drive Production mirror is refreshed after the live bank changes.

The AI workspace includes machine-readable request and proposal templates. Nothing in Requests, Proposals, Drafts, or Exports automatically publishes.

## Adding a new bank

A new bank requires:

1. A unique bank ID and metadata definition.
2. A separate question source file or folder.
3. A bank-specific entry page or bootstrap configuration.
4. Stable unique question IDs within that bank.
5. Validation of choices, correct letters, explanations, and capacity.
6. A non-production Git branch for the first import.
7. Browser smoke testing before publication.
8. Question Platform connection to create the bank's Drive namespace and registry entry.

Shared engine files should not be copied into the bank folder. Improvements to the exam engine or analytics should remain shared unless a bank has a documented exceptional requirement.

## Safety rules

- No Drive draft or AI proposal may become production automatically.
- No normal application control deletes Drive History or Test History.
- Removing questions requires explicit review because historical analytics remain keyed to their IDs.
- Existing bank IDs and question IDs are immutable.
- A bank cannot read another bank's browser progress keys.
- Only `drive.appdata` and `drive.file` Google scopes are allowed.
- No patient information, clinical notes, passwords, tokens, or credentials belong in any bank.

## Release process

Structural changes use a dedicated engineering branch and pull request. Question-content work uses `question-bank-staging` or another reviewed non-production branch. The repository validator checks syntax, asset order, capacity, stable identities, Drive permissions, AI workspace safeguards, and question integrity before merge.
