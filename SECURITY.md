# Security Model

## Public repository

The repository is public. It may contain the Google OAuth browser client ID because that identifier is not a secret and is restricted by Google Cloud to the authorized JavaScript origin. The repository must never contain OAuth client secrets, access or refresh tokens, service-account keys, private keys, Google passwords, or downloaded credential JSON files.

## Google Drive access

The application requests `https://www.googleapis.com/auth/drive.appdata` for hidden progress backups. Backup files are written to the hidden per-user `appDataFolder`; the application does not request permission to list or modify normal Drive files through that feature.

The Google access token is held only in page memory. **Disconnect session** forgets the temporary token. **Revoke Google access** also asks Google to remove the authorization grant.

## Visible Question Bank Vault

The optional Question Bank Vault requests `https://www.googleapis.com/auth/drive.file` only after the user selects **Connect Question Vault**. This is separate from the hidden progress backup. The scope permits the app to create and manage its dedicated visible vault files, but not to browse unrelated Drive content.

Question-bank Production is a mirror of reviewed GitHub `main`; Drive Drafts never auto-publish. Production and draft replacements are preceded by append-only Drive history records. The application provides no question-history deletion control.

## Data classification

Backups contain study progress, question IDs, answer selections, timing, flags, test history, recovery records, and—inside the optional visible vault—the question and explanation content. They should not contain patient information, clinical notes, passwords, or other sensitive personal data.

Google Drive storage is private to the authorized account and app, but the backup payload is not additionally encrypted with a user passphrase. Client-side encryption can be added later if the data classification changes.

## Static-hosting limitations

GitHub Pages cannot securely hold server secrets or run a private background worker. Cloud backup therefore works only while the page is open and authorized; expired short-lived access tokens require another user-initiated connection; unattended overnight synchronization is intentionally not implemented; and security headers are more limited than on a dedicated application server.

## Reporting

Do not open a public issue containing credentials, tokens, backup contents, private question drafts, or private account information. Revoke the Google OAuth client and rotate affected credentials immediately if a secret is ever exposed.
