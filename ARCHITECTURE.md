# Psychiatry Board Practice Architecture

## Goals

This repository is a static, browser-first study application that must remain deployable on GitHub Pages, preserve existing user progress, and support future modules without sharing credentials or mixing project data.

## Module boundaries

- `boards-config.js` — immutable project identity, storage manifest, limits, feature configuration, and the public Google OAuth client ID.
- `boards-store.js` — shared persistence and backup-envelope layer. It normalizes legacy backups, emits storage events, and restricts restores to recognized project keys.
- `boards-core.js` — question-bank domain logic and active-set creation.
- `boards-dashboard.js` — dashboard rendering and basic practice-set controls.
- `boards-builder.js` — subject and question-pool selection.
- `boards-exam-v2.js` — exam shell and timer integration around the original question renderer.
- `boards-nav-status.js` — answered/correct/incorrect navigator state only.
- `boards-analytics.js` — completed-test records, metrics, timing, review, and saved-test deletion.
- `boards-maintenance.js` — selective reset, full reset, local recovery backups, restore, and export.
- `boards-drive-backup.js` — Google Drive app-data synchronization and cloud recovery history.
- `boards-init.js` — startup validation and explicit application initialization.

## Storage contract

Existing browser keys remain unchanged for backward compatibility. New modules must obtain keys from `BoardsConfig.storage.keys`; they must not invent unregistered local-storage keys.

Drive and local recovery snapshots use a versioned envelope containing `projectId`, `schemaVersion`, `kind`, `createdAt`, `reason`, `hash`, and `data`.

Only keys listed in `BoardsConfig.storage.backupKeys` are eligible for backup or restore. This prevents a future project on the same domain from being swept into this project’s backup.

## Expansion rules

A future project should have its own `projectId`, storage prefix, backup manifest, Drive filenames, and OAuth client only if it needs a different authorization boundary. Shared utilities may be extracted, but project data must remain namespaced.

New features should communicate through `BoardsStore` events and `ksboards:milestone` rather than adding periodic polling. A polling loop is acceptable only for inherently time-based behavior such as the exam timer or per-question elapsed time.

## Compatibility

The storage and backup layer accepts the earlier raw-string snapshot format and converts it to the current structured format during read or restore. Existing local progress, saved tests, and first-generation Drive backups remain usable.
