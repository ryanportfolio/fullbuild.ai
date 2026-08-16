# Harness Firmware GitHub App setup

The hosted project creator works in two modes:

- With no app credentials, it sends people to the GitHub template page
- With the app configured, a user authorizes it once and can create later repositories directly from fullbuild.ai

## GitHub App settings

Create a GitHub App with these values:

- Homepage URL: `https://fullbuild.ai/harness-firmware/`
- Callback URL: `https://fullbuild.ai/api/harness/github/callback`
- Setup URL: `https://fullbuild.ai/api/harness/github/callback`
- Redirect on update: enabled
- Repository permissions, Administration: read and write
- Repository permissions, Contents: read and write

The template generation endpoint supports GitHub App user access tokens. The creator always uses that user-scoped token so repository creation cannot exceed the permissions of the person who connected GitHub. Contents write access is used only after generation for one configuration commit: it updates `.claude/settings.json` and removes every file under both the canonical and Codex adapter directories for deselected skills.

## Server environment

Set these only in the server environment:

```text
GITHUB_APP_ID=<numeric app id>
GITHUB_APP_SLUG=<app url slug>
GITHUB_APP_CLIENT_ID=<app client id>
GITHUB_APP_CLIENT_SECRET=<app client secret>
HARNESS_SESSION_SECRET=<at least 32 random bytes>
```

Rotate `HARNESS_SESSION_SECRET` deliberately because rotating it disconnects existing creator sessions.

## Data boundary

The browser JavaScript receives no GitHub token or app credential. User and refresh tokens are encrypted inside Secure, HttpOnly, SameSite cookies and remain unreadable to client code. GitHub user authorization verifies the selected installation, and the user access token preserves GitHub's user-and-app permission intersection for every repository request.

If a user can access more than one installation, the server re-queries GitHub before showing and accepting an account choice; installation lists are never packed into cookies. During a first installation, the encrypted token bridge expires after ten minutes. Creator sessions expire after 30 days, while GitHub's expiring user tokens are refreshed server-side and revoked tokens fail closed.

## Local verification

Without credentials:

```text
GET /api/harness/github/status
```

returns `available: false`, and the creator keeps the direct GitHub template fallback usable.

With credentials, install the app into a test account, connect through `/harness-firmware/new/`, then create a private test repository with at least one optional skill deselected. Confirm the resulting repository was generated from `ryanportfolio/Harness-Firmware`, `.claude/settings.json` contains only the chosen `"off"` overrides, neither `.claude/skills/<name>/` nor `.agents/skills/<name>/` exists for each deselected skill, enabled and required skill directories remain, and no token appears in page source, browser storage, or client network responses.
