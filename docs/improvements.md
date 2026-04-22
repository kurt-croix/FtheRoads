# Lambda Email Security Improvements

The Function URL uses `NONE` auth, meaning anyone can hit the endpoint. The Origin header check only stops browsers (CORS), not scripts. An attacker could spoof the Origin and burn through the Resend quota (100/day free tier).

## Priority Order

### 1. Rate limiting (IP-based throttling in Lambda)

Track request IPs in-memory or via DynamoDB. Limit to ~5 emails per IP per hour. Reject with 429 when exceeded.

- In-memory: simpler, resets on cold start (acceptable for this scale)
- DynamoDB: persistent across invocations, but adds cost and complexity

### 2. CAPTCHA (Cloudflare Turnstile)

Add Cloudflare Turnstile to the ReportForm. Verify the token server-side in the Lambda before sending email. Turnstile is free, privacy-focused, and invisible to most users.

- Frontend: wrap submit in Turnstile challenge
- Lambda: verify token via `https://challenges.cloudflare.com/turnstile/v0/siteverify`

### 3. Switch to AWS_IAM auth on Function URL

Use Cognito or Amplify to issue temporary AWS credentials to the frontend. Sign requests with SigV4. The Function URL validates the signature at the infrastructure level — no unauthenticated access possible.

- Adds complexity (Cognito user pool, identity pool, SDK integration)
- Best security posture but most work
- Consider after the app has real users
