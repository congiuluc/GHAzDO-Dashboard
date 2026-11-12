# Security

## Permissions

- **Browser-only collection** uses the signed-in user's token, so it never sees more than that user can read.
- **The shared backend** uses a managed identity. Every API call also carries the user's delegated token, and the backend uses it to check what that user can read before returning data.
- **Extension scopes:** `vso.advsec`, `vso.project`, `vso.code`, `vso.graph`, `vso.extension.data_write`.

## Data minimization

Stored data is limited to an allowlist of alert metadata. Secret values, code snippets and file paths are never stored, and text fields are sanitized before display.

## Backend hardening

- Extension app tokens are validated (HS256, signed with the extension secret).
- CORS is restricted to the configured origins.
- Paging cursors are HMAC-signed.
- Storage has shared key access disabled; every Azure call uses the managed identity.
- The backend URL the extension calls must match an allowlist compiled into the extension, so a tampered setting cannot send tokens to another host.

## Known limitation

In browser-only mode the admin-only **Settings** tab is hidden through a client-side Project Collection Administrators check. Shared settings live in extension data, which any user of the extension can technically write. Treat them as configuration, not as a security boundary.
