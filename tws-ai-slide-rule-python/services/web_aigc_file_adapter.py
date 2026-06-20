"""Fake-runtime contract for web AIGC file adapters.

The real file generation, slicing, translation, excel parsing, and extraction
implementations remain Node-owned for this migration slice. Python only defines
stable result shapes and a side-effect-free fake runtime.
"""

from __future__ import annotations

import os
import re
from collections import Counter
from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


FILE_ADAPTER_CONTRACT_VERSION = "web_aigc.file_adapter.v1"

FileAdapterKind = Literal[
    "file_generation",
    "file_slicing",
    "file_translation",
    "excel_read",
    "long_text_extraction",
]
FileAdapterOperation = Literal[
    "generated",
    "sliced",
    "translated",
    "read",
    "extracted",
]
FileAdapterScenario = Literal["success", "error"]
FileAdapterStatus = Literal["success", "error", "permission_denied"]

_KIND_OPERATION: Dict[FileAdapterKind, FileAdapterOperation] = {
    "file_generation": "generated",
    "file_slicing": "sliced",
    "file_translation": "translated",
    "excel_read": "read",
    "long_text_extraction": "extracted",
}


def _non_empty(value: str) -> str:
    if not value.strip():
        raise ValueError("must be a non-empty string")
    return value


def _byte_length(value: str) -> int:
    return len(value.encode("utf-8"))


def _is_safe_file_name(value: str) -> bool:
    if value != os.path.basename(value):
        return False
    if value.startswith(("/", "\\")):
        return False
    if re.match(r"^[A-Za-z]:[\\/]", value):
        return False
    if ".." in value:
        return False
    return bool(re.match(r"^[A-Za-z0-9._ -]+$", value))


def _safe_file_name(value: str) -> str:
    normalized = _non_empty(value.strip())
    if not _is_safe_file_name(normalized):
        raise ValueError("filename must be a safe file name")
    return normalized


def _safe_identifier(value: str, field: str) -> str:
    normalized = _non_empty(value.strip())
    if not re.match(r"^[A-Za-z0-9._-]+$", normalized) or ".." in normalized:
        raise ValueError(f"{field} must be a safe identifier")
    return normalized


def _mime_type(filename: str) -> str:
    lower = filename.lower()
    if lower.endswith(".md"):
        return "text/markdown"
    if lower.endswith(".json"):
        return "application/json"
    if lower.endswith(".xlsx"):
        return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    if lower.endswith(".csv"):
        return "text/csv"
    return "text/plain"


class FilePermission(BaseModel):
    model_config = ConfigDict(extra="allow")

    allowed: bool = True
    reason: Optional[str] = None
    auditId: Optional[str] = None

    @field_validator("reason", "auditId")
    @classmethod
    def _validate_optional_non_empty(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        return _non_empty(value)


class FileAdapterProvenance(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider: Literal["fake"] = "fake"
    runtime: Literal["python-contract"] = "python-contract"
    kind: FileAdapterKind
    operation: FileAdapterOperation
    permission: Optional[Dict[str, Any]] = None


class FileAdapterError(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    message: str

    @field_validator("code", "message")
    @classmethod
    def _validate_non_empty(cls, value: str) -> str:
        return _non_empty(value)


class FilePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    filename: str
    content: str
    sizeBytes: int
    mimeType: str = "text/plain"

    @field_validator("filename")
    @classmethod
    def _validate_filename(cls, value: str) -> str:
        return _safe_file_name(value)

    @field_validator("mimeType")
    @classmethod
    def _validate_mime_type(cls, value: str) -> str:
        return _non_empty(value)

    @model_validator(mode="after")
    def _validate_size(self) -> "FilePayload":
        if self.sizeBytes != _byte_length(self.content):
            raise ValueError("sizeBytes must match content byte length")
        return self


class ArtifactPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    artifactId: str
    kind: Literal["file"] = "file"
    name: str
    path: str
    mimeType: str
    sizeBytes: int
    persisted: Literal[False] = False

    @field_validator("artifactId")
    @classmethod
    def _validate_artifact_id(cls, value: str) -> str:
        return _safe_identifier(value, "artifactId")

    @field_validator("name")
    @classmethod
    def _validate_name(cls, value: str) -> str:
        return _safe_file_name(value)

    @field_validator("path", "mimeType")
    @classmethod
    def _validate_non_empty(cls, value: str) -> str:
        return _non_empty(value)

    @model_validator(mode="after")
    def _validate_memory_path(self) -> "ArtifactPayload":
        expected = f"memory://web-aigc-file-adapter/{self.artifactId}/{self.name}"
        if self.path != expected:
            raise ValueError("fake artifact path must use the memory scheme")
        return self


class SlicePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sliceId: str
    index: int
    content: str
    sizeBytes: int

    @field_validator("sliceId", "content")
    @classmethod
    def _validate_non_empty(cls, value: str) -> str:
        return _non_empty(value)

    @model_validator(mode="after")
    def _validate_size(self) -> "SlicePayload":
        if self.sizeBytes != _byte_length(self.content):
            raise ValueError("slice sizeBytes must match content byte length")
        return self


class TablePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    columns: List[str]
    rows: List[Dict[str, Any]]

    @field_validator("columns")
    @classmethod
    def _validate_columns(cls, value: List[str]) -> List[str]:
        if not value:
            raise ValueError("columns must not be empty")
        return [_non_empty(item) for item in value]


class KeywordPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    keyword: str
    count: int

    @field_validator("keyword")
    @classmethod
    def _validate_keyword(cls, value: str) -> str:
        return _non_empty(value)


class FragmentPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    fragmentId: str
    content: str

    @field_validator("fragmentId", "content")
    @classmethod
    def _validate_non_empty(cls, value: str) -> str:
        return _non_empty(value)


class FileAdapterMetrics(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sliceCount: Optional[int] = None
    rowCount: Optional[int] = None
    columnCount: Optional[int] = None


class FileAdapterBaseResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contractVersion: Literal[FILE_ADAPTER_CONTRACT_VERSION] = FILE_ADAPTER_CONTRACT_VERSION
    kind: FileAdapterKind
    operation: FileAdapterOperation
    provenance: FileAdapterProvenance

    @model_validator(mode="after")
    def _validate_operation_matches_kind(self) -> "FileAdapterBaseResponse":
        if _KIND_OPERATION[self.kind] != self.operation:
            raise ValueError("operation must match adapter kind")
        return self


class FileAdapterFileResponse(FileAdapterBaseResponse):
    ok: Literal[True] = True
    status: Literal["success"] = "success"
    file: FilePayload


class FileAdapterArtifactResponse(FileAdapterFileResponse):
    artifact: ArtifactPayload


class FileSlicingSuccessResponse(FileAdapterFileResponse):
    kind: Literal["file_slicing"]
    operation: Literal["sliced"]
    slices: List[SlicePayload]
    metrics: FileAdapterMetrics

    @model_validator(mode="after")
    def _validate_slices(self) -> "FileSlicingSuccessResponse":
        if not self.slices:
            raise ValueError("file slicing requires at least one slice")
        if self.metrics.sliceCount != len(self.slices):
            raise ValueError("sliceCount must match slices length")
        return self


class ExcelReadSuccessResponse(FileAdapterBaseResponse):
    ok: Literal[True] = True
    kind: Literal["excel_read"]
    operation: Literal["read"]
    status: Literal["success"] = "success"
    file: FilePayload
    table: TablePayload
    metrics: FileAdapterMetrics

    @model_validator(mode="after")
    def _validate_metrics(self) -> "ExcelReadSuccessResponse":
        if self.metrics.rowCount != len(self.table.rows):
            raise ValueError("rowCount must match table rows length")
        if self.metrics.columnCount != len(self.table.columns):
            raise ValueError("columnCount must match table columns length")
        return self


class LongTextExtractionSuccessResponse(FileAdapterFileResponse):
    kind: Literal["long_text_extraction"]
    operation: Literal["extracted"]
    summary: str
    keywords: List[KeywordPayload] = Field(default_factory=list)
    fragments: List[FragmentPayload] = Field(default_factory=list)

    @field_validator("summary")
    @classmethod
    def _validate_summary(cls, value: str) -> str:
        return _non_empty(value)


class FileAdapterErrorResponse(FileAdapterBaseResponse):
    ok: Literal[False] = False
    status: Literal["error", "permission_denied"]
    error: FileAdapterError


FileAdapterResponse = Union[
    FileAdapterArtifactResponse,
    FileSlicingSuccessResponse,
    ExcelReadSuccessResponse,
    LongTextExtractionSuccessResponse,
    FileAdapterErrorResponse,
]


def execute_fake_file_adapter(payload: Dict[str, Any]) -> FileAdapterResponse:
    """Return a fake file adapter response without file-system side effects."""

    if not isinstance(payload, dict):
        raise ValueError("payload must be an object")

    kind = _read_kind(payload.get("kind"))
    operation = _read_operation(payload.get("operation"), kind)
    scenario = _read_scenario(payload.get("scenario"))
    filename = _safe_file_name(_read_string(payload.get("filename"), "input.txt", "filename"))
    content = _read_string(payload.get("content"), "fake file content", "content")
    permission = _read_permission(payload.get("permission"))
    provenance = _build_provenance(kind, operation, permission)

    if not permission.allowed:
        return FileAdapterErrorResponse(
            kind=kind,
            operation=operation,
            status="permission_denied",
            error=FileAdapterError(
                code="permission_denied",
                message="File adapter execution denied by permission policy.",
            ),
            provenance=provenance,
        )

    if scenario == "error":
        return FileAdapterErrorResponse(
            kind=kind,
            operation=operation,
            status="error",
            error=FileAdapterError(
                code="fake_runtime_error",
                message="Fake file adapter runtime failed.",
            ),
            provenance=provenance,
        )

    if kind == "file_generation":
        artifact_id = _read_artifact_id(payload.get("artifactId"), filename)
        file_payload = _build_file(filename, content)
        return FileAdapterArtifactResponse(
            kind=kind,
            operation=operation,
            file=file_payload,
            artifact=_build_artifact(artifact_id, file_payload),
            provenance=provenance,
        )

    if kind == "file_slicing":
        max_chars = _read_positive_int(payload.get("maxChars"), 80, "maxChars")
        file_payload = _build_file(filename, content)
        slices = _slice_content(content, max_chars)
        return FileSlicingSuccessResponse(
            kind=kind,
            operation=operation,
            file=file_payload,
            slices=slices,
            metrics=FileAdapterMetrics(sliceCount=len(slices)),
            provenance=provenance,
        )

    if kind == "file_translation":
        target_language = _safe_identifier(
            _read_string(payload.get("targetLanguage"), "zh-CN", "targetLanguage"),
            "targetLanguage",
        )
        translated_filename = _translated_filename(filename, target_language)
        translated_content = "\n".join(
            f"[{target_language}] {line}" if line else ""
            for line in content.replace("\r\n", "\n").split("\n")
        )
        artifact_id = _read_artifact_id(payload.get("artifactId"), translated_filename)
        file_payload = _build_file(translated_filename, translated_content)
        return FileAdapterArtifactResponse(
            kind=kind,
            operation=operation,
            file=file_payload,
            artifact=_build_artifact(artifact_id, file_payload),
            provenance=provenance,
        )

    if kind == "excel_read":
        rows = _read_rows(payload.get("rows"))
        columns = [str(value) for value in rows[0]]
        table_rows = [
            {columns[index]: row[index] if index < len(row) else None for index in range(len(columns))}
            for row in rows[1:]
        ]
        file_payload = _build_file(filename, _rows_to_inline_content(rows))
        return ExcelReadSuccessResponse(
            kind=kind,
            operation=operation,
            file=file_payload,
            table=TablePayload(columns=columns, rows=table_rows),
            metrics=FileAdapterMetrics(
                rowCount=len(table_rows),
                columnCount=len(columns),
            ),
            provenance=provenance,
        )

    summary = _summarize(content)
    keywords = _keywords(content)
    return LongTextExtractionSuccessResponse(
        kind=kind,
        operation=operation,
        file=_build_file(filename, content),
        summary=summary,
        keywords=keywords,
        fragments=[
            FragmentPayload(
                fragmentId="fragment-1",
                content=summary,
            )
        ],
        provenance=provenance,
    )


def _read_kind(value: Any) -> FileAdapterKind:
    if value in _KIND_OPERATION:
        return value
    raise ValueError(
        "kind must be file_generation, file_slicing, file_translation, excel_read, or long_text_extraction"
    )


def _read_operation(value: Any, kind: FileAdapterKind) -> FileAdapterOperation:
    expected = _KIND_OPERATION[kind]
    if value is None or value == expected:
        return expected
    raise ValueError("operation must match adapter kind")


def _read_scenario(value: Any) -> FileAdapterScenario:
    if value in {"success", "error"}:
        return value
    if value is None:
        return "success"
    raise ValueError("scenario must be success or error")


def _read_permission(value: Any) -> FilePermission:
    if value is None:
        return FilePermission()
    if not isinstance(value, dict):
        raise ValueError("permission must be an object")
    return FilePermission(**value)


def _read_string(value: Any, fallback: str, field: str) -> str:
    if value is None:
        return fallback
    if not isinstance(value, str):
        raise ValueError(f"{field} must be a string")
    return _non_empty(value)


def _read_positive_int(value: Any, fallback: int, field: str) -> int:
    if value is None:
        return fallback
    if not isinstance(value, int) or value < 1:
        raise ValueError(f"{field} must be a positive integer")
    return value


def _read_artifact_id(value: Any, filename: str) -> str:
    if value is not None:
        if not isinstance(value, str):
            raise ValueError("artifactId must be a string")
        return _safe_identifier(value, "artifactId")

    base = re.sub(r"[^A-Za-z0-9._-]+", "-", filename.rsplit(".", 1)[0]).strip("-")
    return _safe_identifier(f"artifact-{base or 'file'}", "artifactId")


def _read_rows(value: Any) -> List[List[Any]]:
    if value is None:
        return [["Name", "Value"], ["Fake", 1]]
    if not isinstance(value, list) or not value:
        raise ValueError("rows must be a non-empty matrix")
    rows: List[List[Any]] = []
    for row in value:
        if not isinstance(row, list):
            raise ValueError("rows must be a matrix")
        rows.append(row)
    if not rows[0]:
        raise ValueError("rows header must not be empty")
    return rows


def _build_provenance(
    kind: FileAdapterKind,
    operation: FileAdapterOperation,
    permission: FilePermission,
) -> FileAdapterProvenance:
    permission_payload = permission.model_dump(exclude_none=True)
    return FileAdapterProvenance(
        provider="fake",
        runtime="python-contract",
        kind=kind,
        operation=operation,
        permission=permission_payload if permission_payload else None,
    )


def _build_file(filename: str, content: str) -> FilePayload:
    return FilePayload(
        filename=filename,
        content=content,
        sizeBytes=_byte_length(content),
        mimeType=_mime_type(filename),
    )


def _build_artifact(artifact_id: str, file_payload: FilePayload) -> ArtifactPayload:
    return ArtifactPayload(
        artifactId=artifact_id,
        kind="file",
        name=file_payload.filename,
        path=f"memory://web-aigc-file-adapter/{artifact_id}/{file_payload.filename}",
        mimeType=file_payload.mimeType,
        sizeBytes=file_payload.sizeBytes,
        persisted=False,
    )


def _slice_content(content: str, max_chars: int) -> List[SlicePayload]:
    normalized = content.strip() or content
    parts = [
        normalized[index : index + max_chars].strip()
        for index in range(0, len(normalized), max_chars)
    ]
    filtered = [part for part in parts if part]
    return [
        SlicePayload(
            sliceId=f"slice-{index + 1}",
            index=index,
            content=part,
            sizeBytes=_byte_length(part),
        )
        for index, part in enumerate(filtered or [normalized])
    ]


def _translated_filename(filename: str, target_language: str) -> str:
    if "." not in filename:
        return f"{filename}.{target_language}.txt"
    base, extension = filename.rsplit(".", 1)
    return f"{base}.{target_language}.{extension}"


def _rows_to_inline_content(rows: List[List[Any]]) -> str:
    return "\n".join(",".join("" if cell is None else str(cell) for cell in row) for row in rows)


def _summarize(content: str) -> str:
    normalized = " ".join(content.split())
    return normalized[:160] if len(normalized) > 160 else normalized


def _keywords(content: str) -> List[KeywordPayload]:
    words = re.findall(r"[A-Za-z][A-Za-z0-9_-]{2,}", content.lower())
    counts = Counter(words)
    return [
        KeywordPayload(keyword=word, count=count)
        for word, count in counts.most_common(8)
    ]
