# CozyHub 🧘

Welcome to CozyHub! The dashboard designed to help you organize chaos into structured, productive deep work. 

## What is CozyHub OSS?
CozyHub Open Source (this repository) contains the core NextJS application and "CozyIcon" design system. It is meant to serve as the foundation for any developer wanting to build an extensible, low-clutter focus application.

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

## 🔒 Open Source vs Private Enterprise Edition
This repository runs the public **OSS** tier. The maintainers simultaneously operate a **Private Edition** which includes proprietary hooks not found here.

| Feature                           | OSS Edition | Private Edition |
| --------------------------------- | ----------- | --------------- |
| Cozy Dashboard (Widgets & Clock)  | ✅          | ✅              |
| Live Notion Task Bi-Syncing       | ❌          | ✅              |
| NotebookLM Agent Integrations     | ❌          | ✅              |
| Substack News Analysis Hooks      | ❌          | ✅              |

## ⚙️ Environment Configuration 
If you wish to fork this project and wire up your own external databases, review the `.env.example` file. This file outlines every variable required to connect Notion and Gemini API keys. 

**Never commit your `.env` or `.env.local` files!**
The CI pipelines (`.github/workflows/secret-scan.yml`) strictly enforce TruffleHog scanning. If you attempt to merge secrets, your pull request will be rejected. 

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

## 🤝 Roadmap & Contributing
If you wish to contribute to the open-source layer, review the [CONTRIBUTING.md](CONTRIBUTING.md) guide! We actively welcome improvements to the UI layout, the CozyIcon motion engine, and accessibility audits.
