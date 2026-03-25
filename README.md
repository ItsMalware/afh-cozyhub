# CozyHub

Welcome to CozyHub! The dashboard designed to help you organize chaos into structured, productive deep work. 

## What is CozyHub OSS?
CozyHub Open Source (this repository) contains the core NextJS application and "CozyIcon" design system. It is meant to serve as the foundation for any developer wanting to build an extensible, low-clutter focus application.

## ✨ Why People Say "Whoa"
- Cozy glassmorphism dashboard with kawaii-friendly interaction patterns.
- Agent architecture with Prime + specialist workflows.
- Branding Day Mode with AI insight cards, funnel snapshots, channel mix, and moments tracking.
- Weekly AI summary pipeline ready for Monday-night automation.

## 🧠 Neurodivergent-First Design
CozyHub was created to support real-world executive function needs, including ADHD, OCD, autism, and broader neurodivergent workflows.

Design intent includes:
- low-clutter daily focus views to reduce overwhelm,
- predictable structure and repeatable routines,
- gentle reminders and pacing cues to prevent burnout,
- clear task framing that lowers context-switching friction.

## 🚀 Quickstart (Demo Mode)
To let you explore the application immediately without needing to configure complex database connections, the Open Source repository defaults to **Demo Mode**. 

Demo Mode replaces all live Notion/Gemini API calls with local static JSON seeds located in `/public/data`.

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Boot the dashboard**
   ```bash
   npm run dev
   ```
   *Note: Because `NEXT_PUBLIC_DEMO_MODE=true` is set as the default in the internal routing, the project will boot instantly.*

### Supported runtime
- Node.js `22.x` is the supported runtime for local development and CI.
- Use `.nvmrc` with `nvm use` before running install, lint, or build steps.

### Release verification
Run the full pre-release verification locally before opening or merging a release PR:

```bash
npm run release:check
```

Install the release smoke browser once per machine:

```bash
npx playwright install chromium
```

Run the smoke suite explicitly with:

```bash
npm test
```

## 🔒 Open Source vs Private Enterprise Edition
This repository runs the public **OSS** tier. The maintainers simultaneously operate a **Private Edition** which includes proprietary hooks not found here.

| Capability | OSS Edition | Private Edition |
| --- | --- | --- |
| Cozy dashboard (widgets, clock, focus UX) | ✅ | ✅ |
| Agent framework (Prime, specialists, delegation scaffolding) | ✅ | ✅ |
| Sub-agent/team orchestration with live production connectors | ⚠️ Bring your own integrations | ✅ |
| Branding Day widgets + local summary store | ✅ | ✅ |
| Live Notion bi-sync and ticket orchestration | ⚠️ Bring your own Notion setup | ✅ |
| NotebookLM-powered brief + weekly summary pipeline | ⚠️ Bring your own NotebookLM mapping/auth | ✅ |
| Antigravity / Codex connector hooks | ⚠️ Framework hooks included, you wire endpoints | ✅ |
| Proprietary operator logic + internal runbooks | ❌ | ✅ |

## ⚙️ Environment Configuration 
If you wish to fork this project and wire up your own external databases, review the `.env.example` file. This file outlines every variable required to connect Notion and Gemini API keys. 

### Key Guides for Setup
For detailed setup instructions on configuring the above modes, please see the following guides:
- [Notion Database Schema Setup](docs/setup/notion.md)
- [Agent Webhooks & Router Setup](docs/setup/webhooks.md)
- [Firebase & NotebookLM Integrations](docs/setup/integrations.md)
- [Web Deployment Guide](docs/setup/deployment.md)

**Never commit your `.env` or `.env.local` files!**
The CI pipelines (`.github/workflows/secret-scan.yml`) strictly enforce TruffleHog scanning. If you attempt to merge secrets, your pull request will be rejected. 

## 🔌 What To Plug In (To Go From Demo -> Production)
You can run CozyHub in three levels:

1. **Demo mode (zero keys)**  
   - Just run `npm install` + `npm run dev`.

2. **Live personal mode (bring your own keys/tokens)**  
   - OpenAI and/or Gemini key for model-backed routes.
   - Notion integration token + database IDs.
   - NotebookLM authentication + notebook mapping.
   - Optional: Twilio (SMS), Firebase, webhook secrets.

3. **Ops mode (agent teams + external executors)**  
   - Configure connector endpoints/secrets for your execution stack (for example Codex/Antigravity-style workers).
   - Enable weekly automation routes and scheduler tokens.
   - Keep strict secret management in CI and deployment.

### Key principle
- **OSS does include agent/sub-agent/team architecture.**
- **Live capability requires your own credentials and endpoints.**
- **No shared production keys are bundled in this repository.**

## 🧩 Google Workspace CLI (CozyHub Private Workflow)
This repo includes local scripts for `@googleworkspace/cli`:

- `npm run gws:status`
- `npm run gws:login`
- `npm run gws:setup`
- `npm run gws:smoke`

Recommended setup for this project:
1. Keep auth state in repo-local `.gws`:
   - `export GOOGLE_WORKSPACE_CLI_CONFIG_DIR="$PWD/.gws"`
2. Place Desktop OAuth file at:
   - `./.gws/client_secret.json`
3. Authenticate:
   - `npm run gws:login`
4. Verify end-to-end:
   - `npm run gws:smoke`

This avoids threads writing credentials to the wrong folder and keeps the workflow consistent across agents.

If you hit `Failed to decrypt credentials`, re-run login in the same shell. If it still persists, run GWS auth commands with Node 22 LTS for stability.

## 🛡️ Security
We take supply chain and application security seriously. 
- Please see `.github/PULL_REQUEST_TEMPLATE.md` for mandated merge checks.
- Please see [SECURITY.md](SECURITY.md) for vulnerability reporting guidelines.
- Please see [CHANGELOG.md](CHANGELOG.md) for the release-summary history.

## 🤝 Roadmap & Contributing
If you wish to contribute to the open-source layer, review the [CONTRIBUTING.md](CONTRIBUTING.md) guide! We actively welcome improvements to the UI layout, the CozyIcon motion engine, and accessibility audits.

## 📄 License
This project is licensed under the [MIT License](LICENSE).
