# Security Model

## Public repository

The repository is public. It may contain the Google OAuth browser client ID because that identifier is not a secret and is restricted by Google Cloud to the authorized JavaScript origin. The repository must never contain OAuth client secrets, access or refresh tokens, service-account keys, private keys, Google passwords, or downloaded credential JSON files.

## Google Drive access

The application requests only `https://www.googleapis.com/auth/drive.appdata`. Backup files are written to the hidden per-user `appDataFolder`; the application does not request permission to list or modify normal Drive files.

The Google access token is held only in page memory. **Disconnect session** forgets the temporary token. **Revoke Google access** also asks Google to remove the authorization grant.

## Data classification

Backups contain study progress, question IDs, answer selections, timing, flags, test history, and recovery records. They should not contain patient information, clinical notes, passwords, or other sensitive personal data.

Google Drive storage is private to the authorized account and app, but the backup payload is not additionally encrypted with a user passphrase. Client-side encryption can be added later if the data classification changes.

## Static-hosting limitations

GitHub Pages cannot securely hold server secrets or run a private background worker. Cloud backup therefore works only while the page is open and authorized; expired short-lived access tokens require another user-initiated connection; unattended overnight synchronization is intentionally not implemented; and security headers are more limited than on a dedicated application server.

## Reporting

Do not open a public issue containing credentials, tokens, backup contents, or private account information. Revoke the Google OAuth client and rotate affected credentials immediately if a secret is ever exposed.
