# Invoice Agent router - /invoice/* endpoints
# Port extraction logic from: _ref_invoice_workflow.py
# All routes require: Depends(require_module('invoice_agent'))
#
# Endpoints:
#   POST /invoice/extract       -> extract invoice data
#   GET  /invoice/list          -> paginated list with filters
#   GET  /invoice/{id}          -> detail + approval status
#   PUT  /invoice/{id}          -> human edit/correction
#   POST /invoice/{id}/verify   -> human approval
#   POST /invoice/{id}/export   -> export to Billingo or Szamlazz
#   GET  /invoice/stats         -> monthly summary