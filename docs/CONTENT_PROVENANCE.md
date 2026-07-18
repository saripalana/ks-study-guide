# Content Provenance and Personal Card Collections

## Purpose

The active study platform combines original imported material with personal supplemental cards without erasing authorship or source history. The imported `data.js` bank is immutable. New cards and revisions are maintained as separate source-controlled files, similar to maintaining individual Anki notes while generating an efficient study deck.

## Source layers

### Original bank material

- Source: `data.js`
- Provenance class: `original-bank`
- The file remains the imported reference source.
- AI-created text is never written into this file as though it were original material.
- Each original card receives runtime provenance metadata without modifying its stored source record.

### AI-created personal supplements

- Source folder: `content/banks/<bank-id>/ai-created/`
- One JSON file per card.
- Provenance class: `ai-created`
- Visible label: `AI-CREATED · PERSONAL SUPPLEMENT`
- Cards must be reviewed and marked `approved` or `active` before entering the generated runtime bundle.

### User-created personal supplements

- Source folder: `content/banks/<bank-id>/user-created/`
- One JSON file per card.
- Provenance class: `user-created`
- Visible label: `USER-CREATED · PERSONAL SUPPLEMENT`

### AI revisions to original material

- Source folder: `content/banks/<bank-id>/ai-revisions/`
- One JSON overlay per revised original card.
- Provenance class: `ai-revised-original`
- The overlay references the original stable question ID and original content hash.
- It declares every changed field.
- It cannot change the stable question ID.
- It cannot overwrite `data.js`.
- The runtime preserves the complete original snapshot alongside the effective reviewed version.
- Visible example: `ORIGINAL BANK · AI-REVISED EXPLANATION`.

## Runtime compilation

Run:

```text
node scripts/build-content.mjs
```

The compiler reads approved personal card files and revision overlays, validates their provenance, and writes:

```text
generated/<bank-id>-content.js
```

The generated file is a browser-optimized bundle and is not edited directly. Pull-request validation runs the compiler in `--check` mode and fails when the generated file is stale.

## Study integration

The practice-set builder can select any combination of:

- Original unchanged
- AI-revised originals
- AI-created supplements
- User-created supplements

This allows a supplemental collection to remain independently measurable while still being mixed into normal ABPN-style practice.

## Backend workflow with ChatGPT

A typical request follows this process:

1. Read the bank-specific AI context export from Google Drive.
2. Analyze question content, performance, distractor patterns, exact timing, and requested constraints.
3. Create a proposal in the Drive AI Workspace.
4. Add each approved new card as its own JSON file under `ai-created/`, or add a field-level overlay under `ai-revisions/`.
5. Rebuild the generated bundle.
6. Run automated validation.
7. Review the Git diff and provenance labels.
8. Merge the staging pull request to make the reviewed content active on GitHub Pages.
9. Synchronize the visible Drive Production mirror and AI context export.

No Drive proposal or draft directly publishes to the live site.

## Exact timing

The board runtime stores active question time in milliseconds and records:

- Total active milliseconds
- First-response latency
- First and final response timestamps
- Answer changes and their elapsed times
- Number of visits to the card

Saved tests are enriched with these fields before Drive synchronization. The UI displays exact time to three decimal places; JSON records preserve millisecond values.

## Removal and retirement

Cards are retired through metadata and reviewed changes, not silently deleted. Stable IDs are never reused. Historical tests continue to reference the same `bankId::questionId` composite identity.
