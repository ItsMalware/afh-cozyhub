## Description
_Describe the changes introduced in this pull request and any context needed to review._

## Security Checklist
Verify the following requirements are addressed before marking this PR ready for review.

- [ ] All inputs and data derived from external systems (Notion clients, user forms) are validated.
- [ ] No hardcoded `.env` secrets or API credentials are included in this PR.
- [ ] New server-side (`route.ts`) mutations apply authorization boundaries (Authz).
- [ ] Outputs rendered to React DOM components properly escape raw markdown to prevent XSS.
- [ ] Required security scans (`npm audit`, Secret Scanner) pass in the CI workflow.

## Acceptance Criteria
- [ ] Feature matches the Notion ticket requirements.
- [ ] Code has been tested locally via `npm run dev` and `npm run lint`.
