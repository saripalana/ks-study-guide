# Development Workflow

1. Create a feature branch rather than editing `main` for substantial changes.
2. Run `node scripts/validate.mjs` before opening a pull request.
3. Confirm the GitHub Actions validation workflow passes.
4. Test a new practice set, answer navigation, submission, analytics, deletion, reset/restore, and Drive conflict handling.
5. Merge only after review.

## Engineering rules

- Use `BoardsConfig` for constants and registered storage keys.
- Use `BoardsStore` for parent-page persistence.
- Preserve backward compatibility or add an explicit migration.
- Never commit secrets.
- Avoid broad Google OAuth scopes.
- Avoid new global polling loops.
- Add a milestone event for actions that deserve a cloud history snapshot.
- Keep destructive actions recoverable.
- Keep modules focused on one responsibility.

## Release checks

- No duplicate question IDs.
- All HTML-referenced local assets exist.
- All JavaScript files pass syntax validation.
- No client secret, refresh token, private key, or broad Drive scope is present.
- Existing local and Drive backups can still be normalized and restored.
