"""Network-free tests for honest evidence retrieval provenance."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sliderule_llm.evidence import (  # noqa: E402
    EvidenceRetriever,
    EvidenceRetrievalResult,
    EvidenceSource,
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


def test_retrieved_sources_are_marked_retrieved():
    retriever = EvidenceRetriever(
        vector_client=make_vector_client(
            {
                "result": [
                    {
                        "id": "chunk-1",
                        "score": 0.88,
                        "payload": {
                            "content": "desk upgrade experiment evidence",
                            "sourceId": "doc-1",
                            "title": "Playtest notes",
                        },
                    }
                ]
            }
        ),
        embedding_provider=FakeEmbeddingProvider(),
    )

    result = retriever.retrieve("desk progression evidence")

    assert result.provenance == "retrieved"
    assert result.fallback_reason is None
    assert result.sources[0].provenance == "retrieved"
    assert result.sources[0].source_id == "doc-1"
    assert result.sources[0].score == 0.88
    assert result.sources_as_dicts()[0]["snippet"] == "desk upgrade experiment evidence"


def test_empty_retrieval_is_explicit_fallback_not_fake_rag():
    retriever = EvidenceRetriever(
        vector_client=make_vector_client({"result": []}),
        embedding_provider=FakeEmbeddingProvider(),
    )

    result = retriever.retrieve("unknown evidence")

    assert result.provenance == "fallback"
    assert result.fallback_reason == "no_retrieval_hits"
    assert result.sources[0].provenance == "fallback"
    assert result.sources[0].fallback_reason == "no_retrieval_hits"


def test_vector_error_is_explicit_fallback():
    retriever = EvidenceRetriever(
        vector_client=make_vector_client(error=VectorClientUnavailable("down")),
        embedding_provider=FakeEmbeddingProvider(),
    )

    result = retriever.retrieve("query")

    assert result.provenance == "fallback"
    assert result.fallback_reason == "vector_unavailable:VectorClientUnavailable"
    assert result.sources_as_dicts()[0]["provenance"] == "fallback"


def test_embedding_error_is_explicit_fallback():
    retriever = EvidenceRetriever(
        vector_client=make_vector_client({"result": []}),
        embedding_provider=FakeEmbeddingProvider(error=RuntimeError("embed failed")),
    )

    result = retriever.retrieve("query")

    assert result.provenance == "fallback"
    assert result.fallback_reason == "retrieval_failed:RuntimeError"


def test_generated_sources_are_not_marked_retrieved():
    sources = generated_sources_from_content(
        "## Grounding references\n- generated planning reference from model prose"
    )

    assert sources[0].provenance == "generated"
    assert sources[0].fallback_reason == "llm_prose_only"
    assert sources[0].to_dict()["provenance"] == "generated"


def test_fallback_evidence_contains_reason():
    result = fallback_evidence("desk progression", reason="manual")

    assert result.provenance == "fallback"
    assert result.sources[0].fallback_reason == "manual"
    assert "not as real RAG retrieval" in result.sources[0].snippet


def test_sources_as_dicts_keeps_optional_retrieval_fields():
    result = EvidenceRetrievalResult(
        provenance="retrieved",
        sources=[
            EvidenceSource(
                title="Title",
                snippet="Snippet",
                provenance="retrieved",
                source_id="src-1",
                score=0.7,
                metadata={"sourceType": "document"},
            )
        ],
    )

    data = result.sources_as_dicts()[0]
    assert data["sourceId"] == "src-1"
    assert data["score"] == 0.7
    assert data["metadata"] == {"sourceType": "document"}
