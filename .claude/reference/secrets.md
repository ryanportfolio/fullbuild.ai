# Secrets & environment variables

> Env var names, what they key, and where they're consumed. Never store actual secret VALUES here: names and purposes only.

| Env var | Keys what | Consumed in |
|---|---|---|
| `RESEND_API_KEY` | Resend REST auth for T-01 outbound delivery. Unset = route logs correspondence only, still stamps TRANSMITTED | `src/app/api/transmit/route.ts` |
| `TRANSMIT_FROM` | Optional sender override, default `T-01 Dispatch <dispatch@fullbuild.ai>` (domain must be verified in Resend) | `src/app/api/transmit/route.ts` |
| `TRANSMIT_TO` | Optional recipient override, default `hi@fullbuild.ai` | `src/app/api/transmit/route.ts` |
