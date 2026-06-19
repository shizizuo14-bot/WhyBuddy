"""Runtime provenance contract: retrieved / fallback / generated / degraded stay honest."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sliderule_llm.evidence import (  # noqa: E402
    DEGRADED_PROVENANCE,
    EVIDENCE_RUNTIME_PROVENANCE,
    FALLBACK_PROVENANCE,
    GENERATED_PROVENANCE,
    RETRIEVED_PROVENANCE,
    EvidenceRetriever,
    degraded_evidence,
    fallback_evidence,
    generated_sources_from_content,
)
from sliderule_llm.vector import QdrantVectorClient, VectorClientUnavailable, VectorConfig  # noqa: E402


class FakeEmbeddingProvider:
    def __init__(self, vector=None, error=None):
        self.vector = vector or [0.1, 0.2]
        self.error = error

    def embed_query(self, text):
        if self.error:
            raise self.error
        assert text
        return self.vector


class FakeTransport:
    def __init__(self, response=None, error=None):
        self.response = response or {}
        self.error = error

    def __call__(self, method, url, body, headers, timeout_ms):
        if self.error:
            raise self.error
        return self.response


def make_vector_client(response=None, error=None):
    return QdrantVectorClient(
        VectorConfig("http://qdrant.test", "knowledge", "", 1000, 2),
        transport=FakeTransport(response=response, error=error),
    )


def test_runtime_provenance_values_are_explicit_and_disjoint():
    assert EVIDENCE_RUNTIME_PROVENANCE == {
        RETRIEVED_PROVENANCE,
        FALLBACK_PROVENANCE,
        GENERATED_PROVENANCE,
        DEGRADED_PROVENANCE,
    }


def test_retrieved_runtime_provenance_keeps_vector_fields():
    retriever = EvidenceRetriever(
        vector_client=make_vector_client(
            {
                "result": [
                    {
                        "id": "chunk-runtime",
                        "score": 0.95,
                        "payload": {
                            "content": "runtime retrieved evidence",
                            "sourceId": "doc-runtime",
                            "title": "Runtime fixture",
                        },
                    }
                ]
            }
        ),
        embedding_provider=FakeEmbeddingProvider(),
    )

    result = retriever.retrieve("runtime retrieved query")

    assert result.provenance == RETRIEVED_PROVENANCE
    assert result.fallback_reason is None
    assert result.error is None
    payload = result.to_payload_fields()
    assert payload["evidenceProvenance"] == RETRIEVED_PROVENANCE
    assert payload["sources"][0]["provenance"] == RETRIEVED_PROVENANCE
    assert payload["sources"][0]["sourceId"] == "doc-runtime"
    assert "fallbackReason" not in payload
    assert "error" not in payload


def test_fallback_runtime_provenance_is_not_retrieved():
    retriever = EvidenceRetriever(
        vector_client=make_vector_client({"result": []}),
        embedding_provider=FakeEmbeddingProvider(),
    )

    result = retriever.retrieve("no hits")

    assert result.provenance == FALLBACK_PROVENANCE
    assert result.fallback_reason == "no_retrieval_hits"
    assert result.error is None
    payload = result.to_payload_fields()
    assert payload["evidenceProvenance"] == FALLBACK_PROVENANCE
    assert payload["fallbackReason"] == "no_retrieval_hits"
    assert payload["sources"][0]["provenance"] == FALLBACK_PROVENANCE
    assert payload["evidenceProvenance"] != RETRIEVED_PROVENANCE


def test_vector_unavailable_stays_fallback_not_degraded():
    retriever = EvidenceRetriever(
        vector_client=make_vector_client(error=VectorClientUnavailable("down")),
        embedding_provider=FakeEmbeddingProvider(),
    )

    result = retriever.retrieve("query")

    assert result.provenance == FALLBACK_PROVENANCE
    assert result.fallback_reason == "vector_unavailable:VectorClientUnavailable"
    assert result.error is None
    assert result.sources


def test_generated_runtime_provenance_is_not_retrieved():
    sources = generated_sources_from_content(
        "## Grounding references\n- generated planning reference from model prose"
    )

    assert sources[0].provenance == GENERATED_PROVENANCE
    assert sources[0].fallback_reason == "llm_prose_only"
    source_dict = sources[0].to_dict()
    assert source_dict["provenance"] == GENERATED_PROVENANCE
    assert source_dict["fallbackReason"] == "llm_prose_only"
    assert "sourceId" not in source_dict
    assert source_dict["provenance"] != RETRIEVED_PROVENANCE


def test_degraded_runtime_provenance_has_error_and_no_fake_sources():
    result = degraded_evidence(
        "desk progression",
        error="retrieval_runtime_failed",
        reason="embedding_timeout",
    )

    assert result.provenance == DEGRADED_PROVENANCE
    assert result.error == "retrieval_runtime_failed"
    assert result.fallback_reason == "embedding_timeout; query=desk progression"
    assert result.sources == []
    payload = result.to_payload_fields()
    assert payload["evidenceProvenance"] == DEGRADED_PROVENANCE
    assert payload["error"] == "retrieval_runtime_failed"
    assert payload["fallbackReason"] == "embedding_timeout; query=desk progression"
    assert payload["sources"] == []
    assert payload["evidenceProvenance"] != RETRIEVED_PROVENANCE
    assert payload["evidenceProvenance"] != FALLBACK_PROVENANCE


def test_fallback_evidence_is_not_degraded():
    result = fallback_evidence("desk progression", reason="no_retrieval_hits")

    assert result.provenance == FALLBACK_PROVENANCE
    assert result.error is None
    assert result.sources
    assert result.provenance != DEGRADED_PROVENANCE
