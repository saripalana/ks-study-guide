## Summary

Describe what changed and why.

## Target bank

- Bank ID:
- Base production hash, when applicable:
- Existing bank or new bank:

## Change type

- [ ] Question text, answer choice, correct answer, or explanation
- [ ] New question(s)
- [ ] Question retirement/removal
- [ ] New question bank or bank metadata
- [ ] Categories, tags, learning objectives, or difficulty metadata
- [ ] Practice interface, timing, analytics, or study intelligence
- [ ] Storage, backup, Drive, AI workspace, or security
- [ ] Documentation only

## Question-bank safety checklist

Complete this section whenever a question source, bank registry, schema, or Question Platform module changes.

- [ ] Work was prepared on `question-bank-staging` or another non-production branch.
- [ ] The correct stable bank ID was used.
- [ ] Existing question IDs and `bankId::questionId` composite IDs were preserved.
- [ ] New questions use new IDs that have never been used in that bank.
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
- [ ] Question timing and timing-band data were checked when affected.
- [ ] Saved-test deletion was checked when affected.
- [ ] Google Drive current backup was checked when affected.
- [ ] Platform Registry, bank Production, Drafts, History, Test History, Change Sets, and AI Workspace were checked when affected.
- [ ] Another registered bank's storage and Drive folders were not altered.

## Review notes

List known limitations, migration considerations, capacity effects, or manual follow-up steps.
