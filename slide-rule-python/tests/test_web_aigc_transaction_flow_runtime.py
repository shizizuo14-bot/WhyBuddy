"""Runtime bridge tests for the Web AIGC transaction-flow adapter.

Python owns only the decision envelope in this migration slice. It analyzes the
requested transaction, preserves permission and audit metadata, and never
executes payments, orders, database writes, or external workflows.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.web_aigc_transaction_flow_adapter import (  # noqa: E402
    execute_transaction_flow_runtime_bridge,
)


def _base_payload(**overrides):
    payload = {
        "agentId": "agent-transaction",
        "token": "token-transaction",
        "transaction": {
            "transactionId": "txn-runtime-1",
            "service": "billing",
            "action": "refund_order",
            "resource": "orders",
            "targetId": "order-1",
            "summary": "Refund order order-1",
            "parameters": {"reason": "duplicate_charge"},
            "sideEffects": ["refund ledger entry", "customer notification"],
        },
        "approval": {
            "decision": "approved",
            "actorId": "approver-1",
            "comment": "Approved after review",
            "ticketId": "ticket-1",
            "decisionId": "decision-runtime-1",
            "submittedAt": "2026-06-22T08:00:00.000Z",
        },
        "permission": {
            "allowed": True,
            "resource": "transaction_flow:billing:refund_order:orders",
            "reason": "policy allowed",
            "governance": {
                "outcome": "allowed",
                "riskLevel": "critical",
                "policyId": "security-governance.transaction-flow-gate",
                "rationale": "Manual gate satisfied.",
                "requiresAudit": True,
                "specRefs": ["web-aigc.transaction-flow.runtime"],
            },
        },
        "audit": {
            "auditEntryId": "audit-runtime-1",
            "logged": True,
            "operation": "transaction_flow",
            "eventKey": "human.approved",
            "timestamp": "2026-06-22T08:00:00.000Z",
            "decisionId": "decision-runtime-1",
        },
        "metadata": {"requestId": "runtime-approved"},
    }
    payload.update(overrides)
    return payload


def test_runtime_bridge_returns_approved_decision_without_execution_side_effects():
    response = execute_transaction_flow_runtime_bridge(_base_payload()).model_dump(exclude_none=True)

    assert response["ok"] is True
    assert response["status"] == "approved"
    assert response["decision"]["approved"] is True
    assert response["analysis"]["transactionId"] == "txn-runtime-1"
    assert response["analysis"]["sideEffectCount"] == 2
    assert response["permission"]["allowed"] is True
    assert response["audit"]["eventKey"] == "human.approved"
    assert response["runtime"] == {
        "backend": "python",
        "provider": "fake",
        "source": "python-transaction-flow-runtime",
        "externalCalls": False,
        "executedTransaction": False,
        "persisted": False,
    }
    assert response["metadata"]["requestId"] == "runtime-approved"


def test_runtime_bridge_permission_rejection_is_not_approved():
    payload = _base_payload(
        permission={
            "allowed": False,
            "resource": "transaction_flow:billing:refund_order:orders",
            "reason": "No allow rule found for api:call.",
            "suggestion": "Request transaction flow permission.",
            "governance": {
                "outcome": "blocked",
                "riskLevel": "critical",
                "policyId": "security-governance.transaction-flow-gate",
                "rationale": "Permission denied.",
                "requiresAudit": True,
            },
        },
        audit={
            "auditEntryId": "audit-denied-1",
            "logged": True,
            "operation": "transaction_flow",
            "eventKey": "human.rejected",
            "timestamp": "2026-06-22T08:01:00.000Z",
            "decisionId": "decision-runtime-1",
        },
        metadata={"requestId": "runtime-rejected"},
    )

    response = execute_transaction_flow_runtime_bridge(payload).model_dump(exclude_none=True)

    assert response["ok"] is False
    assert response["status"] == "rejected"
    assert response["status"] != "approved"
    assert response["decision"]["approved"] is False
    assert response["error"]["code"] == "permission_denied"
    assert response["permission"]["allowed"] is False
    assert response["audit"]["eventKey"] == "human.rejected"


def test_runtime_bridge_manual_rejection_is_not_approved():
    payload = _base_payload(
        approval={
            "decision": "rejected",
            "actorId": "approver-1",
            "comment": "Missing review evidence",
            "ticketId": "ticket-1",
            "decisionId": "decision-runtime-1",
        }
    )

    response = execute_transaction_flow_runtime_bridge(payload).model_dump(exclude_none=True)

    assert response["ok"] is False
    assert response["status"] == "rejected"
    assert response["status"] != "approved"
    assert response["decision"]["approved"] is False
    assert response["error"] == {
        "code": "approval_rejected",
        "message": "Missing review evidence",
    }


def test_runtime_bridge_degraded_provider_is_not_approved():
    response = execute_transaction_flow_runtime_bridge(
        _base_payload(
            scenario="degraded",
            metadata={"auditId": "audit-degraded-1"},
        )
    ).model_dump(exclude_none=True)

    assert response["ok"] is False
    assert response["status"] == "degraded"
    assert response["status"] != "approved"
    assert response["decision"]["approved"] is False
    assert response["warnings"] == ["Transaction flow runtime is degraded."]
    assert response["error"]["code"] == "runtime_degraded"
    assert response["metadata"]["auditId"] == "audit-degraded-1"


def test_runtime_bridge_runtime_error_is_not_approved():
    response = execute_transaction_flow_runtime_bridge(
        _base_payload(scenario="error")
    ).model_dump(exclude_none=True)

    assert response["ok"] is False
    assert response["status"] == "error"
    assert response["status"] != "approved"
    assert response["decision"]["approved"] is False
    assert response["error"]["code"] == "runtime_error"
    assert response["runtime"]["externalCalls"] is False
