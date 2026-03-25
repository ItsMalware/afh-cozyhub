# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

### Fixed
- Prevented OSS/demo builds from failing when private Notion credentials are not configured by lazily initializing the Notion-backed agent service at request time.
- Removed an unnecessary Next.js env exposure so server-only secrets are not injected into the client bundle.
- Aligned CI with the supported Node runtime and expanded release checks to include lint, typecheck, and production build verification.
- Added a release smoke suite covering the demo dashboard API, validation behavior for the brief route, and dashboard rendering in demo mode.

### Changed
- Added `.env.example` and `.nvmrc` so contributors can bootstrap the OSS project with the documented runtime and configuration surface.
- Refreshed deployment and project docs to match CozyHub branding, Next.js 16, and the current OSS release workflow.
- Added dependency overrides and updated `next` to pull in currently available security fixes in the supported dependency graph.
