# Security Policy

## Supported Versions
CozyHub actively supports security updates for the current major branch.

| Version | Supported          |
| ------- | ------------------ |
| v0.x.x  | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability within CozyHub, please DO NOT open a public issue. 
Instead, send a direct report to the maintainer via email or through the private vulnerability reporting flow in GitHub.

Include the following details:
- A description of the vulnerability and its potential impact.
- Steps to reproduce the issue.
- Any potential mitigation suggestions.

Maintainers will acknowledge receipt of the report within 48 hours and coordinate a patch rollout.

## Threat Model Baseline
- **Input Validation**: All user-provided payloads (Notion APIs, Webhooks, LLM context) must be explicitly parameterized and escaped to mitigate XSS and injection attacks.
- **Secrets & Credentials**: Development keys (`.env.local`) MUST NEVER be committed into the repository or exposed to client-bundles (`NEXT_PUBLIC_`) unless strictly required. 
- **Session Authz**: All dashboard mutation endpoints (`/api/focus/start`, `/api/focus/complete`) must enforce identity boundaries.
