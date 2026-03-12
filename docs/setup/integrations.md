# External Integrations Setup

CozyHub features advanced integrations to give your agents persistent memory (Firebase) and direct access to your knowledge base documents (NotebookLM). 

## 1. Firebase Admin & Firestore Setup
Firebase is used strictly for storing 30-day Agent Chat histories. It requires initializing the `firebase-admin` SDK with a service account.

There are two ways to configure Firebase credentials in your `.env.local`:

**Method A: Direct Environment Variables (Recommended for simple local dev/Vercel)**
You will need to generate a new Private Key from your Firebase project settings (Project Settings -> Service Accounts -> Generate New Private Key).

```env
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-service-account-email@...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvA...\n-----END PRIVATE KEY-----\n"
```
*Note: Make sure your `FIREBASE_PRIVATE_KEY` uses actual string `\n` characters if placed directly in a `.env` file!*

**Method B: Google Application Default Credentials (ADC)**
If you are deploying to Cloud Run, or have a local `~/.config/gcloud/application_default_credentials.json` file, the app will automatically pick it up. You only need to provide the project ID.

```env
FIREBASE_PROJECT_ID=your-project-id
```

## 2. NotebookLM API Configuration
CozyHub's Librarian agent can query Google NotebookLM to fetch automatically generated 120-word context "briefs" before you start a focus session. This allows your agent to brief you on your specific business domain!

Since there is no public NotebookLM API, CozyHub interacts with a local MCP wrapper or a remote gateway.

**A. Using the Model Context Protocol (MCP)**

You can map different `BusinessId` or `BusinessName` strings straight to their corresponding Notebook URLs.

```env
NOTEBOOKLM_USE_MCP=true
NOTEBOOKLM_MCP_COMMAND=./node_modules/.bin/notebooklm-mcp

# A fallback URL for any unmapped business:
NOTEBOOKLM_DEFAULT_NOTEBOOK_URL=https://notebooklm.google.com/notebook/your-default-id

# Map specific Business strings to correct Notebooks (as JSON):
NOTEBOOKLM_NOTEBOOK_MAP_JSON={"My Project": "https://notebooklm.google.com/notebook/123", "Other Project": "https://notebooklm.google.com/notebook/456"}
```

**B. Using a Remote Auth Gateway**
If you have set up a wrapper API on a remote server that exposes NotebookLM over HTTP:

```env
NOTEBOOKLM_USE_MCP=false
NOTEBOOKLM_BRIEF_ENDPOINT=https://your-custom-gateway.url/api/brief
NOTEBOOKLM_API_KEY=your_optional_gateway_key
```

The app will `POST` to your endpoint with `{ "businessId": "...", "businessName": "..." }` and expects a JSON response containing a `brief` string field.
