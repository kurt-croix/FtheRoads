# FtheRoads

Road hazard reporting for Ray County, Missouri. Citizens report road issues — potholes, flooding, guardrail damage, obstructions — which are mapped in real time and emailed to the appropriate county road district official.

## How It Works

1. **Report** — Users drop a pin on the map, fill in hazard details, and submit
2. **Store** — Reports are published as Nostr events (kind 1031) to public relays
3. **Notify** — An email is sent to the road district official via AWS Lambda + Resend
4. **Track** — Reports appear on the map with status (open, acknowledged, fixed)

The app auto-detects which of Ray County's 9 road districts a report falls in using point-in-polygon matching against township boundary data.

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, TailwindCSS, shadcn/ui
- **Map**: Leaflet with GeoJSON district overlays
- **Protocol**: Nostr (Nostrify, nostr-tools, NIP-07 login)
- **Email**: AWS Lambda Function URL + Resend API
- **Hosting**: S3 + CloudFront on AWS, GitHub Pages mirror
- **Infra**: Terraform (IaC for all AWS resources)
- **CI/CD**: GitHub Actions with OIDC auth to AWS

## Local Development

```bash
# Install dependencies
npm install

# Start dev server on :8080
npm run dev
```

### With local Nostr relay

```bash
# Start a local strfry relay + dev server
npm run dev:local
```

Create a `.env` file to point at the local relay:
```
VITE_DEV_RELAYS=ws://localhost:7777
```

Without `.env`, the app connects to production Nostr relays (`relay.ditto.pub`, `relay.primal.net`, `relay.damus.io`).

## Project Structure

```
src/
  components/     UI components (ReportForm, ReportMap, shadcn/ui primitives)
  hooks/          Custom React hooks (useNostr, useNostrPublish, useNostrMail)
  pages/          Route pages (Index, ReportList, ReportDetail)
  lib/            Utilities (constants, jurisdiction lookup)
  data/           Static data (district polygons)
  contexts/       React contexts (App, DM, NWC)
iac/
  main.tf         S3, CloudFront, Route53, ACM, Lambda
  email-lambda.tf Lambda function + Function URL
  resend-dns.tf   SPF/DKIM/DMARC records for Resend
  lambda/         Lambda source code (send-email.mjs)
  envs/           Terraform variable files (gitignored)
```

## Deployment

Pushing to `master` triggers the GitHub Actions workflow which:

1. Builds the React app
2. Plans Terraform changes
3. Applies Terraform (master only)
4. Syncs build to S3 + invalidates CloudFront
5. Deploys to GitHub Pages

Infrastructure changes on feature branches run `terraform plan` only — no apply.

## License

Private project.
