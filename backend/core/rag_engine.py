"""
RAG Engine for DocuAgent V4.
Vector search and document ingestion via Qdrant.
"""
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional

import httpx
from core.config import QDRANT_URL
from core.ai_engine import embed

log = logging.getLogger("docuagent")
VECTOR_SIZE = 1536   # text-embedding-3-small


def _tenant_collection(tenant_id: str, domain: str) -> str:
    """Tenant-specific collection name: {tenant_id[:8]}_{domain}."""
    return f"{tenant_id[:8]}_{domain}"


async def ensure_collection(name: str) -> bool:
    """Creates a Qdrant collection if it does not yet exist."""
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(f"{QDRANT_URL}/collections/{name}")
            if r.status_code == 200:
                return True
            r2 = await c.put(
                f"{QDRANT_URL}/collections/{name}",
                json={"vectors": {"size": VECTOR_SIZE, "distance": "Cosine"}},
            )
            ok = r2.status_code in (200, 201)
            if ok:
                log.info(f"Qdrant collection created: '{name}'")
            return ok
    except Exception as e:
        log.warning(f"ensure_collection({name}) error: {e}")
        return False


async def search(
    query_text: str,
    collection: str,
    tenant_id: Optional[str] = None,
    top_k: int = 3,
    score_threshold: float = 0.35,
) -> list[dict]:
    """
    Semantic search in a Qdrant collection.
    If tenant_id is provided, filters by tenant payload field.
    Returns structured result list with source metadata.
    """
    vector = await embed(query_text)

    body: dict = {"vector": vector, "limit": top_k, "with_payload": True}
    if tenant_id:
        body["filter"] = {
            "must": [{"key": "tenant_id", "match": {"value": tenant_id}}]
        }

    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"{QDRANT_URL}/collections/{collection}/points/search",
            json=body,
        )
        raw = r.json().get("result", [])

    results = []
    for item in raw:
        score = item.get("score", 0)
        if score < score_threshold:
            continue
        payload = item.get("payload", {})
        results.append({
            "score":       round(score, 3),
            "text":        payload.get("text", ""),
            "filename":    payload.get("filename", "unknown"),
            "collection":  payload.get("collection", collection),
            "tag":         payload.get("tag", ""),
            "doc_id":      payload.get("doc_id", ""),
            "chunk_index": payload.get("chunk_index", 0),
        })

    return results


async def ingest(
    text: str,
    metadata: dict,
    collection: str,
    tenant_id: str,
) -> str:
    """
    Chunk, embed, and store a document in Qdrant.
    metadata: {filename, doc_id, tag, department, access_level, uploader}
    Returns collection name.
    """
    await ensure_collection(collection)

    doc_id   = metadata.get("doc_id", str(uuid.uuid4()))
    filename = metadata.get("filename", "unknown")
    chunks   = [text[i:i+1400] for i in range(0, min(len(text), 12000), 1400)]
    points   = []

    async with httpx.AsyncClient(timeout=60) as client:
        for i, chunk in enumerate(chunks):
            vector = await embed(chunk)
            points.append({
                "id": str(uuid.uuid4()),
                "vector": vector,
                "payload": {
                    "tenant_id":    tenant_id,
                    "filename":     filename,
                    "text":         chunk,
                    "tag":          metadata.get("tag", "general"),
                    "collection":   collection,
                    "department":   metadata.get("department", ""),
                    "access_level": metadata.get("access_level", "internal"),
                    "uploader":     metadata.get("uploader", ""),
                    "doc_id":       doc_id,
                    "chunk_index":  i,
                    "total_chunks": len(chunks),
                    "upload_time":  datetime.now(timezone.utc).isoformat(),
                },
            })

        r = await client.put(
            f"{QDRANT_URL}/collections/{collection}/points",
            json={"points": points},
        )
        ok = r.status_code == 200
        log.info(f"Qdrant ingest: {filename} → '{collection}' ({len(chunks)} chunks, ok={ok})")

    return collection


async def delete_by_doc_id(
    doc_id: str,
    collection: Optional[str] = None,
    tenant_id: Optional[str] = None,
) -> int:
    """
    Delete all vectors for a given doc_id.
    If collection is given, only deletes there.
    If tenant_id is given without collection, deletes across all tenant collections.
    Returns count of collections touched.
    """
    if collection:
        collections_to_search = [collection]
    elif tenant_id:
        # Derive all possible tenant collections from known domains
        domains = ["general", "billing", "support", "legal", "hr"]
        collections_to_search = [_tenant_collection(tenant_id, d) for d in domains]
    else:
        collections_to_search = ["general"]

    deleted_total = 0
    async with httpx.AsyncClient(timeout=20) as client:
        for col in collections_to_search:
            try:
                r = await client.post(
                    f"{QDRANT_URL}/collections/{col}/points/delete",
                    json={"filter": {"must": [{"key": "doc_id", "match": {"value": doc_id}}]}}
                )
                if r.status_code == 200:
                    deleted_total += 1
                    log.info(f"Qdrant delete: doc_id={doc_id} collection={col}")
            except Exception as e:
                log.warning(f"Qdrant delete error ({col}): {e}")

    return deleted_total
