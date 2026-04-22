# Web Developer Code Review - FtheRoads.com

## Critical Issues

### 1. TypeScript Safety — `src/components/ReportMap.tsx:10`
- `declare const L: any;` bypasses all type safety for Leaflet
- Multiple `any` types at lines 29-31, 68, 90
- `townshipData as any` at line 68
- **Fix:** Install `@types/leaflet`, create proper interfaces

### 2. Missing Error Boundaries
- `src/main.tsx` — only top-level ErrorBoundary
- ReportForm and ReportMap should have their own boundaries
- Map init fails silently if Leaflet CDN doesn't load

### 3. Performance
- `src/pages/Index.tsx:98` — full re-render on report data changes
- `src/components/ReportCard.tsx:194` — no memoization on click handler
- `src/hooks/useRoadReports.ts:98` — 30s refetch interval aggressive for mobile

### 4. Accessibility
- `src/components/ReportMap.tsx:254` — map hint lacks ARIA attributes
- `src/pages/Index.tsx:256` — map hint not keyboard-accessible
- Missing labels for map controls and search input

## Suggested Improvements

### Component Architecture
- `src/pages/Index.tsx` (237 lines) — extract ReportStats, RecentReports, LocationSelector
- `src/components/ReportForm.tsx` (475 lines) — split into ImageUpload, ContactInfo, HazardDetails

### State Management
- `src/contexts/AppContext.ts` — lacks validation for config updates
- DMContext could benefit from Zustand/Redux Toolkit
- `src/components/ReportMap.tsx` — selected location state should lift to Index

### Error Handling
- `src/hooks/useNostrMail.ts` — Lambda email failures handled, but useNWC doesn't follow same pattern
- `src/components/ErrorBoundary.tsx` — needs more granular error categories
- Add retry logic for failed Nostr queries

### Code Quality
- DRY violations: similar form validation in multiple components
- Inconsistent patterns: some use interfaces, others inline types
- Magic numbers: 10,000ms timeouts should be named constants

## Nice-to-Haves

1. React.memo on ReportCard
2. Virtual scrolling for report lists
3. Loading skeletons for all async ops
4. Optimistic updates on report submission
5. Empty states for filtered lists
6. Proper Leaflet type definitions
7. Unit tests beyond ErrorBoundary.test.tsx — need coverage for:
   - Report validation logic (useRoadReports)
   - Map click handlers
   - Form submission flows
8. Integration tests for report creation workflow
