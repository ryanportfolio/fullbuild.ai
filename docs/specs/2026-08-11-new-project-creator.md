# New Project Creator

## Outcome

Harness Firmware offers one understandable project-creation flow in three places:

1. The product page demonstrates the flow
2. `/harness-firmware/new` creates a repository through GitHub when the Fullbuild GitHub App is configured
3. The Harness repository ships a local browser UI that creates and clones projects on Windows and macOS

Every visible title says **New Project**. Claude Code is a supported runtime, not the product name.

## Shared flow

The interfaces use the same four states:

1. **Project**: name, destination or GitHub owner, visibility
2. **Repository**: create from `ryanportfolio/Harness-Firmware`
3. **Harness**: preserve the memory system, selected skills, Claude Code files, and Codex adapters while removing template-maintainer files
4. **Ready**: open the repository, add the project's framework, scaffold, or first files, then run the linked **init-project** skill

The flow never suggests that repositories share memories. Each generated repository receives its own memory system.

## Hosted boundary

The hosted page cannot read a local `gh` login or write to a local folder. It creates a GitHub repository only.

GitHub App configuration lives in server environment variables:

- `GITHUB_APP_ID`
- `GITHUB_APP_SLUG`
- `GITHUB_APP_CLIENT_ID`
- `GITHUB_APP_CLIENT_SECRET`
- `HARNESS_SESSION_SECRET`

Browser JavaScript receives no GitHub token. User and refresh tokens are encrypted inside Secure, HttpOnly cookies. Repository creation uses a GitHub App user access token so authority is always limited to the permissions shared by the app and the person creating the repository.

Skill choices are allowlisted server-side. Disabled canonical skills remain present in the repository for safe updates and later recovery, `.claude/settings.json` marks them `"off"`, and their generated Codex adapter entry files are removed so both runtimes honor the initial selection. The hosted creator needs Contents read and write permission to make that one atomic post-generation configuration commit. If the commit fails after GitHub has created the repository, the UI returns the repository URL and states that all skills remain enabled rather than inviting a duplicate creation retry.

When configuration is absent, the hosted page remains useful and sends the visitor to the official GitHub template flow.

## Local boundary

The local UI binds to `127.0.0.1` on an ephemeral port and requires a random launch token on every API request. It opens the system browser and invokes the existing platform generator:

- Windows: `new-claude-project.ps1`
- macOS and Linux: `new-claude-project.sh`

The existing generator remains authoritative. The UI does not duplicate repository creation or cleanup rules.

Windows keeps the old launcher filename as a compatibility forwarder. New entry points are `New-Project.cmd` and `New-Project.command`.

## Visual contract

The product demo and hosted creator use the Harness phosphor contract:

- Green means written to the repository
- Blue means live session state
- Bone service paper and black instrument glass are the only grounds
- Depth comes from grids, hatch, linework, and dither
- No gradients, blur, glow, glassmorphism, or copied Greptile assets
- Motion verbs remain CHARGE, DECAY, ROUTE, and RETAIN
- Reduced motion resolves to a complete ready state
- Headings and display text have no ending periods

The local UI uses the same information hierarchy but system fonts, so it has no webfont dependency.

## Verification

- Existing Harness Firmware tests remain green
- Hosted auth helpers and fallback routes are covered without secrets
- Local server tests prove token rejection, status, validation, and streamed completion with an injected generator
- PowerShell generator contract tests remain green
- CI adds a macOS job for shell syntax and local launcher smoke tests
- Headless Playwright captures product demo and hosted creator at 1440, 820, 390, and 320 pixels plus reduced-motion and no-JS states
- A real GitHub App install and macOS creation run remain release gates when credentials and macOS CI are available
