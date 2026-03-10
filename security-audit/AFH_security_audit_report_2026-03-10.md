# AFH Security Audit Report (2026-03-10)

Repository: `https://github.com/ItsMalware/afh-cozyhub`
Branch audited: `main`
Audit head at start: `020c894`
Auditor scope: secrets exposure, sensitive data leakage, runtime API exposure, supply chain risk, CI baseline hardening.

## Executive Summary
- No committed secrets were found in git history or working tree by dual scanners (`gitleaks` and `trufflehog`) when scanning repository content.
- High-risk unauthenticated/internal-data API routes existed and webhook verification token echo behavior was present; these were hardened in code.
- `.gitignore` and CI secret scanning were strengthened to reduce reintroduction risk.
- Production dependency audit (`npm audit --omit=dev`) reported no high/critical vulnerabilities.

## Method and Evidence
- Secret scan (history): `gitleaks git --redact` and `trufflehog git file://<repo>`.
- Secret scan (working tree): `gitleaks dir --redact` and `trufflehog filesystem . --exclude-paths security-audit/trufflehog-exclude.txt`.
- Reports:
  - `security-audit/reports/gitleaks-git.json`
  - `security-audit/reports/gitleaks-dir.json`
  - `security-audit/reports/trufflehog-git.jsonl`
  - `security-audit/reports/trufflehog-filesystem.jsonl`
  - `security-audit/reports/npm-audit-prod.json`
  - `security-audit/reports/npm-audit-full.json`

## Findings

### Critical
- None.

### High

#### H-01: Internal and webhook endpoints lacked strong access control and exposed sensitive operational data paths
- Risk: Unauthenticated callers could query/trigger internal routes and retrieve sensitive operational context (chat history, schema metadata, agent runtime data), enabling data leakage and unauthorized workflow execution.
- Evidence (pre-fix on `020c894`):
  - `src/app/api/chat/route.ts` GET/POST had no auth gate.
  - `src/app/api/notion/schema/route.ts` returned schema metadata without auth.
  - `src/app/api/notes-inbox/runs/route.ts`, `.../runs/complete/route.ts`, `.../daily-summary/route.ts`, `src/app/api/agents/config/route.ts`, and `src/app/api/agents/skills/discover/route.ts` had no auth gate.
- Fix applied:
  - Added centralized timing-safe token auth helper: `src/lib/api-auth.ts`.
  - Added `requireInternalToken(...)` checks to sensitive routes.
  - Key proof of fix:
    - `src/lib/api-auth.ts:46`
    - `src/app/api/chat/route.ts:430`
    - `src/app/api/notion/schema/route.ts:54`
    - `src/app/api/notes-inbox/runs/route.ts:6`
    - `src/app/api/notes-inbox/runs/complete/route.ts:6`
    - `src/app/api/notes-inbox/daily-summary/route.ts:6`
    - `src/app/api/agents/config/route.ts:6`
    - `src/app/api/agents/skills/discover/route.ts:6`

#### H-02: Webhook verification token disclosure and verbose webhook payload logging
- Risk: Verification/challenge tokens were echoed/stored and full webhook payloads were logged, increasing chance of token leakage through endpoint probing/log access.
- Evidence (pre-fix on `020c894`):
  - `src/app/api/notion/task-assigned/route.ts` had `lastSeenToken` global and GET endpoint returning token.
  - `src/app/api/notes-inbox/capture/route.ts` had `lastSeenToken` global and GET endpoint returning token.
  - Both handlers logged full incoming JSON.
- Fix applied:
  - Removed token persistence/echo endpoints; GET now returns health status only when authorized.
  - Replaced detailed payload logging with minimal parse warnings.
  - Tightened webhook auth using `NOTION_WEBHOOK_SECRET` fallback chain.
  - Proof of fix:
    - `src/app/api/notion/task-assigned/route.ts:4`
    - `src/app/api/notion/task-assigned/route.ts:16`
    - `src/app/api/notes-inbox/capture/route.ts:6`
    - `src/app/api/notes-inbox/capture/route.ts:19`

### Medium

#### M-01: Secret scanning workflow could silently miss unverified but real secrets
- Risk: CI secret scan used `--only-verified`; real leaked credentials that cannot be actively verified by TruffleHog may pass undetected.
- Evidence:
  - `.github/workflows/secret-scan.yml:35` (before fix) used `--only-verified`.
- Fix applied:
  - Added dedicated `gitleaks` job with full history checkout.
  - Updated TruffleHog args to fail on verified + unknown findings.
  - Proof of fix:
    - `.github/workflows/secret-scan.yml:10`
    - `.github/workflows/secret-scan.yml:35`

#### M-02: Runtime/local sensitive artifact patterns were incompletely ignored
- Risk: New runtime files (nested JSONL/DB/CSV snapshots, key stores, local env manager artifacts) could be accidentally committed later.
- Evidence:
  - Existing `.gitignore` covered only top-level subset (`data/*.jsonl`) and missed multiple common sensitive artifact types.
- Fix applied:
  - Added broader data and key material ignore patterns.
  - Proof of fix:
    - `.gitignore:47`
    - `.gitignore:68`
    - `.gitignore:75`

## Secret Exposure Scan Result
- Scanner 1 (`gitleaks`): no findings in history or working tree.
- Scanner 2 (`trufflehog`): no findings in repository history or repository filesystem scope.
- Findings requiring path + commit SHA: none.

## Sensitive Data Leakage Audit
- Tracked files review found no committed `.env` files, local auth state directories, runtime outbox/log files, or DB dumps.
- Public seed data file exists (`public/data/dashboard-seed.json`) and appears synthetic/demo (no direct credential/PII content).
- `.gitignore` hardened to reduce accidental publication of runtime-sensitive artifacts.

## App/Runtime Security Review Notes
- Fixed explicit high-risk internal exposure routes listed in `H-01` and `H-02`.
- Residual architectural risk: multiple product API routes still rely on environment/deployment boundary rather than end-user authentication (for example, dashboard/brief/focus/news APIs). If internet-exposed, add user/session auth + authorization policies per route.

## Dependency / Supply Chain Review
- Production-focused audit: `npm audit --omit=dev` => `0 high`, `0 critical`, `8 low`.
- Full dependency tree (including dev tooling): `1 high` (`minimatch` in transitive path under `@googleworkspace/cli`), non-prod path.
- Blocking status:
  - Blocking: none for production runtime as of this audit.
  - Non-blocking: low-severity transitive findings in firebase-admin chain; monitor upstream fixes.

## CI Security Baseline
- Latest runs on `main` observed successful:
  - Security Baseline Scan: https://github.com/ItsMalware/afh-cozyhub/actions/runs/22926954286
  - Secret Leak Prevention: https://github.com/ItsMalware/afh-cozyhub/actions/runs/22926954268
- Hardening applied:
  - Secret scan now uses two scanners and fails on verified + unknown TruffleHog results.
  - Supply chain CI gate raised from `critical` to `high` for prod audit.

## Security Gate Checklist (Release)
- [ ] `AFH_INTERNAL_API_TOKEN` (or `INTERNAL_API_TOKEN`) configured in production.
- [ ] `NOTION_WEBHOOK_SECRET` configured for webhook endpoints.
- [ ] No `.env*`, key stores, runtime logs/outbox/data snapshots staged (`git status --ignored` spot-check).
- [ ] Secret scans pass on PR and `main` (`gitleaks` + `trufflehog`).
- [ ] `npm audit --omit=dev --audit-level=high` passes.
- [ ] Route-level auth review completed for remaining public API handlers before internet exposure.

## If Secrets Are Found Later (Prepared Response Plan)
1. Rotate immediately in this order: cloud/provider API tokens, webhook secrets, database credentials, service account keys, then user/session signing keys.
2. Invalidate old credentials and review access logs around exposure window.
3. Remove from code + history:
   - Preferred: `git filter-repo --path <file> --invert-paths` or targeted replace rules.
   - Alternative: BFG Repo-Cleaner for bulk secret string replacement.
4. Force-push rewritten history, coordinate downstream reclones, and re-run full secret scans before re-release.

