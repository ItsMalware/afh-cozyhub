# Web Deployment Guide

CozyHub is built on Next.js 15 (App Router) and can be easily deployed to platforms like Vercel, Netlify, or Google Cloud Run. While CozyHub offers native macOS and Android wrapper builds (see `afh-platform-001-architecture.md`), the core dashboard is fundamentally a standard web app.

## Deploying to Vercel (Recommended)

Vercel is the easiest place to host cozyhub.

1. **Push your code to GitHub:** Ensure your `main` branch includes all your changes, but **NO** `.env` secrets!
2. **Import Project:** Go to the Vercel dashboard -> Add New -> Project, and import your repository.
3. **Configure Environment Variables:** Before clicking Deploy, copy the values from your local `.env.local` that are required. Wait to deploy until you have added:
   * `NOTION_TOKEN`
   * `NOTION_DATABASE_*_ID` (Tasks, Businesses, Sessions, etc.)
   * `GEMINI_API_KEY` (if using standard Gemini execution)
   * `FIREBASE_PROJECT_ID` (and credentials if storing chat memory)
   * `NEXT_PUBLIC_DEMO_MODE=false` (To ensure the app talks to your real databases instead of local seed data).

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
* **NotebookLM MCP Limitations:** If you are using the local NotebookLM MCP wrapper (`NOTEBOOKLM_USE_MCP=true`), be aware that Serverless environments (like Vercel) **cannot run persistent browser automation**. You will need to either host CozyHub on a long-running VPS/Docker container with Chrome installed, OR run the NotebookLM gateway remotely and configure `NOTEBOOKLM_BRIEF_ENDPOINT`.
