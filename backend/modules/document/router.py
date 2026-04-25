# Document Agent router - /document/* endpoints
# Port from: V3 routers/documents.py
# All routes require: Depends(require_module('document_agent'))
#
# Endpoints:
#   POST /document/upload         -> upload + OCR + RAG ingest
#   GET  /document/{id}           -> detail, summary, key_data
#   POST /document/{id}/summarize -> generate or refresh summary
#   POST /document/{id}/query     -> RAG question on this document
#   POST /document/search         -> cross-document RAG search
#   GET  /document/list           -> document library