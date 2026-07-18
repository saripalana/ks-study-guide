## Summary

Describe what changed and why.

## Change type

- [ ] Question text, answer choice, correct answer, or explanation
- [ ] New question(s)
- [ ] Question retirement/removal
- [ ] Practice interface or analytics
- [ ] Storage, backup, Drive, or security
- [ ] Documentation only

## Question-bank safety checklist

Complete this section whenever `data.js`, the question schema, or a Question Vault module changes.

- [ ] Work was prepared on `question-bank-staging` or another non-production branch.
- [ ] Existing question IDs were preserved.
- [ ] New questions use new IDs that have never been used before.
- [ ] Any removal is intentional and its effect on saved tests/analytics was reviewed.
- [ ] Choices and choice letters have equal lengths.
- [ ] Every correct answer letter exists among the available choices.
- [ ] The Drive draft or change set was reviewed when applicable.
- [ ] The prior production question bank remains recoverable through Git history and Drive History.
- [ ] No Drive Draft file is being treated as an automatic production source.

## Data and security checklist

- [ ] No OAuth client secret, access token, refresh token, service-account key, password, patient information, or downloaded credential file is included.
- [ ] Google Drive permissions remain limited to `drive.appdata` and/or `drive.file`.
- [ ] New browser storage keys are registered in `BoardsConfig`.
- [ ] Backup and restore behavior remains project-scoped.
- [ ] Destructive actions create or preserve recovery history.

## Validation

- [ ] `node scripts/validate.mjs` passes.
- [ ] The dashboard loads after a hard refresh.
- [ ] A short Test-mode set was completed and reviewed.
- [ ] A short Tutor-mode set was completed and reviewed.
- [ ] Saved-test deletion was checked when affected.
- [ ] Google Drive current backup was checked when affected.
- [ ] Question Vault Production, Draft, History, Test History, and correlated export were checked when affected.

## Review notes

List any known limitations, migration considerations, or manual follow-up steps.
