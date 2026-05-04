# tf360 AI Agent — Context Document

> **For any new AI assistant session:** Read this ENTIRE document before
> writing any code. It contains everything you need to understand the
> project structure, conventions, and constraints.
>
> **For developers (Laxmi):** Attach this file at the start of any new chat
> session. Then say which AI module you want to build, in which app, and the
> assistant will help you cleanly without confusion.

Last updated: 2026-04-30

---

## 1. TL;DR — What this project is

**tf360** is an Indian construction & real-estate B2B marketplace. Vendors list
products (cement, TMT bars, paints, plumbing, sanitaryware, adhesives, tiles,
electricals, hardware, etc.); buyers (users) purchase them; contractors bid
on projects; admins approve and operate.

We've built a custom **AI Agent** as a separate microservice that powers AI
features across all the apps. The first feature that shipped is "Product
Auto-fill" — vendor types a product name, AI fills the description, bullets,
GST, HSN, category, variants, and reference images.

The architecture is a **modular monolith**: one AI service, many modules.
Adding module #2, #3, #N is dramatically faster than building module #1
because all the foundation (auth, logging, provider switching, error
handling, AI Hub feature flags) is shared.

---

## 2. The four projects (folders & purposes)

```
C:\Users\user\
├── tf360\                       ← existing apps (THE PLATFORM)
│   ├── vendor-web\              Next.js — vendors list/manage products
│   ├── admin-web\               Next.js — staff approves submissions, support
│   ├── contractor-web\          Next.js — contractors place bids
│   └── (Flutter user app at root level: lib/, ios/, android/)
│
├── tf360-ai-service\            ← THE AI BRAIN (Python/FastAPI)
│                                  - Single service, many modules
│                                  - Gemini 2.5 Flash today, Ollama swap-ready
│                                  - Verifies Firebase tokens, logs to Firestore
│                                  - Runs on http://localhost:8080
│
└── tf360-ai-hub\                ← DIRECTOR-ONLY CONTROL PANEL (Next.js)
                                   - Login + ai_admins/ allowlist
                                   - Toggle AI features on/off
                                   - Phase 1 done; phases 2-6 pending
                                   - Runs on http://localhost:3001
```

### Ports during local development

| Port | App |
|---|---|
| 3000 | tf360/vendor-web (Next.js) |
| 3001 | tf360-ai-hub (Next.js, director console) |
| 3002 | tf360/admin-web (Next.js) |
| 3003 | tf360/contractor-web (Next.js) |
| 8080 | tf360-ai-service (Python FastAPI) |

The AI service is configured to allow CORS from ports 3000-3002 by default
(see `tf360-ai-service/.env` → `ALLOWED_ORIGINS`).

---

## 3. The team / access control

| Person | Role | Access |
|---|---|---|
| **Suraj Govindaraju** | Director, owner | Super Admin in AI Hub. Full control. Email: `suraj@terrainfra360.com` |
| **Laxmi** | Developer (you) | Should be added as Admin in AI Hub. Builds new AI modules. |
| **Rakshitha** | Employee | Operational access only — admin-web. NOT in AI Hub allowlist. |

To add Laxmi as an admin: Suraj logs into the AI Hub at `localhost:3001` →
**Manage Admins** → **+ Invite new admin** → fills Laxmi's name, email, temp
password, role: `admin`. He then shares the temp password with her, she logs
in and changes it via the **My Profile** page.

---

## 4. Existing AI modules

| ID | Name | App | Status | Endpoint |
|---|---|---|---|---|
| `product_autofill` | Product Auto-fill | vendor-web | ✅ Live | `POST /v1/generate-product` |

Other things the AI service exposes (not standalone "modules" but used by
Product Auto-fill):

- `GET /v1/proxy-image?url=...&whitenBg=true` — fetch image, optionally remove background
- `POST /v1/ensure-taxonomy` — find or create macro/category/product type with provisional flag
- `GET /v1/admin/setup-status` — public, used by AI Hub for bootstrap detection
- `POST /v1/admin/bootstrap` — public one-shot, creates first super admin
- `GET /v1/admin/me` — current admin's role
- `GET /v1/admin/features` — list features (admin only)
- `POST /v1/admin/features/{id}/toggle` — enable/disable feature (admin only)
- `GET /v1/admin/admins` — list admins (super-admin only)
- `POST /v1/admin/admins` — invite new admin (super-admin only)
- `DELETE /v1/admin/admins/{uid}` — deactivate admin (super-admin only)
- `POST /v1/admin/admins/{uid}/role` — change role (super-admin only)

---

## 5. How to add a new AI module — the standard procedure

This is the recipe. Every new module follows the same shape.

### 5.1. Pick a module ID and name

Pick a snake_case ID like `order_message_drafter`, `sales_insights`,
`hsn_validator`. Keep it specific. This becomes the Firestore document ID
under `ai_features/<id>`.

### 5.2. Backend (tf360-ai-service)

Create three files:

**File 1: `app/prompts/<id>.txt`** — the AI's instructions

```
You are an expert assistant for tf360.
Given <input>, return <output>.

Hard rules:
- Output STRICT JSON, no prose, no code fences.
- ... business rules specific to this module ...

Output schema:
{
  "field1": string,
  "field2": number,
  ...
}

Input:
{{user_input}}
```

**File 2: `app/routes/<id>.py`** — the HTTP endpoint

```python
"""
POST /v1/<endpoint-name>
What this module does in one sentence.
"""
import time
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.adapters import get_adapter
from app.auth import verify_firebase_token
from app.services import feature_flags, ai_logger

router = APIRouter()
FEATURE_ID = "<id>"
PROMPTS_DIR = Path(__file__).parent.parent / "prompts"


class RequestBody(BaseModel):
    # define inputs
    pass


@router.post("/<endpoint-name>")
async def handler(
    body: RequestBody,
    user: Dict[str, Any] = Depends(verify_firebase_token),
):
    started = time.time()

    # 1. Feature flag — admin can kill switch from AI Hub
    if not await feature_flags.is_enabled(FEATURE_ID):
        raise HTTPException(503, detail={
            "code": "FEATURE_DISABLED",
            "message": "This AI feature is currently disabled.",
        })

    # 2. Load + render prompt
    template = (PROMPTS_DIR / "<id>.txt").read_text(encoding="utf-8")
    rendered = template.replace("{{user_input}}", body.user_input)

    # 3. Call the LLM
    adapter = get_adapter()
    try:
        parsed = await adapter.generate_json(rendered, temperature=0.2)
    except Exception as e:
        # Log + return graceful error — frontend always falls back
        await ai_logger.log_call(
            feature_id=FEATURE_ID,
            user_uid=user.get("uid"),
            user_email=user.get("email"),
            provider=adapter.name,
            model=adapter.model,
            input_payload={"input": body.user_input},
            output_payload=None,
            success=False,
            error=str(e),
            duration_ms=int((time.time() - started) * 1000),
        )
        raise HTTPException(502, detail={
            "code": "AI_FAILED",
            "message": "AI couldn't generate. Please try again or do it manually.",
        })

    # 4. Log success
    await ai_logger.log_call(
        feature_id=FEATURE_ID,
        user_uid=user.get("uid"),
        user_email=user.get("email"),
        provider=adapter.name,
        model=adapter.model,
        input_payload={"input": body.user_input},
        output_payload=parsed,
        success=True,
        error=None,
        duration_ms=int((time.time() - started) * 1000),
    )

    # 5. Return cleaned + clamped output
    return {**parsed, "_meta": {"provider": adapter.name, "model": adapter.model}}
```

**File 3: Register the route in `app/main.py`**

```python
from app.routes import health, product, proxy, taxonomy, admin, <your_module>
...
app.include_router(<your_module>.router, prefix="/v1")
```

**File 4: Add to AI Hub feature catalogue in `app/routes/admin.py`**

```python
_FEATURE_CATALOGUE = [
    {"id": "product_autofill", ...},
    {
        "id": "<id>",
        "name": "Human-readable name",
        "description": "What this module does, shown in the AI Hub.",
    },
]
```

### 5.3. Frontend integration (vendor-web / admin-web / etc.)

**File 1: Add a typed helper to the frontend's `aiClient.ts`** (or create
`aiClient.ts` if the app doesn't have one — see `tf360/vendor-web/src/lib/aiClient.ts`
for the canonical implementation).

```typescript
export type ModuleInput = { ... };
export type ModuleOutput = { ... };

export function callMyModule(input: ModuleInput) {
  return callAI<ModuleInput, ModuleOutput>("/v1/<endpoint-name>", input);
}
```

**File 2: Wire it into the page where it's used.** Add a button/trigger.
On click, call the helper. On success, populate fields. On failure, show
a graceful notice and keep the manual flow working.

### 5.4. Test

1. Restart the AI service (Ctrl+C uvicorn, then `uvicorn app.main:app --reload --port 8080`)
2. Refresh the frontend
3. Verify the feature appears in the AI Hub under Features
4. Toggle it off → frontend should fall back gracefully
5. Toggle it on → frontend should work

---

## 6. The four target apps & what they're for

| App | Folder | Users | What goes here |
|---|---|---|---|
| **vendor-web** | `tf360/vendor-web` | Approved vendors | Product submission, order management, dashboard |
| **admin-web** | `tf360/admin-web` | Internal staff (Rakshitha etc.) | Approve product submissions, support, ops |
| **contractor-web** | `tf360/contractor-web` | Construction contractors | Browse projects, place bids |
| **user-app** | `tf360/lib/` (Flutter) | End buyers (homeowners, builders) | Browse products, place orders |

When Laxmi says "I want to build module X for app Y", look up the folder in
this table.

---

## 7. Configuration & secrets

### tf360-ai-service/.env (NEVER commit; in .gitignore)

```
AI_PROVIDER=gemini
GEMINI_API_KEY=<from suraj@terrainfra360.com — Google AI Studio>
GEMINI_MODEL=gemini-2.5-flash

OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b

GOOGLE_CSE_ID=<from Suraj — Programmable Search Engine>
GOOGLE_SEARCH_API_KEY=<separate key from Gemini key>

FIREBASE_PROJECT_ID=tf360-360
FIREBASE_SERVICE_ACCOUNT_JSON=./service-account.json

SERVICE_PORT=8080
LOG_LEVEL=INFO
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:3002
```

### tf360-ai-service/service-account.json

Firebase service account credentials. Download from Firebase Console →
`tf360-360` project → Project Settings → Service Accounts → Generate new
private key. Save as `service-account.json` in the AI service folder root.

### tf360-ai-hub/.env.local (NEVER commit)

Firebase web SDK config — copy the values from `tf360/vendor-web/.env.local`
(same Firebase project, same web app config). Plus
`NEXT_PUBLIC_AI_SERVICE_URL=http://localhost:8080` for local dev.

---

## 8. How to run things locally

### Start the AI service

```bash
cd ~/tf360-ai-service
source .venv/Scripts/activate     # Windows Git Bash
uvicorn app.main:app --reload --port 8080
```

Health check: open http://localhost:8080/health → should return JSON.

### Start the AI Hub

```bash
cd ~/tf360-ai-hub
npm run dev
```

Opens on http://localhost:3001. Director (Suraj) signs in.

### Start vendor-web (or any other app)

```bash
cd ~/tf360/vendor-web
npm run dev
```

Opens on http://localhost:3000.

---

## 9. Important conventions (don't violate these)

1. **Modular monolith** — one AI service, many modules. Don't spin up new
   services for each feature. Each module is one route + one prompt + one
   helper file in the existing `tf360-ai-service`.

2. **Graceful degradation** — every AI feature must be optional. If the AI
   service is unreachable or the feature is toggled off, the manual flow
   must keep working. The frontend client (`aiClient.ts` style) should
   return `{ ok: false }` on any failure, never throw.

3. **Feature flags** — every module checks `feature_flags.is_enabled(<id>)`
   first and returns 503 if disabled. The AI Hub's Features page lets the
   director kill-switch any module in real time.

4. **Logging** — every AI call goes through `ai_logger.log_call(...)`.
   Best-effort, never blocks the user request. Powers future Logs/Usage
   pages in the AI Hub.

5. **Auth** — every authenticated endpoint uses `Depends(verify_firebase_token)`.
   For director-only endpoints, use `Depends(require_super_admin)` (see
   `app/routes/admin.py`).

6. **Provider abstraction** — never call Gemini directly. Always go through
   `app.adapters.get_adapter()`. This lets us swap to Ollama or any other
   model with one env-var change.

7. **No secrets in code** — API keys, service accounts, etc. always live in
   `.env` or service-account.json (both gitignored). Never commit.

8. **Watermarking & branding** — when AI generates images that go into
   product listings, the existing `tf360/vendor-web/src/lib/imageUtils.ts`
   adds the `terrainfra360` watermark. Reuse this.

9. **Prompts are config, not code** — keep prompts in `app/prompts/*.txt`
   so they can later be edited via the AI Hub Prompt Editor (Phase 4)
   without redeploying.

10. **AI suggests, vendor decides** — never make the AI auto-action things
    that affect billing, payments, or customer commitments. Always present
    AI output as a suggestion the human reviews.

---

## 10. What's NOT built / what's parked

| Thing | Status | Why |
|---|---|---|
| Production deployment | ⏸ Pending | Will deploy to Cloud Run at `ai.terrainfra360.com`. Currently localhost-only. |
| Vision verification of images | ⏸ Disabled | Was slow + flaky. Re-enable via env var `ENABLE_VISION_VERIFY=true` once we have a faster pipeline. |
| AI Hub Phase 2-6 | ⏸ Planned | Connections, Logs viewer, Usage dashboard, Prompt editor, No-code module creation, Provisional taxonomy review. |
| Forgot password flow | ⏸ Pending | Director recovers via Firebase Console manually for now. |
| Email invites for admins | ⏸ Manual | Inviter sets temp password, shares manually with invitee. |
| Rate limiting per vendor | ⏸ Pending | Easy to add via Firestore-cached per-vendor quotas. |
| Image dedup detection | ⏸ Pending | Vendor could upload duplicates today. |
| Automated testing | ⏸ Pending | No tests yet — too early-stage. |

When Laxmi suggests building one of these, point her here so she knows
the context.

---

## 11. Common pitfalls / things that bit us

1. **`.env` changes don't auto-reload uvicorn.** `--reload` watches Python
   files only. Edit `.env` → must Ctrl+C and re-run `uvicorn` to pick up
   new values.

2. **Gemini 2.5 Flash uses "thinking" tokens** that consume `max_output_tokens`.
   For vision/JSON calls, use at least `max_output_tokens=2048` so the
   actual output JSON has room.

3. **Firebase Custom Search API is blocked** at the project level for
   `tf360-360`. We use DuckDuckGo + Google scraping instead. Don't try
   to use `customsearch.googleapis.com` directly.

4. **Cloud Run reads the `PORT` env var** — Dockerfile uses `${PORT}`,
   defaulting to 8080. Don't hardcode a port.

5. **The `service-account.json` file is local-only.** On Cloud Run we use
   the default service account (no JSON file). The `auth.py` code already
   handles both cases (file present → use it; file absent → use default
   credentials).

6. **`emailStr` from Pydantic requires `email-validator`.** Already in
   `requirements.txt` but worth knowing.

7. **rembg downloads a ~100MB ML model on first use.** First image with
   `whitenBg=true` is slow (~10-30s). Subsequent are fast.

---

## 12. Files to read first when getting context

If new AI session, read these in order to understand the codebase:

1. `tf360-ai-service/README.md` — project overview
2. `tf360-ai-service/app/main.py` — see all registered routes
3. `tf360-ai-service/app/routes/product.py` — canonical example of a working module
4. `tf360-ai-service/app/prompts/product_extract.txt` — canonical prompt
5. `tf360-ai-service/app/adapters/gemini.py` — how LLM calls are made
6. `tf360-ai-service/app/services/feature_flags.py` — how kill-switching works
7. `tf360-ai-service/app/services/ai_logger.py` — how every call is logged
8. `tf360/vendor-web/src/lib/aiClient.ts` — canonical frontend client
9. `tf360/vendor-web/src/app/submit-product/page.tsx` — canonical app integration
10. `tf360-ai-hub/src/app/page.tsx` — director dashboard

---

## 13. Reporting workflow

Suraj keeps two living-document reports on his Desktop that update after
every meaningful change:

- `TF360_AI_Development_Report.docx` — narrative report
- `TF360_AI_Development_Tracker.xlsx` — task tracker (6 sheets)

The generator script lives at `Desktop/tf360_report_generator.py`. After
shipping any new module, update the script's `TASKS`, `COMPONENTS`,
`MODULES_ROADMAP`, and `ISSUES` arrays, then re-run:

```bash
python3 ~/Desktop/tf360_report_generator.py
```

If the AI assistant shipped the change, it's responsible for updating the
report data. Tell the user "📄 Reports updated — added [X]" after every
non-trivial change.

---

## 14. Quick mental model for new sessions

When Laxmi says: "Build me an AI module that drafts customer support replies
for the user-app":

1. **Module ID**: `support_reply_drafter`
2. **Endpoint**: `POST /v1/draft-support-reply`
3. **Prompt**: `app/prompts/support_reply_drafter.txt`
4. **Frontend**: add helper to `tf360/lib/<flutter_or_ts>/aiClient`, wire
   into the user-app's support screen
5. **Register**: in `main.py` and `admin.py` feature catalogue
6. **Test**: feature toggle in AI Hub, vendor-web fallback flow, log entries
   in `ai_logs/` Firestore collection
7. **Update reports**: re-run report generator

---

## 15. If something is unclear

When unsure, prefer:

1. **Reading existing code** over reinventing. The Product Auto-fill module
   is the canonical example.
2. **Asking Laxmi or Suraj** rather than guessing. Especially for business
   logic (e.g., "should AI auto-set a price"? — answer: NEVER. AI suggests,
   human decides).
3. **Adding behind a feature flag** rather than enabling by default.
   Director can flip it on when ready.

---

## End of context document

Laxmi's next step: tell the assistant which module to build.
Example: "I want to build the Order Message Drafter for vendor-web."
