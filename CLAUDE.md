# FtheRoads — Claude Code Instructions

## What This Is

FtheRoads.com is a road hazard reporting app for Ray County, Missouri. Citizens report potholes, flooding, guardrail damage, etc. Reports are stored as Nostr events (kind 1031) and displayed on a Leaflet map with district overlays. Email notifications are sent to county officials via AWS Lambda + Resend.

## Tech Stack

- **Frontend**: React 19, Vite, TypeScript, TailwindCSS 3, shadcn/ui (Radix primitives)
- **State/Data**: TanStack Query, Nostrify (`@nostrify/react`), nostr-tools
- **Map**: Leaflet with GeoJSON district polygons from `src/data/rayCountyTownships.json`
- **Nostr**: Kind 1031 events for reports, NIP-07 browser extension login, NIP-19 routing
- **Email**: AWS Lambda Function URL proxies to Resend API (replaces unreliable nostr-mail bridge)
- **Infra**: Terraform (S3, CloudFront, Route53, Lambda, ACM), GitHub Actions OIDC deploy

## Architecture

```
User submits report
  → Nostr event (kind 1031) published to public relays (ditto, primal, damus)
  → Frontend calls Lambda Function URL → Resend sends email to district official
  → Map displays reports from relay queries
```

District lookup uses point-in-polygon matching (`src/lib/jurisdiction.ts`) against 9 Ray County township boundaries.

## Key Files

| Path | Purpose |
|------|---------|
| `src/App.tsx` | Provider setup, relay config — read before modifying |
| `src/AppRouter.tsx` | Routes — add new routes here |
| `src/components/ReportForm.tsx` | Report submission form (auto-detects district) |
| `src/components/ReportMap.tsx` | Leaflet map with district overlays |
| `src/hooks/useNostrMail.ts` | Email sending (currently uses nostr-mail bridge, needs Lambda rewrite) |
| `src/lib/constants.ts` | Kind 1031, hazard types, severity, district email map |
| `src/lib/jurisdiction.ts` | Point-in-polygon district lookup |
| `src/data/rayCountyTownships.json` | 9 district GeoJSON polygons |
| `iac/` | Terraform: S3 bucket, CloudFront, Lambda, Route53, ACM cert |
| `iac/lambda/send-email.mjs` | Lambda function (Resend API proxy) |
| `iac/email-lambda.tf` | Lambda + Function URL terraform |
| `iac/resend-dns.tf` | SPF/DKIM/DMARC Route53 records for Resend |
| `.github/workflows/deploy.yml` | Plan on all branches, apply on master. Deploys S3+Pages. |

## Development

```bash
npm run dev          # Start dev server on :8080
npm run dev:local    # Start local strfry relay + dev server
npm run build        # Production build
npm run test         # TypeScript check + ESLint + Vitest + build
```

### Local Relay

`docker-compose.yml` runs a strfry relay on `ws://localhost:7777`. Set `VITE_DEV_RELAYS=ws://localhost:7777` in `.env` to use it instead of public relays. `.env` is gitignored.

### Environment Variables

- `VITE_DEV_RELAYS` — Comma-separated relay URLs (overrides production relays in dev)
- `VITE_BASE_PATH` — Vite base path (default `/`, set to `/FtheRoads/` for GitHub Pages)

## Deployment

**Dual deployment via GitHub Actions:**
1. **S3/CloudFront** (`ftheroads.com`) — builds with `base: "/"`, terraform applies infra, syncs dist to S3
2. **GitHub Pages** (`kurt-croix.github.io/FtheRoads/`) — builds with `base: "/FtheRoads/"`, deploys via `actions/deploy-pages`

Workflow structure: `build` → `terraform-plan` (all branches) → `terraform-apply` + `deploy-pages` (master/main only).

Terraform state is committed to the repo with `[skip ci]`.

## Rules

- **Never delete the S3 bucket.** It has `lifecycle { prevent_destroy = true }` and takes forever to recreate.
- **All work on branches with PRs.** Nothing goes directly to master.
- **Monitor pipelines after pushing.** Check `gh run list` and verify all jobs pass.
- **Don't push if you know it's broken.** Fix issues first.
- **Never suggest dropping email.** The app must send email because it interfaces with government officials.
- **Don't write tests unless asked.** Do run `npm run test` after changes.
- **Never use `any` type.** Proper TypeScript types always.
- **Read files before modifying them.** Especially `App.tsx` and provider files.

## Pending Work

- Rewrite `useNostrMail.ts` to call Lambda Function URL instead of nostr-mail/uid.ovh bridge
- Remove `nostr-mail` npm dependency after rewrite
- Capture Lambda Function URL from Terraform output for frontend use
- Rotate Resend API key (was exposed in chat)
