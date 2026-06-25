"""Contract tests for web AIGC file adapter result shapes.

This slice deliberately uses a fake runtime. It proves that Python can
describe file generation, file slicing, file translation, excel read, and long
text extraction outcomes without reading user files, writing artifacts, or
calling OCR/LLM/translation services.
"""

import os
import sys

import pytest
from pydantic import ValidationError

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.web_aigc_file_adapter import (  # noqa: E402
    FILE_ADAPTER_CONTRACT_VERSION,
    FileAdapterArtifactResponse,
    FileAdapterErrorResponse,
    execute_fake_file_adapter,
)


def test_file_generation_success_returns_stable_artifact_without_writing_files():
    response = execute_fake_file_adapter(
        {
            "kind": "file_generation",
            "operation": "generated",
            "filename": "report.md",
            "content": "# Report\n\nContract output.",
            "artifactId": "artifact-report-1",
            "permission": {"allowed": True, "auditId": "audit-file-gen-1"},
        }
    ).model_dump(exclude_none=True)

    assert response["ok"] is True
    assert response["contractVersion"] == FILE_ADAPTER_CONTRACT_VERSION
    assert response["kind"] == "file_generation"
    assert response["operation"] == "generated"
    assert response["status"] == "success"
    assert response["file"]["filename"] == "report.md"
    assert response["file"]["content"] == "# Report\n\nContract output."
    assert response["artifact"] == {
        "artifactId": "artifact-report-1",
        "kind": "file",
        "name": "report.md",
        "path": "memory://web-aigc-file-adapter/artifact-report-1/report.md",
        "mimeType": "text/markdown",
        "sizeBytes": 26,
        "persisted": False,
    }
    assert response["provenance"] == {
        "provider": "fake",
        "runtime": "python-contract",
        "kind": "file_generation",
        "operation": "generated",
        "permission": {"allowed": True, "auditId": "audit-file-gen-1"},
    }


def test_file_slicing_success_returns_chunks_and_no_artifact():
    response = execute_fake_file_adapter(
        {
            "kind": "file_slicing",
            "operation": "sliced",
            "filename": "notes.txt",
            "content": "alpha beta gamma delta epsilon zeta",
            "maxChars": 12,
        }
    ).model_dump(exclude_none=True)

    assert response["ok"] is True
    assert response["kind"] == "file_slicing"
    assert response["operation"] == "sliced"
    assert response["status"] == "success"
    assert response["file"]["filename"] == "notes.txt"
    assert response["slices"][0]["sliceId"] == "slice-1"
    assert response["slices"][0]["content"]
    assert response["metrics"]["sliceCount"] == len(response["slices"])
    assert "artifact" not in response


def test_file_translation_success_returns_translated_file_and_artifact():
    response = execute_fake_file_adapter(
        {
            "kind": "file_translation",
            "operation": "translated",
            "filename": "guide.txt",
            "content": "hello\nworld",
            "targetLanguage": "zh-CN",
            "artifactId": "translation-guide-1",
        }
    ).model_dump(exclude_none=True)

    assert response["ok"] is True
    assert response["kind"] == "file_translation"
    assert response["operation"] == "translated"
    assert response["file"]["filename"] == "guide.zh-CN.txt"
    assert response["file"]["content"] == "[zh-CN] hello\n[zh-CN] world"
    assert response["artifact"]["artifactId"] == "translation-guide-1"
    assert response["artifact"]["path"] == (
        "memory://web-aigc-file-adapter/translation-guide-1/guide.zh-CN.txt"
    )


def test_excel_read_success_returns_structured_rows_from_inline_matrix():
    response = execute_fake_file_adapter(
        {
            "kind": "excel_read",
            "operation": "read",
            "filename": "budget.xlsx",
            "rows": [["Name", "Amount"], ["Ops", 12], ["QA", 8]],
        }
    ).model_dump(exclude_none=True)

    assert response["ok"] is True
    assert response["kind"] == "excel_read"
    assert response["operation"] == "read"
    assert response["status"] == "success"
    assert response["table"]["columns"] == ["Name", "Amount"]
    assert response["table"]["rows"] == [
        {"Name": "Ops", "Amount": 12},
        {"Name": "QA", "Amount": 8},
    ]
    assert response["metrics"] == {"rowCount": 2, "columnCount": 2}


def test_long_text_extraction_success_returns_summary_keywords_and_fragments():
    response = execute_fake_file_adapter(
        {
            "kind": "long_text_extraction",
            "operation": "extracted",
            "filename": "brief.txt",
            "content": (
                "Migration contract extracts stable file summaries. "
                "Migration contract keeps fake runtime side-effect free."
            ),
        }
    ).model_dump(exclude_none=True)

    assert response["ok"] is True
    assert response["kind"] == "long_text_extraction"
    assert response["operation"] == "extracted"
    assert response["summary"].startswith("Migration contract extracts")
    assert response["keywords"][0]["keyword"] == "migration"
    assert response["fragments"][0]["fragmentId"] == "fragment-1"


@pytest.mark.parametrize(
    "kind,operation",
    [
        ("file_generation", "generated"),
        ("file_slicing", "sliced"),
        ("file_translation", "translated"),
        ("excel_read", "read"),
        ("long_text_extraction", "extracted"),
    ],
)
def test_permission_denied_result_preserves_permission_and_audit(kind: str, operation: str):
    response = execute_fake_file_adapter(
        {
            "kind": kind,
            "operation": operation,
            "filename": "blocked.txt",
            "content": "blocked",
            "permission": {
                "allowed": False,
                "reason": "policy_denied",
                "auditId": "audit-denied-1",
            },
        }
    ).model_dump(exclude_none=True)

    assert response["ok"] is False
    assert response["kind"] == kind
    assert response["operation"] == operation
    assert response["status"] == "permission_denied"
    assert response["error"] == {
        "code": "permission_denied",
        "message": "File adapter execution denied by permission policy.",
    }
    assert response["provenance"]["permission"] == {
        "allowed": False,
        "reason": "policy_denied",
        "auditId": "audit-denied-1",
    }


@pytest.mark.parametrize(
    "filename",
    ["../blocked.txt", "reports/../../blocked.txt", "/tmp/blocked.txt", "C:\\blocked.txt"],
)
def test_path_traversal_and_absolute_paths_are_rejected(filename: str):
    with pytest.raises(ValueError, match="filename must be a safe file name"):
        execute_fake_file_adapter(
            {
                "kind": "file_generation",
                "operation": "generated",
                "filename": filename,
                "content": "bad",
            }
        )


def test_error_result_is_explicit_and_not_success():
    response = execute_fake_file_adapter(
        {
            "kind": "file_generation",
            "operation": "generated",
            "filename": "error.txt",
            "content": "error",
            "scenario": "error",
        }
    ).model_dump(exclude_none=True)

    assert response["ok"] is False
    assert response["status"] == "error"
    assert response["status"] != "success"
    assert response["error"]["code"] == "fake_runtime_error"


def test_artifact_contract_rejects_persisted_true_for_fake_runtime():
    with pytest.raises(ValidationError):
        FileAdapterArtifactResponse(
            kind="file_generation",
            operation="generated",
            file={"filename": "bad.txt", "content": "bad", "sizeBytes": 3},
            artifact={
                "artifactId": "bad-artifact",
                "kind": "file",
                "name": "bad.txt",
                "path": "memory://web-aigc-file-adapter/bad-artifact/bad.txt",
                "mimeType": "text/plain",
                "sizeBytes": 3,
                "persisted": True,
            },
            provenance={
                "provider": "fake",
                "runtime": "python-contract",
                "kind": "file_generation",
                "operation": "generated",
            },
        )


def test_error_contract_rejects_success_status():
    with pytest.raises(ValidationError):
        FileAdapterErrorResponse(
            kind="file_generation",
            operation="generated",
            status="success",
            error={"code": "fake_runtime_error", "message": "Fake runtime failed."},
            provenance={
                "provider": "fake",
                "runtime": "python-contract",
                "kind": "file_generation",
                "operation": "generated",
            },
        )
