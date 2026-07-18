## Summary

Describe what changed and why.

## Target bank and collection

- Bank ID:
- Collection: `original-bank` / `ai-created` / `user-created` / `ai-revisions` / new bank
- Base production hash, when applicable:
- Existing bank or new bank:

## Change type

- [ ] Original question text, choices, correct answer, or explanation via reversible overlay
- [ ] New AI-created supplemental card(s)
- [ ] New user-created supplemental card(s)
- [ ] Question retirement/removal
- [ ] New question bank or bank metadata
- [ ] Categories, tags, learning objectives, or difficulty metadata
- [ ] Practice interface, exact timing, analytics, or study intelligence
- [ ] Storage, backup, Drive, AI workspace, or security
- [ ] Documentation only

## Content provenance checklist

- [ ] `data.js` remains the immutable imported source and was not used to disguise AI text as original material.
- [ ] Each supplemental card is stored as its own JSON file in the correct collection folder.
- [ ] AI-created cards declare `originalBankMaterial: false` and display as personal supplements.
- [ ] Revisions to original cards use an `ai-revisions` overlay rather than overwriting the original source.
- [ ] Every revision declares its target question, base content hash, changed fields, rationale, and provenance.
- [ ] The original snapshot remains recoverable and visible for AI-revised cards.
- [ ] Stable question IDs were preserved and new IDs have never been used before.
- [ ] `node scripts/build-content.mjs` was run and the generated bundle is current.
- [ ] Source filters correctly separate original unchanged, AI-revised original, AI-created, and user-created cards.

## Question-bank safety checklist

- [ ] Work was prepared on `question-bank-staging` or another non-production branch.
- [ ] The correct stable bank ID was used.
- [ ] Existing `bankId::questionId` composite IDs were preserved.
- [ ] Any retirement/removal is intentional and its effect on saved tests and analytics was reviewed.
- [ ] Choices and choice letters have equal lengths.
- [ ] Every correct answer letter exists among the available choices.
- [ ] Categories, tags, and learning objectives use stable machine-readable identifiers when added.
- [ ] The bank and total platform remain within the 5,000-card ceiling.
- [ ] The Drive Draft, AI proposal, or Change Set was reviewed when applicable.
- [ ] The prior production bank remains recoverable through Git history and bank-specific Drive History.
- [ ] No Drive Draft, AI Request, AI Proposal, or Export is being treated as an automatic production source.

## Data and security checklist

- [ ] No OAuth client secret, access token, refresh token, service-account key, password, patient information, or downloaded credential file is included.
- [ ] Google Drive permissions remain limited to `drive.appdata` and/or `drive.file`.
- [ ] New browser storage keys are registered and bank-namespaced in `BoardsConfig`.
- [ ] Hidden backups and visible vault data remain scoped to the correct bank.
- [ ] Destructive actions create or preserve recovery history.
- [ ] AI context contains study data only and no clinical or patient information.

## Validation

- [ ] `node scripts/validate.mjs` passes.
- [ ] The active-bank dashboard loads after a hard refresh.
- [ ] A short Test-mode set was completed and reviewed.
- [ ] A short Tutor-mode set was completed and reviewed.
- [ ] Per-card active milliseconds, first-response latency, answer changes, and review display were checked when timing changed.
- [ ] Saved-test deletion was checked when affected.
- [ ] Google Drive current backup was checked when affected.
- [ ] Platform Registry, bank Production, Drafts, History, Test History, Change Sets, and AI Workspace were checked when affected.
- [ ] Another registered bank's storage and Drive folders were not altered.

## Review notes

List known limitations, migration considerations, capacity effects, provenance decisions, or manual follow-up steps.
