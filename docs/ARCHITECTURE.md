# Psychiatry Board Practice Architecture

## Goals

This repository is a static, browser-first study application that must remain deployable on GitHub Pages, preserve existing user progress, and support future modules without sharing credentials or mixing project data.

## Module boundaries

- `boards-config.js` — immutable project identity, storage manifest, limits, feature configuration, and public Google OAuth client IDs/scopes.
- `boards-store.js` — shared persistence and backup-envelope layer. It normalizes legacy backups, emits storage events, and restricts restores to recognized project keys.
- `boards-core.js` — question-bank domain logic and active-set creation.
- `boards-dashboard.js` — dashboard rendering and basic practice-set controls.
- `boards-builder.js` — subject and question-pool selection.
- `boards-exam-v2.js` — exam shell and timer integration around the original question renderer.
- `boards-nav-status.js` — answered/correct/incorrect navigator state only.
- `boards-analytics.js` — completed-test records, metrics, timing, review, and saved-test deletion.
- `boards-maintenance.js` — selective reset, full reset, local recovery backups, restore, and export.
- `boards-safety.js` — cross-module destructive-action guardrails, including retention of at least one local recovery point and cloud milestones for legacy actions.
- `boards-drive-backup.js` — hidden Google Drive app-data synchronization and cloud recovery history.
- `boards-question-bank-model.js` — canonical question serialization, stable hashing, cumulative performance, package validation, and question-bank diffs.
- `boards-visible-drive-client.js` — limited `drive.file` OAuth and visible Drive file/folder operations for app-created vault content.
- `boards-question-vault.js` — visible Drive Production/Draft/History workflow, append-only completed-test archival, cumulative per-question metrics, and AI-ready correlated exports.
- `boards-init.js` — startup validation and explicit application initialization.

## Storage contract

Existing browser keys remain unchanged for backward compatibility. New modules must obtain keys from `BoardsConfig.storage.keys`; they must not invent unregistered local-storage keys.

Drive and local recovery snapshots use a versioned envelope containing `projectId`, `schemaVersion`, `kind`, `createdAt`, `reason`, `hash`, and `data`.

Only keys listed in `BoardsConfig.storage.backupKeys` are eligible for progress backup or restore. This prevents a future project on the same domain from being swept into this project’s backup.

At least one local recovery point is retained after destructive operations. Hidden Drive current-state and historical files have separate purposes: the current file is efficiently overwritten, while milestone snapshots are retained on a rolling basis.

## Question content and performance governance

- GitHub `main` remains the live runtime source for question content.
- GitHub `question-bank-staging` is the required environment for proposed question, answer, and explanation changes.
- The visible Drive `Production` folder mirrors reviewed `main`; it is not loaded by the live app.
- Drive `Drafts` is an editable data workspace only and never auto-publishes.
- Drive `History` preserves prior Production and Draft packages before replacement.
- Drive `Test History` preserves one full file per completed test and an index keyed by stable set ID.
- Cumulative per-question performance stores processed test IDs so dashboard deletion or local history limits cannot subtract an already-preserved attempt.
- Stable question IDs are the contract joining content, progress, saved tests, cumulative analytics, and completed-test archives.
- The AI-ready correlated export is deliberately refreshed rather than uploaded after every answer.

## Expansion rules

A future project should have its own `projectId`, storage prefix, backup manifest, Drive filenames, and OAuth client only if it needs a different authorization boundary. Shared utilities may be extracted, but project data must remain namespaced.

New features should communicate through `BoardsStore` events and `ksboards:milestone` rather than adding periodic polling. A polling loop is acceptable only for inherently time-based behavior such as the exam timer or per-question elapsed time.

Each module should have one primary responsibility. Cross-module safety requirements belong in an explicit guardrail module rather than hidden click interception or duplicated storage logic.

## Validation and release

The repository validation script checks JavaScript syntax, local asset references, module order, question-bank integrity, project isolation, secret-like material, Google Drive scope restrictions, the visible-vault structure, and the presence of the question-bank schema and staging configuration. GitHub Actions runs this validation on pushes to `main` and on pull requests.

Large future changes should be developed on a branch, reviewed through a pull request, validated automatically, and smoke-tested in a browser before merge. Question-content changes specifically use `question-bank-staging` and the question-bank change checklist.

## Compatibility

The storage and backup layer accepts the earlier raw-string snapshot format and converts it to the current structured format during read or restore. Existing local progress, saved tests, and first-generation hidden Drive backups remain usable.
