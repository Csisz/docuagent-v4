# Email Agent router - /email/* endpoints
# Port from: V3 routers/emails.py + routers/classify.py
# All routes require: Depends(require_module('email_agent'))
#
# Endpoints:
#   POST /email/ingest          -> receive email from n8n (idempotent by message_id)
#   POST /email/classify/{id}   -> classify a specific email
#   POST /email/reply/{id}      -> generate AI reply
#   POST /email/{id}/approve    -> approve and send reply
#   PATCH /email/{id}/status    -> update status
#   GET  /email/list            -> list with filters
#   GET  /email/approval-queue  -> NEEDS_ATTENTION emails