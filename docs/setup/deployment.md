# Web Deployment Guide

CozyHub is built on Next.js 16 (App Router) and can be deployed to platforms like Vercel or Google Cloud Run. While CozyHub offers native macOS and Android wrapper builds (see `afh-platform-001-architecture.md`), the OSS release artifact is the standard web app.

## Release checklist before deploy

1. Use Node.js `22.x` (`nvm use` reads this from `.nvmrc`).
2. Install dependencies with `npm install` or `npm ci`.
3. Install the local smoke-test browser once with `npx playwright install chromium`.
4. Run `npm run release:check` and `npm test`.
5. Review `.env.example` and make sure deployment-only secrets are configured in your host, not committed locally.
6. Confirm `NEXT_PUBLIC_DEMO_MODE` is set for the target environment:
   - `true` for demo/OSS showcase deployments
   - `false` only when you have configured your own live integrations

## Deploying to Vercel (Recommended)

Vercel is the easiest place to host CozyHub.

1. **Push your code to GitHub:** Ensure your `main` branch includes all your changes, but **NO** `.env` secrets!
2. **Import Project:** Go to the Vercel dashboard -> Add New -> Project, and import your repository.
3. **Configure Environment Variables:** Before clicking Deploy, copy only the values you actually need from `.env.example`.
   * For demo deployments, set `NEXT_PUBLIC_DEMO_MODE=true` and leave optional integration credentials unset.
   * For live deployments, add the relevant `NOTION_*`, `GEMINI_*`, `OPENAI_*`, `NOTEBOOKLM_*`, `FIREBASE_*`, and scheduler secrets required by your setup, then set `NEXT_PUBLIC_DEMO_MODE=false`.

4. **Deploy:** Click deploy.

## Deploying to Google Cloud Run (Docker)

If you prefer to containerize the app for GCP:

1. Create a standard Next.js `Dockerfile`:
```dockerfile
FROM node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "start"]
```
2. Build and push the image using Google Cloud Build.
3. Deploy the image to Cloud Run. Make sure your secrets are passed via Google Cloud Secret Manager.

## Important Considerations
* **NotebookLM MCP Limitations:** If you are using the local NotebookLM MCP wrapper (`NOTEBOOKLM_USE_MCP=true`), be aware that serverless environments like Vercel cannot run persistent browser automation. You will need to either host CozyHub on a long-running VPS/Docker container with Chrome installed, or run the NotebookLM gateway remotely and configure `NOTEBOOKLM_BRIEF_ENDPOINT`.
* **Demo mode is a first-class OSS path:** The production build must succeed even when private Notion credentials are absent. Only set live integration variables when you intend to run the private-style workflow.
