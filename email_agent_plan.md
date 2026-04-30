# DocuAgent V4 — Email Agent Megvalósítási Terv

## Architektúra összefoglaló

**V3-ból portolható (közvetlen átemelés):**
- 5-rétegű agent pipeline: Intake → Knowledge → Drafting → Compliance → Action
- `agents/intake.py` — entity extraction (invoice_ids, dates, amounts, urgency_signals)
- `agents/drafting.py` — ClassificationOutput Pydantic model + retry logika
- `agents/compliance.py` — policy rule engine (complaint block, tax domain, threshold)
- `agents/action.py` — DB persist + case auto-link
- `agents/knowledge.py` — RAG retrieval (v4 Qdrant-ra adaptálva)
- Classify pipeline orchestráció (`routers/classify.py` → `modules/email/service.py`)
- Reply generation + RAG context + jogi disclaimer logika
- Sentiment/urgency scoring, language detection (HU/EN/DE)

**V4-ben újra kell írni (multi-tenant, új DB séma):**
- DB tábla: `email_messages` (v3: `emails`) — tenant_id-val, modul-tudatosan
- `modules/email/queries.py` — v4 db.fetch/fetchrow pattern
- `modules/email/router.py` — require_module("email_agent") dependency
- n8n workflow: WF-E1 (Gmail ingest) és WF-E2 (approved send) — v4 Docker env vars
- Frontend: EmailListPage + EmailDetailPage (v3 ApprovalPage inspirációval)

---

## Fázisok

---

## FÁZIS 1 — DB séma + Backend core

**Mit épít:** `email_messages` tábla, 5-rétegű agent engine portolása, alapvető CRUD endpoints.

**Érintett fájlok:**
```
backend/db/migrations/006_email_agent.sql    (ÚJ)
backend/modules/email/agents/__init__.py     (ÚJ)
backend/modules/email/agents/intake.py      (ÚJ - v3 port)
backend/modules/email/agents/knowledge.py   (ÚJ - v3 port, v4 Qdrant)
backend/modules/email/agents/drafting.py    (ÚJ - v3 port)
backend/modules/email/agents/compliance.py  (ÚJ - v3 port)
backend/modules/email/agents/action.py      (ÚJ - v3 port, v4 DB)
backend/modules/email/queries.py            (KITÖLT)
backend/modules/email/service.py            (KITÖLT)
backend/modules/email/router.py             (KITÖLT)
backend/main.py                             (MÓDOSÍTÁS - email_router uncomment)
```

---

### FÁZIS 1 — Claude Code prompt

```
You are implementing the Email Agent module for DocuAgent V4.
Reference files to study BEFORE writing any code:
- backend/modules/invoice/service.py (v4 patterns: db.fetch, log_action, metering)
- backend/modules/invoice/queries.py (v4 query patterns)
- backend/modules/invoice/router.py (require_module dependency pattern)
- backend/core/ai_engine.py (v4 AI call pattern)
- backend/core/feature_flags.py (require_module factory)
- backend/core/metering.py (increment_usage)
- backend/core/audit.py (log_action)

V3 reference files to port from (already in project as _ref_ files if present, otherwise check comments):
The 5-layer agent pipeline logic comes from v3:
  - agents/intake.py: entity extraction (invoice_ids, dates, amounts, urgency_signals, company_names)
  - agents/drafting.py: ClassificationOutput Pydantic model, _CLASSIFY_SYSTEM prompt, retry logic
  - agents/compliance.py: policy rule engine (complaint block, tax domain, conf_threshold check)
  - agents/action.py: DB persist + metering increment
  - routers/classify.py: pipeline orchestration (asyncio.gather for intake+knowledge parallel)
  - routers/classify.py: generate_reply endpoint with RAG context + HU_LEGAL_DISCLAIMER

## STEP 1: Create DB migration

Create file: db/migrations/006_email_agent.sql

```sql
-- DocuAgent V4 — Migration 006: Email Agent
CREATE TABLE IF NOT EXISTS email_messages (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    message_id      TEXT,                          -- Gmail Message-ID (idempotency)
    thread_id       TEXT,                          -- Gmail Thread-ID
    subject         TEXT NOT NULL DEFAULT '',
    sender          TEXT NOT NULL DEFAULT '',
    recipient       TEXT,
    body            TEXT,
    body_html       TEXT,
    category        TEXT DEFAULT 'other',          -- complaint|inquiry|appointment|other
    status          TEXT NOT NULL DEFAULT 'new',   -- new|classified|ai_answered|needs_attention|approved|sent|rejected
    urgent          BOOLEAN DEFAULT FALSE,
    urgency_score   INT DEFAULT 0,
    confidence      FLOAT DEFAULT 0,
    sentiment       TEXT DEFAULT 'neutral',        -- positive|neutral|negative|angry
    ai_response     TEXT,                          -- generated reply draft
    ai_decision     JSONB DEFAULT '{}',            -- full classification output
    source_docs     JSONB DEFAULT '[]',            -- RAG sources used
    rag_confidence  FLOAT,
    domain_tag      TEXT,                          -- tax|invoice|null
    senior_required BOOLEAN DEFAULT FALSE,
    booking_intent  BOOLEAN DEFAULT FALSE,
    language        TEXT DEFAULT 'HU',
    gmail_label_id  TEXT,                          -- Gmail label applied
    sent_at         TIMESTAMPTZ,
    approved_by     UUID REFERENCES users(id),
    approved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_email_tenant_status  ON email_messages(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_email_tenant_created ON email_messages(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_tenant_urgent  ON email_messages(tenant_id, urgent, urgency_score DESC);
CREATE INDEX IF NOT EXISTS idx_email_message_id     ON email_messages(message_id) WHERE message_id IS NOT NULL;

-- Email policy settings per tenant (extends tenant_settings pattern)
-- Stored in tenant_features.config JSONB for email_agent module
-- Default policy values documented here for reference:
-- {
--   "conf_threshold": 0.72,
--   "auto_reply_enabled": true,
--   "complaint_auto_reply": false,
--   "tax_routing_enabled": true,
--   "invoice_routing_enabled": true,
--   "entity_extraction_enabled": true,
--   "use_smart_model_for_reply": true,
--   "smart_model_threshold": 0.80,
--   "case_autolink_enabled": false,
--   "case_autolink_urgency_min": 50,
--   "hu_legal_disclaimer_enabled": true,
--   "senior_review_categories": []
-- }
```

Run migration:
```
docker exec -i docuagent_v4-postgres-1 psql -U postgres -d docuagent < db/migrations/006_email_agent.sql
```

## STEP 2: Create agent pipeline files

Create directory: backend/modules/email/agents/

Create backend/modules/email/agents/__init__.py (empty)

Create backend/modules/email/agents/intake.py
- Port EXACTLY from v3 agents/intake.py
- Keep: _EXTRACT_SYSTEM prompt, IntakeContext dataclass, _normalize_hu_dates, _normalize_hu_amounts, process()
- Change: import openai_service → from core.ai_engine import chat_raw (or whatever v4 AI call is)
- Study core/ai_engine.py first to understand the v4 chat interface

Create backend/modules/email/agents/knowledge.py
- Port from v3 agents/knowledge.py
- v4 change: use core.qdrant (or however v4 does RAG) instead of v3 qdrant_service
- Keep: KnowledgeContext dataclass, retrieve() function signature
- If v4 has no qdrant yet, return empty KnowledgeContext (safe fallback)

Create backend/modules/email/agents/drafting.py
- Port EXACTLY from v3 agents/drafting.py
- Keep: ClassificationOutput Pydantic model with all validators
- Keep: _CLASSIFY_SYSTEM prompt template
- Keep: DraftResult dataclass
- Keep: classify() with retry logic (2 attempts, fallback to mini model)
- Change: openai_service.chat → v4 AI call pattern

Create backend/modules/email/agents/compliance.py
- Port EXACTLY from v3 agents/compliance.py
- Keep: ComplianceDecision dataclass
- Keep: evaluate() function with all 5 rules
- Keep: TAX_KEYWORDS, INVOICE_KEYWORDS, TAX_ADVICE_TRIGGERS
- Keep: HU_LEGAL_DISCLAIMER constant
- Keep: should_add_disclaimer()
- No v4 changes needed (pure logic, no DB calls)

Create backend/modules/email/agents/action.py
- Port from v3 agents/action.py
- v4 change: import core.database as db (instead of db.database)
- v4 change: DB update uses email_messages table (not emails)
- Remove CRM case auto-link for now (crm_module not yet built in v4) — log a TODO
- Keep: ActionResult dataclass, execute() function structure

## STEP 3: Create queries.py

Create backend/modules/email/queries.py with these functions:
(Follow exact same pattern as modules/invoice/queries.py)

```python
import core.database as db

async def ingest_email(tenant_id, message_id, subject, sender, body, recipient=None, thread_id=None, body_html=None):
    """Idempotent insert — returns (row_id, was_new: bool)"""
    # INSERT ... ON CONFLICT (tenant_id, message_id) DO NOTHING
    # RETURNING id
    # If no row returned, fetch existing

async def get_email(email_id: str, tenant_id: str) -> dict | None:
    """Single email by id, scoped to tenant"""

async def list_emails(tenant_id: str, status=None, limit=50, offset=0) -> tuple[list, int]:
    """List emails with optional status filter, returns (rows, total_count)"""

async def get_approval_queue(tenant_id: str, limit=50) -> list:
    """NEEDS_ATTENTION emails ordered by urgency_score DESC"""

async def update_classification(email_id: str, category: str, status: str, ai_decision: dict, confidence: float, urgency_score: int, sentiment: str, domain_tag: str = None, senior_required: bool = False, booking_intent: bool = False):
    """Update after classify pipeline"""

async def update_reply(email_id: str, reply_text: str, source_docs: list = None, rag_confidence: float = None):
    """Save generated reply draft"""

async def approve_email(email_id: str, tenant_id: str, approved_by_user_id: str) -> bool:
    """Set status=approved, approved_by, approved_at"""

async def reject_email(email_id: str, tenant_id: str) -> bool:
    """Set status=rejected"""

async def mark_sent(email_id: str) -> bool:
    """Set status=sent, sent_at=NOW()"""
```

## STEP 4: Create service.py

Create backend/modules/email/service.py with:

```python
async def get_email_policy(tenant_id: str) -> dict:
    """Load email policy from tenant_features.config for email_agent module.
    Falls back to safe defaults if not configured."""

async def classify_email(email_id: str, tenant_id: str) -> dict:
    """
    Full 5-layer pipeline:
    1. Load email from DB
    2. Load policy
    3. Layer 1+2: asyncio.gather(intake.process(), knowledge.retrieve())
    4. Layer 3: drafting.classify()
    5. Layer 4: compliance.evaluate()
    6. Layer 5: action.execute() — DB persist
    7. metering.increment_usage(tenant_id, 'email_agent', 'emails_processed')
    8. log_action audit
    Returns classification result dict
    """

async def generate_reply(email_id: str, tenant_id: str) -> dict:
    """
    Generate AI reply for an email:
    1. Load email from DB
    2. RAG search in tenant's knowledge base
    3. Call AI with system prompt + RAG context
    4. Apply HU_LEGAL_DISCLAIMER if tax domain
    5. Save reply to DB via queries.update_reply()
    Returns {reply, language, sources, latency_ms}
    """

async def ingest_email(tenant_id: str, payload: dict) -> dict:
    """
    Receive email from n8n webhook:
    1. queries.ingest_email() — idempotent
    2. If new: trigger classify_email() in background
    3. Return {id, was_new, status}
    """
```

## STEP 5: Create router.py

Create backend/modules/email/router.py:

```python
from fastapi import APIRouter, Depends, HTTPException
from core.security import get_current_user, require_role
from core.feature_flags import require_module
import modules.email.service as service
import modules.email.queries as queries

router = APIRouter(prefix="/email", tags=["Email Agent"])
_mod = Depends(require_module("email_agent"))

# POST /email/ingest  — called by n8n WF-E1 (uses API key auth, not JWT)
# POST /email/classify/{id}  — manual re-classify
# POST /email/reply/{id}  — generate reply
# POST /email/{id}/approve  — approve reply, trigger n8n WF-E2
# POST /email/{id}/reject
# PATCH /email/{id}/status
# GET  /email/list
# GET  /email/approval-queue
# GET  /email/{id}
```

For the /ingest endpoint: accept BOTH X-API-Key (n8n) and JWT Bearer (testing).
After approve: call n8n WF-E2 webhook with {email_id, reply, recipient, subject}.
Read N8N_EMAIL_SEND_WEBHOOK from env.

## STEP 6: Register router in main.py

In backend/main.py, uncomment and add:
```python
from modules.email.router import router as email_router
app.include_router(email_router)
```

## STEP 7: Enable email_agent module for the gmail tenant

```
docker exec -i docuagent_v4-postgres-1 psql -U postgres -d docuagent -c "
INSERT INTO tenant_features (tenant_id, module, enabled)
SELECT id, 'email_agent', TRUE FROM tenants WHERE slug='gmail'
ON CONFLICT (tenant_id, module) DO UPDATE SET enabled=TRUE;"
```

## VERIFICATION TESTS for Phase 1

After completing all steps, run these tests:

### Test 1: DB migration
```
docker exec -i docuagent_v4-postgres-1 psql -U postgres -d docuagent -c "\d email_messages"
```
Expected: table with all columns listed

### Test 2: Backend starts without error
```
uvicorn main:app --reload --port 8001
```
Expected: no ImportError, "Application startup complete"

### Test 3: Email ingest endpoint
```powershell
$token = (Invoke-RestMethod -Method POST -Uri "http://localhost:8001/core/auth/login" -ContentType "application/json" -Body '{"email":"huszar.viktor.85@gmail.com","password":"admin123"}').access_token

Invoke-RestMethod -Method POST -Uri "http://localhost:8001/email/ingest" -ContentType "application/json" -Headers @{Authorization="Bearer $token"} -Body '{
  "message_id": "test-001",
  "subject": "Kérdésem van a számlázással kapcsolatban",
  "sender": "teszt.ugyfel@example.com",
  "body": "Tisztelt Ügyfélszolgálat! Szeretnék érdeklődni, hogy a legutóbbi számlám mikor kerül kiküldésre. Köszönettel."
}'
```
Expected: `{"id": "...", "was_new": true, "status": "new"}`

### Test 4: Classify endpoint
```powershell
# Use the id from Test 3
Invoke-RestMethod -Method POST -Uri "http://localhost:8001/email/classify/{ID_FROM_TEST_3}" -ContentType "application/json" -Headers @{Authorization="Bearer $token"} -Body '{}'
```
Expected: `{"status": "ai_answered" or "needs_attention", "confidence": 0.xx, "category": "inquiry", "urgency_score": ...}`

### Test 5: List endpoint
```powershell
Invoke-RestMethod -Method GET -Uri "http://localhost:8001/email/list" -Headers @{Authorization="Bearer $token"}
```
Expected: `{"emails": [...], "total": 1}`

### Test 6: Module guard
```powershell
# Try accessing from a tenant that doesn't have email_agent enabled
# Should return 403 {"error": "module_disabled", "module": "email_agent"}
```
```

---

## FÁZIS 2 — n8n Workflows (WF-E1 + WF-E2)

**Mit épít:** Gmail → backend ingest webhook (WF-E1), Jóváhagyott email küldés (WF-E2).

**Érintett fájlok:**
```
n8n/workflows/WF-E1-email-ingest.json    (ÚJ)
n8n/workflows/WF-E2-email-send.json      (ÚJ)
.env                                      (ÚJ változók)
```

**Szükséges .env változók:**
```
N8N_EMAIL_SEND_WEBHOOK=http://n8n:5678/webhook/email-send
GMAIL_CREDENTIALS_ID=<n8n credential id>
```

---

### FÁZIS 2 — Claude Code prompt

```
You are implementing n8n workflows for the Email Agent module in DocuAgent V4.

## Context
- n8n runs in Docker, internal hostname: n8n:5678
- Backend internal URL: backend:8000 (or http://host.docker.internal:8001 if backend runs locally)
- Auth: DOCUAGENT_API_KEY environment variable → X-API-Key header
- All n8n expression syntax uses {{ }} (NO = prefix)
- Production webhooks: /webhook/path (NOT /webhook-test/path)
- Workflow JSON must be standalone objects (NOT wrapped in {"workflows": [...]})

## WF-E1: Gmail Ingest Workflow

Create file: n8n/workflows/WF-E1-email-ingest.json

Flow:
  Gmail Trigger (new email)
    → HTTP Request: POST {{$env.BACKEND_URL}}/email/ingest
      Body: {
        message_id: {{ $json.id }},
        thread_id: {{ $json.threadId }},
        subject: {{ $json.subject }},
        sender: {{ $json.from }},
        recipient: {{ $json.to }},
        body: {{ $json.text }},
        body_html: {{ $json.html }}
      }
      Headers: { X-API-Key: {{ $env.DOCUAGENT_API_KEY }} }
    → IF was_new == true:
        → HTTP Request: POST {{$env.BACKEND_URL}}/email/classify/{{ $json.id }}
          Headers: { X-API-Key: {{ $env.DOCUAGENT_API_KEY }} }

Gmail Trigger config:
- pollTimes: every 1 minute
- filters: INBOX only, UNREAD only

## WF-E2: Email Send Workflow

Create file: n8n/workflows/WF-E2-email-send.json

Flow:
  Webhook (POST /webhook/email-send)
    → Gmail: Send Email
      To: {{ $json.body.recipient }}
      Subject: Re: {{ $json.body.subject }}
      Body: {{ $json.body.reply }}
    → HTTP Request: PATCH {{$env.BACKEND_URL}}/email/{{ $json.body.email_id }}/status
      Body: { status: "sent" }
      Headers: { X-API-Key: {{ $env.DOCUAGENT_API_KEY }} }

## Add to .env file

Add these lines to the root .env:
```
N8N_EMAIL_SEND_WEBHOOK=http://n8n:5678/webhook/email-send
BACKEND_URL=http://backend:8000
```

## VERIFICATION TESTS for Phase 2

### Test 1: WF-E2 webhook responds
```powershell
Invoke-RestMethod -Method POST -Uri "http://localhost:5678/webhook/email-send" -ContentType "application/json" -Body '{
  "email_id": "test-id",
  "recipient": "test@example.com",
  "subject": "Test",
  "reply": "Test reply"
}'
```
Expected: 200 response (even if Gmail send fails due to no credentials, the webhook should accept)

### Test 2: WF-E1 imported and active
In n8n UI (localhost:5678): WF-E1 visible and status = Active

### Test 3: Manual ingest + classify end-to-end
```powershell
$token = (Invoke-RestMethod -Method POST -Uri "http://localhost:8001/core/auth/login" -ContentType "application/json" -Body '{"email":"huszar.viktor.85@gmail.com","password":"admin123"}').access_token

# Ingest
$ingest = Invoke-RestMethod -Method POST -Uri "http://localhost:8001/email/ingest" -ContentType "application/json" -Headers @{Authorization="Bearer $token"} -Body '{
  "message_id": "e2e-test-002",
  "subject": "Reklamáció: hibás termék érkezett",
  "sender": "morgo.ugyfél@test.hu",
  "body": "Ez teljesen elfogadhatatlan! A termék törve érkezett és azonnali visszatérítést követelek!"
}'

# Classify
$classify = Invoke-RestMethod -Method POST -Uri "http://localhost:8001/email/classify/$($ingest.id)" -Headers @{Authorization="Bearer $token"}
Write-Host "Category: $($classify.category)"
Write-Host "Status: $($classify.status)"
Write-Host "Sentiment: $($classify.sentiment)"
```
Expected: category=complaint, status=needs_attention, sentiment=angry/negative
```

---

## FÁZIS 3 — Frontend

**Mit épít:** EmailListPage (inbox view), EmailDetailPage (classify + reply szerkesztő + jóváhagyás gomb).

**Érintett fájlok:**
```
frontend/src/modules/email/EmailPage.jsx         (KITÖLT)
frontend/src/modules/email/EmailListPage.jsx     (ÚJ)
frontend/src/modules/email/EmailDetailPage.jsx   (ÚJ)
frontend/src/modules/email/components/EmailCard.jsx     (ÚJ)
frontend/src/modules/email/components/ReplyEditor.jsx   (ÚJ - v3 port)
frontend/src/App.jsx                             (MÓDOSÍTÁS - uncomment email route)
```

**V3-ból portolható:**
- `ReplyEditor.jsx` komponens — szerkesztő gombokkal (v3 components/ReplyEditor.jsx)
- `ApprovalPage.jsx` UI logika — confidence bar, urgency badge, rag_sources megjelenítés

---

### FÁZIS 3 — Claude Code prompt

```
You are implementing the Email Agent frontend for DocuAgent V4.

## Context
- Stack: React, Vite, Tailwind CSS
- Existing UI components: src/components/ui/ (Badge, Button, Card, ConfidenceBar, Table, EmptyState)
- Auth: useAuth() hook from @/core/auth/AuthContext
- API: import { api } from "@/core/api" (axios with JWT interceptor)
- Design reference: src/modules/invoice/InvoiceList.jsx and InvoiceQueue.jsx for style patterns
- The sidebar already has Email Agent nav item pointing to /email

## Files to study first:
- src/modules/invoice/InvoiceList.jsx (list page pattern)
- src/modules/invoice/InvoiceQueue.jsx (approval queue pattern)
- src/components/ui/ConfidenceBar.jsx (confidence display)
- src/pages/ApprovalsPage.jsx (approval action pattern)

## V3 reference for UI patterns (recreate, don't copy directly):
- V3 ApprovalPage.jsx had: email list left panel, detail right panel, RAG sources section
- V3 ReplyEditor.jsx had: textarea with Approve/Reject/Edit buttons

## STEP 1: Create EmailPage.jsx (tab shell)

src/modules/email/EmailPage.jsx
- Two tabs: "Beérkező" (inbox/list) and "Jóváhagyásra vár" (approval queue)
- Tab switching with URL state or useState
- Renders EmailListPage or ApprovalQueueView based on active tab

## STEP 2: Create EmailListPage.jsx

src/modules/email/EmailListPage.jsx

Features:
- Table: sender, subject, category badge, status badge, urgency score, confidence bar, created_at
- Status filter dropdown: all | new | classified | ai_answered | needs_attention | approved | sent
- Click row → navigate to /email/{id}
- Refresh button
- Empty state when no emails
- Color coding: urgent=red border, needs_attention=amber, ai_answered=green

Status badge colors:
- new: gray
- classified: blue  
- ai_answered: green
- needs_attention: amber
- approved: indigo
- sent: emerald
- rejected: red

Category badge colors:
- complaint: red
- inquiry: blue
- appointment: purple
- other: gray

Sentiment indicator (small dot):
- positive: green
- neutral: gray
- negative: amber
- angry: red

## STEP 3: Create EmailDetailPage.jsx

src/modules/email/EmailDetailPage.jsx

Layout (two-column on desktop, stacked on mobile):
LEFT COLUMN (60%):
- Email header: sender, subject, created_at, urgency badge (if score > 50)
- Email body (scrollable, preserve whitespace)
- Classification info: category, sentiment, confidence, domain_tag
- Entity extraction panel (if ai_decision has entities): invoice_ids, amounts, dates

RIGHT COLUMN (40%):
- Status card
- AI Reply section:
  - If no reply yet + status is needs_attention: "Generate Reply" button → POST /email/reply/{id}
  - If reply exists: editable textarea (ReplyEditor)
  - RAG sources (if source_docs not empty): filename + score pills
- Action buttons:
  - "Jóváhagyás és küldés" (Approve): POST /email/{id}/approve → green, requires reply exists
  - "Elutasítás" (Reject): POST /email/{id}/reject → red, with confirmation
  - "Újraosztályozás" (Re-classify): POST /email/classify/{id} → gray outline

## STEP 4: Create ReplyEditor.jsx component

src/modules/email/components/ReplyEditor.jsx
- Textarea for editing the AI draft reply
- Character count
- "Változtatások mentése" button (saves to local state, not yet to DB)
- Controlled component: value + onChange props

## STEP 5: Update App.jsx

Uncomment the email route:
```jsx
import EmailPage from "@/modules/email/EmailPage"
// ...
<Route path="/email/*" element={<ModuleRoute module="email_agent"><EmailPage /></ModuleRoute>} />
```

Also add sub-routes for email detail:
```jsx
import EmailDetailPage from "@/modules/email/EmailDetailPage"
// Inside /email/* route:
<Route path="/email" element={<EmailPage />} />
<Route path="/email/:id" element={<EmailDetailPage />} />
```

## VERIFICATION TESTS for Phase 3

### Test 1: Email list renders
Navigate to http://localhost:5173/email
Expected: Email inbox page loads, shows table with emails from Phase 1 tests

### Test 2: Detail page renders
Click on an email row
Expected: /email/{id} loads with email body and classification info

### Test 3: Generate reply
On a classified email, click "Választ generál"
Expected: Loading state → reply appears in textarea

### Test 4: Approve flow
With a reply generated, click "Jóváhagyás és küldés"
Expected: Status changes to "approved", success toast/message

### Test 5: Approval queue tab
Click "Jóváhagyásra vár" tab
Expected: Only needs_attention emails shown, ordered by urgency_score DESC

### Test 6: Module guard
Log in as a user whose tenant does NOT have email_agent enabled
Expected: /email route shows "Module not available" or redirects (ModuleRoute behavior)
```

---

## Ajánlott végrehajtási sorrend

1. **Fázis 1** fut le először — backend + DB nélkül semmi más nem működik
2. **Fázis 3** futhat Fázis 2 nélkül is — n8n nélkül is tesztelhető manuális ingest-tel
3. **Fázis 2** utoljára — Gmail credential kell hozzá, de a logika már készen lesz

## Kritikus megjegyzések Claude Code számára

- A v4 AI hívás pattern: tanulmányozd `core/ai_engine.py`-t mielőtt az agent fájlokat írod
- A `message_id` UNIQUE constraint tenant_id-val együtt van — idempotens ingest kell
- Az approve endpoint n8n WF-E2-t hív — ha N8N_EMAIL_SEND_WEBHOOK nincs beállítva, log warning de ne throw exception
- A compliance.py TAX_KEYWORDS és INVOICE_KEYWORDS listákat a v3-ból kell átvenni (policy_engine.py-ban voltak)
- A `senior_required` flag nem blokkolja a reply generálást, csak jelzi hogy senior review kell
- Frontend: a ConfidenceBar komponens már létezik — használd, ne írj újat
