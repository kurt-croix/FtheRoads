# Security Audit Report - FtheRoads.com

## Critical Severity

### 1. Unrestricted CORS — `worker.ts:22-26`
```
'Access-Control-Allow-Origin': '*'
```
**Risk:** Any domain can hit your API. Enables CSRF and data theft.
**Attack:** Malicious site POSTs to `/api/notify` to send spam.
**Fix:** Origin whitelist — only allow `https://ftheroads.com`.

### 2. Email Address Exposure — `src/lib/constants.ts:42,49-58`
- Hardcoded `DEFAULT_NOTIFICATION_EMAIL` and `DISTRICT_EMAIL_MAP` in client bundle
- **Risk:** Scrapers harvest addresses for spam
- **Fix:** Move mappings to backend/environment

## High Severity

### 3. XSS in Email Content — `worker.ts:192-203`
```typescript
`<p><strong>Title:</strong> ${reportTitle}</p>`
```
- User input (title, location, description) injected into HTML without sanitization
- **Attack:** Malicious HTML/JS executes in email clients
- **Fix:** Sanitize all user input before inserting into email HTML

### 4. Inadequate File Upload Validation — `src/components/ReportForm.tsx:72-93`
- EXIF stripping exists but no file size or type validation
- **Risk:** DoS via large uploads, malicious file execution
- **Fix:** Enforce max size (5MB) and allowed MIME types (jpeg, png, webp)

### 5. No Content Security Policy
- No CSP headers anywhere
- **Risk:** No protection against XSS, clickjacking, data injection
- **Fix:** Add CSP + security headers in Cloudflare Worker:
  - Content-Security-Policy
  - X-Content-Type-Options: nosniff
  - X-Frame-Options: DENY
  - Referrer-Policy: strict-origin-when-cross-origin

## Medium Severity

### 6. Sensitive Data in LocalStorage
- `src/hooks/useNWC.ts` — wallet connection strings stored unencrypted
- **Risk:** XSS can steal payment credentials
- **Fix:** Encrypt sensitive values with Web Crypto API

### 7. No Rate Limiting — `worker.ts`
- `/api/notify` and `/api/lookup-district` wide open
- **Fix:** Add rate limiting in Cloudflare Worker or via Cloudflare rules

### 8. Environment Variable Exposure
- `VITE_LAMBDA_URL` exposed to client
- **Fix:** Only use `VITE_` prefix for non-sensitive values

## Low Severity

### 9. dangerouslySetInnerHTML — `src/components/ui/chart.tsx:79-80`
- Currently safe (hardcoded THEMES) but risky pattern

### 10. No Input Sanitization Before localStorage — `ReportForm.tsx`
- User inputs stored directly

### 11. robots.txt Allows All — `public/robots.txt`
- Consider Disallow: /api/

## Immediate Actions Required

1. Fix CORS — origin whitelisting
2. Add CSP headers
3. Sanitize email content
4. Validate file uploads
5. Move hardcoded emails to backend
