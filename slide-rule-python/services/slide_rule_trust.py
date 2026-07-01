"""
SlideRule V5.2 Trust provenance ledger (PYTHON_COMPAT slice for TrustGcov seq 22).

Records provenance and trust ledger entries on committed artifacts (via helpers) and enforces ledger requirement for trusted-committed recognition in GCOV.

Classification (step 1, per task + review resolution):
Current behavior before: PYTHON_COMPAT (drivers use Artifact.server_construct or raw dicts to set provenance/producedBy + trustLevel on commit; no dedicated trust service; no forced ledger entry recording or ledgerEntryId tie; no API enforcing "every committed artifact has recorded provenance+trust ledger"; trusted committed checks ignored ledger).
After: PYTHON_COMPAT (slide_rule_trust owns record_provenance_and_trust_ledger + commit_artifact_with_ledger + has_provenance_and_trust_ledger + reject_client...; has_trusted_committed_for_cap now requires has_provenance_and_trust_ledger so no-ledger gated_pass artifact is excluded from trusted committed; producedBy required for record; client dict forgery rejected; pytest proves producedBy+gated_pass+!ledger => has_trusted=False, after record=True).
Record is via canonical commit helper (recommended server path) + gate now depends on ledger. Full exhaustive replacement of every server_construct+append site across all drivers, and promotion of trustProvenanceLedger to top-level durable V5SessionState field, are deferred to PythonDriver/StateSchema (this slice edits only allowed files and does not claim every construct site or model change). Durable marker currently uses ledgerEntryId on CapabilityRun; explicit list uses runtime attr (limitation recorded).
No Node fallback hiding semantics. Do not default artifacts to trusted.
"""

from typing import Any, Dict, List, Optional
from datetime import datetime

from models.v5_state import Artifact, ProducedBy, V5SessionState, CapabilityRun


def _now_iso() -> str:
    return datetime.now().isoformat()


def record_provenance_and_trust_ledger(
    state: V5SessionState,
    artifact: Artifact,
    run: Optional[CapabilityRun] = None,
) -> Dict[str, Any]:
    """Record provenance (producedBy + provenance) + trust ledger entry for a committed artifact (server path).

    Canonical helper commit_artifact_with_ledger calls this. Requires producedBy.
    Binds ledgerEntryId (durable on CapabilityRun) and appends to runtime trustProvenanceLedger attr.
    Note: explicit list is via setattr (not declared field in V5SessionState; see blocker in status; may not survive model_dump/reload).
    Durable record marker for audit is ledgerEntryId on the producing run + producedBy on artifact.
    Coverage gate requires has_provenance_and_trust_ledger; unrecorded artifacts excluded from trusted committed.
    Returns ledger entry. Raises on missing producedBy.
    """
    if not isinstance(artifact, Artifact):
        # accept dict for thin compat in some paths but enforce via ctor elsewhere
        artifact = Artifact.server_construct(**artifact) if isinstance(artifact, dict) else artifact

    if artifact.producedBy is None:
        raise ValueError(
            "committed artifact must carry producedBy (server-owned provenance); "
            "use Artifact.server_construct with ProducedBy after real execution/gates"
        )

    if artifact.trustLevel == "untrusted":
        # untrusted may exist but "committed" trusted ones for coverage must be gated
        pass  # allow but ledger still records

    ledger_entry: Dict[str, Any] = {
        "id": f"trust-ledger-{artifact.id}",
        "artifactId": artifact.id,
        "provenance": artifact.provenance,
        "producedBy": artifact.producedBy.model_dump() if artifact.producedBy else None,
        "trustLevel": artifact.trustLevel,
        "passedGates": list(getattr(artifact, "passedGates", [])),
        "committedAt": _now_iso(),
        "ledgerEntryId": f"trust-ledger-{artifact.id}",
    }

    # Bind to run's ledgerEntryId (the V5 mechanism for tying execution to ledger)
    target_run = run
    if not target_run and artifact.producedBy:
        run_id = artifact.producedBy.capabilityRunId
        for r in (getattr(state, "capabilityRuns", None) or []):
            if getattr(r, "id", None) == run_id or (isinstance(r, dict) and r.get("id") == run_id):
                target_run = r
                break
        if target_run is None:
            # create minimal run to carry ledgerEntry (server path)
            target_run = CapabilityRun(
                id=run_id,
                capabilityId=artifact.producedBy.capabilityId,
                turnId=getattr(state, "lastTurnId", None) or "t",
                ledgerEntryId=None,
            )
            state.capabilityRuns.append(target_run)

    if target_run is not None:
        if hasattr(target_run, "ledgerEntryId"):
            target_run.ledgerEntryId = ledger_entry["id"]
        elif isinstance(target_run, dict):
            target_run["ledgerEntryId"] = ledger_entry["id"]

    # Record explicit trust provenance ledger on state for audit.
    # Uses runtime attr (setattr) because trustProvenanceLedger is not a declared field on V5SessionState model.
    # Limitation per review finding 1: attr may be dropped on model_dump / server_load / pydantic roundtrip.
    # Primary durable evidence of record is ledgerEntryId bound on CapabilityRun (field exists) + artifact.producedBy.
    # Full promotion to durable top-level list deferred (blocker; would require model edit outside this task's allowed files).
    ledger_list = getattr(state, "trustProvenanceLedger", None)
    if not isinstance(ledger_list, list):
        ledger_list = []
        try:
            setattr(state, "trustProvenanceLedger", ledger_list)
        except Exception:
            pass
    ledger_list.append(ledger_entry)

    # Ensure artifact is in state.artifacts so that record_provenance... also covers commit (addresses standalone helper)
    arts = getattr(state, "artifacts", None) or []
    if not any((getattr(a, "id", None) or (a.get("id") if isinstance(a, dict) else None)) == artifact.id for a in arts):
        arts.append(artifact)
        if hasattr(state, "artifacts"):
            state.artifacts = arts

    return ledger_entry


def commit_artifact_with_ledger(
    state: V5SessionState,
    **artifact_fields: Any,
) -> Artifact:
    """Canonical server commit helper that records provenance + trust ledger entry (via record fn).

    Always server_construct + record (bind ledgerEntryId + append list + ensure in artifacts).
    Recommended path for Python server commits that need to satisfy trusted-committed gate.
    Direct Artifact.server_construct + append (without record) will fail has_trusted_committed_for_cap until recorded.
    Full mandatory use at all construct sites is outside allowed files (deferred to PythonDriver).
    """
    # ensure server path
    if "trustLevel" not in artifact_fields or artifact_fields.get("trustLevel") == "untrusted":
        # caller must decide; default gated only when server
        pass
    art = Artifact.server_construct(**artifact_fields)
    record_provenance_and_trust_ledger(state, art)
    return art


def has_provenance_and_trust_ledger(state: Any, artifact_id: str) -> bool:
    """Check: artifact has producedBy (provenance) + trust record marker (ledgerEntryId on its run, or explicit list entry).
    Note: explicit list may be runtime-only; ledgerEntryId provides durable tie for this slice."""
    # via producedBy on artifact (core provenance)
    for a in (getattr(state, "artifacts", None) or []):
        aid = getattr(a, "id", None) or (a.get("id") if isinstance(a, dict) else None)
        if aid != artifact_id:
            continue
        prod = getattr(a, "producedBy", None) or (a.get("producedBy") if isinstance(a, dict) else None)
        if prod is None:
            return False
        # also check explicit ledger
        ledger = getattr(state, "trustProvenanceLedger", None) or []
        if any(e.get("artifactId") == artifact_id for e in ledger):
            return True
        # or via run ledgerEntryId
        prod_run = None
        if isinstance(prod, dict):
            prod_run = prod.get("capabilityRunId")
        elif prod is not None:
            prod_run = getattr(prod, "capabilityRunId", None)
        if prod_run:
            for r in (getattr(state, "capabilityRuns", None) or []):
                rid = getattr(r, "id", None) or (r.get("id") if isinstance(r, dict) else None)
                if rid == prod_run:
                    leid = getattr(r, "ledgerEntryId", None) or (r.get("ledgerEntryId") if isinstance(r, dict) else None)
                    if leid:
                        return True
    return False


def reject_client_forged_provenance_or_ledger(artifact_input: Dict[str, Any]) -> None:
    """Guard: client/frontend dicts cannot forge server-owned provenance (producedBy) or ledger entries.
    Call on raw client artifact inputs before any commit path.
    Mirrors Artifact model anti-forgery for ledger slice.
    """
    if artifact_input.get("producedBy") is not None:
        raise ValueError(
            "producedBy is server-owned provenance ledger; client PUT cannot forge. "
            "Use server commit paths only."
        )
    if artifact_input.get("trustLevel") in ("gated_pass", "audited"):
        raise ValueError(
            "trustLevel elevation is server-only after gates; client cannot forge provenance/trust ledger."
        )
    # explicit ledger forgery attempt
    if artifact_input.get("ledgerEntryId") or "trustLedger" in str(artifact_input).lower():
        raise ValueError("ledgerEntry / trust ledger is server-owned; client cannot forge on artifact commit.")
