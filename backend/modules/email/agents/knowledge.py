"""
Knowledge Layer — RAG retrieval.

Runs concurrently with intake.py entity extraction.
v4: Qdrant not yet integrated — returns empty KnowledgeContext (safe fallback).
     Wire up core.qdrant here once available.
"""
import logging
from dataclasses import dataclass, field
from typing import Optional

log = logging.getLogger("docuagent")


@dataclass
class KnowledgeContext:
    results: list = field(default_factory=list)
    top_score: float = 0.0
    sources: list = field(default_factory=list)
    context_text: str = ""
    feedback_ctx: str = ""


async def retrieve(
    subject: str,
    body: str,
    policy: dict,
    tenant_id: Optional[str] = None,
) -> KnowledgeContext:
    """
    RAG search in tenant's knowledge base.
    Returns empty KnowledgeContext until Qdrant is wired up in v4.
    """
    # TODO: integrate core.qdrant once available in v4
    return KnowledgeContext()
