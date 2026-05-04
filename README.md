# tf360 AI Hub

The directors-only control panel for the tf360 AI agent.

This is a **separate Next.js project** from `tf360` (vendor/admin/contractor apps) and
`tf360-ai-service` (the AI brain). Only authorized directors — listed in Firestore at
`ai_admins/<email>` — can log in. Everyone else is shown an Access Denied page.

## What you can do here

- **Phase 1** (current): toggle each AI feature/module on or off in real time
- **Phase 2** (planned): manage Gemini/Ollama provider configuration
- **Phase 3** (planned): live request logs + cost dashboard
- **Phase 4** (planned): edit AI prompts in the browser with version history
- **Phase 5** (planned): review/approve provisional taxonomy entries
- **Phase 6** (planned): create new AI modules without writing code

## Quickstart

1. Install Node 20+ and `npm`.
2. From this folder:
   ```bash
   npm install
   cp .env.local.example .env.local
   # fill in NEXT_PUBLIC_FIREBASE_* values from tf360/vendor-web/.env.local
   npm run dev
   ```
3. Open http://localhost:3001
4. Log in with your director email.
5. **First-time setup**: if `ai_admins/<your-email>` doesn't exist in Firestore yet,
   you'll see Access Denied. Add it manually in the Firebase console:
   - Collection: `ai_admins`
   - Document ID: your full email (e.g., `suraj@terrainfra360.com`)
   - Fields: `role: "director"`, `createdAt: <now>`, `permissions: ["all"]`
   Once that document exists, refresh and you're in.

## Architecture

```
+--------------+       +-----------------+       +-------------------+
|  tf360-ai-   |  -->  |  tf360-ai-      |  -->  |   Firestore       |
|  hub         |       |  service        |       |   ai_features     |
|  (this app)  |       |  /v1/admin/*    |       |   ai_admins       |
+--------------+       +-----------------+       +-------------------+
        |                                                 ^
        |    direct read for allowlist check on login     |
        +-------------------------------------------------+
```

Hub never writes to Firestore directly — every change goes through the AI service's
`/v1/admin/*` endpoints, which apply director-level auth on the server side too
(defense in depth).

## Three layers of access control

1. **Firebase login** (same `tf360-360` project as everything else)
2. **Allowlist check** — Hub reads `ai_admins/<your-email>` on login. No doc → Access Denied.
3. **Server-side verify_director** — every `/v1/admin/*` call is independently checked on
   the AI service against the same allowlist.

## Folder layout

```
tf360-ai-hub/
+-- src/
|   +-- app/
|   |   +-- layout.tsx           # global layout
|   |   +-- page.tsx              # dashboard (after login)
|   |   +-- login/page.tsx        # director login
|   |   +-- access-denied/page.tsx
|   |   +-- features/page.tsx     # Phase 1 — toggle modules
|   +-- lib/
|   |   +-- firebase.ts           # Firebase client SDK init
|   |   +-- adminAuth.ts          # allowlist check + auth state hook
|   |   +-- aiAdmin.ts            # client for /v1/admin/* endpoints
|   +-- components/               # shared UI parts
+-- package.json
+-- .env.local.example
+-- README.md
```
