# Secrets & environment variables

> Env var names, what they key, and where they're consumed. Never store actual secret VALUES here: names and purposes only.

| Env var | Keys what | Consumed in |
|---|---|---|
| `RESEND_API_KEY` | Resend REST auth for T-01 outbound delivery. Unset = route logs correspondence only, still stamps TRANSMITTED | `src/app/api/transmit/route.ts` |
| `TRANSMIT_FROM` | Optional sender override, default `T-01 Dispatch <dispatch@fullbuild.ai>` (domain must be verified in Resend) | `src/app/api/transmit/route.ts` |
| `TRANSMIT_TO` | Optional recipient override, default `hi@fullbuild.ai` | `src/app/api/transmit/route.ts` |
| `GITHUB_APP_ID` | Numeric ID used to filter Harness Firmware installations | `src/lib/harness-github.ts` |
| `GITHUB_APP_SLUG` | Public GitHub App slug used by the first-install redirect | `src/app/api/harness/github/callback/route.ts` |
| `GITHUB_APP_CLIENT_ID` | OAuth client identifier for the hosted project creator | `src/app/api/harness/github/connect/route.ts`, `src/lib/harness-github.ts` |
| `GITHUB_APP_CLIENT_SECRET` | Server-only OAuth code and refresh-token exchange secret | `src/lib/harness-github.ts` |
| `HARNESS_SESSION_SECRET` | Signs OAuth state and encrypts short-lived token bridges and creator sessions | `src/lib/harness-github.ts`, `src/app/api/harness/github/**` |
| `ANTHROPIC_API_KEY` | Keys the Debrief race analyst on the layline page. Unset = the Debrief section is not rendered and the analyst route answers 503 | `src/app/api/layline/analyst/route.ts`, `src/app/prototype/layline/page.tsx` |
| `LAYLINE_ANALYST_MOCK` | `1` makes the analyst route stream a deterministic answer computed from the real tools, no network. Dev and tests only, never set in prod | `src/app/api/layline/analyst/route.ts`, `src/app/prototype/layline/page.tsx` |
