# FtheRoads — Agent Instructions

## Nostr Protocol

This project uses Nostr for data storage and identity. Reports are kind 1031 events.

### Key Hooks

- `useNostr` — Returns `{ nostr }` with `.query()` and `.event()` methods
- `useNostrPublish` — Publish events (auto-adds client tag)
- `useCurrentUser` — Get logged-in user (required before publishing)
- `useAuthor` — Fetch profile metadata by pubkey

### NIP-19 Routing

NIP-19 identifiers are handled at root level (`/:nip19` in AppRouter). Supported: `npub1`, `nprofile1`, `note1`, `nevent1`, `naddr1`.

### Query Best Practices

- Combine multiple kinds in a single query
- Use relay-level filtering (`#t` tags) over client-side filtering
- Filter by `authors` for any privileged/trusted content

### Event Design

- **Tags** = queryable metadata (relays index these)
- **Content** = human-readable text, not structured JSON
- Use single-letter tags (`t`) for categorization (relay-indexed)
- Always add NIP-31 "alt" tag for custom kinds

## UI Components

Built with shadcn/ui (Radix UI + Tailwind). Components in `src/components/ui/`. Use `cn()` for class merging. Follow existing patterns for variants.

### Design Standards

- Production-ready, no placeholders
- Mobile-first responsive design
- Skeleton loading for structured content, spinners for buttons
- WCAG 2.1 AA accessible (4.5:1 contrast, keyboard nav, ARIA labels)

## Validation

After any code change, run `npm run test` (TypeScript + ESLint + Vitest + build). Code must type-check and build without errors.
