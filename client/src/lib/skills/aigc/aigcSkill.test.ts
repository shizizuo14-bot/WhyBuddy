import { describe, expect, it } from "vitest";

import { dataModelSkill, purchaseApprovalDataModel } from "../datamodel/dataModelSkill";
import { purchaseApprovalRbac, rbacSkill } from "../rbac/rbacSkill";
import { aigcSkill, purchaseRiskAigcModel } from "./aigcSkill";
import type { AigcModel } from "./aigcModel";

const clone = (model: AigcModel): AigcModel => structuredClone(model);

const fullSurface = {
  datamodel: dataModelSkill.resolve(purchaseApprovalDataModel),
  rbac: rbacSkill.resolve(purchaseApprovalRbac),
};

describe("aigcSkill - V2 base metamodel", () => {
  it("models purchase budget_risk_summary as a runtime-less PEP capability", () => {
    const capability = purchaseRiskAigcModel.capabilities.find(cap => cap.id === "budget_risk_summary");

    expect(purchaseRiskAigcModel.pep).toBe("pep");
    expect(capability).toBeTruthy();
    expect(capability?.kind).toBe("summary");
    expect(capability?.allowedRoleRefs).toEqual(["finance", "department_manager"]);
    expect(capability?.inputFieldRefs).toEqual(
      expect.arrayContaining([
        "purchase_request.amount",
        "purchase_request.department",
        "purchase_request.vendor",
        "purchase_request.budgetChecked",
      ]),
    );
    expect(capability?.outputSchemaRef).toBe("purchase_risk_output");
  });

  it("passes the deterministic purchase risk sample when RBAC and DataModel are wired", () => {
    const report = aigcSkill.validate(purchaseRiskAigcModel, { external: fullSurface });

    expect(report.ok).toBe(true);
    expect(report.errors).toHaveLength(0);
    expect(report.warnings).toHaveLength(0);
  });
});

describe("aigcSkill - provider router and no-secret gate", () => {
  it("rejects missing provider/model routes and invalid budgets", () => {
    const broken = clone(purchaseRiskAigcModel);
    broken.capabilities[0].providerRef = "missing_provider";
    broken.providers[0].modelRef = "";
    broken.providers[0].tokenBudget = 0;

    const report = aigcSkill.validate(broken, { external: fullSurface });

    expect(report.ok).toBe(false);
    expect(report.errors.some(e => e.code === "AIGC_PROVIDER_MISSING")).toBe(true);
    expect(report.errors.some(e => e.code === "AIGC_MODEL_MISSING")).toBe(true);
    expect(report.errors.some(e => e.code === "AIGC_TOKEN_BUDGET_INVALID")).toBe(true);
  });

  it("rejects raw provider secrets while allowing keyRef or secretRef only", () => {
    const broken = clone(purchaseRiskAigcModel);
    (broken.providers[0] as any).apiKey = "raw-provider-token";

    const report = aigcSkill.validate(broken, { external: fullSurface });

    expect(report.ok).toBe(false);
    expect(report.errors.some(e => e.code === "AIGC_RAW_SECRET")).toBe(true);
  });
});

describe("aigcSkill - prompt templates and output schemas", () => {
  it("requires versioned prompts and typed output schemas", () => {
    const broken = clone(purchaseRiskAigcModel);
    broken.capabilities[0].promptRef = "missing_prompt";
    broken.promptTemplates[0].version = "";
    broken.outputSchemas[0].fields[0].type = "blob" as any;

    const report = aigcSkill.validate(broken, { external: fullSurface });

    expect(report.ok).toBe(false);
    expect(report.errors.some(e => e.code === "AIGC_PROMPT_MISSING")).toBe(true);
    expect(report.errors.some(e => e.code === "AIGC_PROMPT_VERSION_MISSING")).toBe(true);
    expect(report.errors.some(e => e.code === "AIGC_OUTPUT_SCHEMA_INVALID")).toBe(true);
  });

  it("rejects capabilities that reference missing output schemas", () => {
    const broken = clone(purchaseRiskAigcModel);
    broken.capabilities[0].outputSchemaRef = "missing_schema";

    const report = aigcSkill.validate(broken, { external: fullSurface });

    expect(report.ok).toBe(false);
    expect(report.errors.some(e => e.code === "AIGC_OUTPUT_SCHEMA_MISSING")).toBe(true);
  });

  it("defines deterministic riskLevel, summary, and recommendedAction output fields", () => {
    const schema = purchaseRiskAigcModel.outputSchemas.find(item => item.id === "purchase_risk_output");

    expect(schema?.fields.map(field => field.key)).toEqual(["riskLevel", "summary", "recommendedAction"]);
  });
});

describe("aigcSkill - RAG retrieval and citation policy", () => {
  it("rejects missing knowledge source, retrieval policy, and citation policy", () => {
    const broken = clone(purchaseRiskAigcModel);
    broken.capabilities[0].knowledgeSourceRefs = ["missing_knowledge"];
    broken.capabilities[0].retrievalPolicyRef = "missing_retrieval";
    broken.capabilities[0].citationPolicyRef = "missing_citation";

    const report = aigcSkill.validate(broken, { external: fullSurface });

    expect(report.ok).toBe(false);
    expect(report.errors.some(e => e.code === "AIGC_RAG_SOURCE_MISSING")).toBe(true);
    expect(report.errors.some(e => e.code === "AIGC_RETRIEVAL_POLICY_MISSING")).toBe(true);
    expect(report.errors.some(e => e.code === "AIGC_CITATION_REQUIRED")).toBe(true);
  });

  it("blocks retrieval policies that make local auth decisions instead of delegating to RBAC", () => {
    const broken = clone(purchaseRiskAigcModel);
    broken.retrievalPolicies[0].allowedRoleRefs = [];
    broken.retrievalPolicies[0].permissionRefs = [];

    const report = aigcSkill.validate(broken, { external: fullSurface });

    expect(report.ok).toBe(false);
    expect(report.errors.some(e => e.code === "AIGC_RETRIEVAL_PEP_BYPASS")).toBe(true);
  });
});

describe("aigcSkill - tool metadata gate", () => {
  it("rejects missing tool config and missing tool policy", () => {
    const broken = clone(purchaseRiskAigcModel);
    broken.capabilities[0].toolRefs = ["missing_tool"];
    broken.capabilities[0].toolPolicyRef = "missing_policy";

    const report = aigcSkill.validate(broken, { external: fullSurface });

    expect(report.ok).toBe(false);
    expect(report.errors.some(e => e.code === "AIGC_TOOL_MISSING")).toBe(true);
    expect(report.errors.some(e => e.code === "AIGC_TOOL_POLICY_MISSING")).toBe(true);
  });

  it("rejects tool configs without permission refs and invalid budgets", () => {
    const broken = clone(purchaseRiskAigcModel);
    broken.toolConfigs[0].permissionRefs = [];
    broken.toolPolicies[0].maxCalls = 0;
    broken.toolPolicies[0].timeoutMs = -1;

    const report = aigcSkill.validate(broken, { external: fullSurface });

    expect(report.ok).toBe(false);
    expect(report.errors.some(e => e.code === "AIGC_TOOL_PERMISSION_MISSING")).toBe(true);
    expect(report.errors.some(e => e.code === "AIGC_TOOL_BUDGET_INVALID")).toBe(true);
  });
});

describe("aigcSkill - PEP RBAC gate", () => {
  it("warns when RBAC is not wired and errors when wired RBAC lacks refs", () => {
    const unresolved = aigcSkill.validate(purchaseRiskAigcModel, {
      external: { datamodel: fullSurface.datamodel },
    });
    expect(unresolved.ok).toBe(true);
    expect(unresolved.warnings.some(e => e.code === "AIGC_ROLE_UNRESOLVED")).toBe(true);
    expect(unresolved.warnings.some(e => e.code === "AIGC_PERMISSION_UNRESOLVED")).toBe(true);

    const missing = aigcSkill.validate(purchaseRiskAigcModel, {
      external: { datamodel: fullSurface.datamodel, rbac: { role: ["requester"], permission: ["purchase:create"] } },
    });
    expect(missing.ok).toBe(false);
    expect(missing.errors.some(e => e.code === "AIGC_ROLE_MISSING")).toBe(true);
    expect(missing.errors.some(e => e.code === "AIGC_PERMISSION_MISSING")).toBe(true);
  });

  it("blocks local-only authorization on a PEP capability", () => {
    const broken = clone(purchaseRiskAigcModel);
    broken.capabilities[0].allowWithoutPdp = true;

    const report = aigcSkill.validate(broken, { external: fullSurface });

    expect(report.ok).toBe(false);
    expect(report.errors.some(e => e.code === "AIGC_PEP_BYPASS")).toBe(true);
  });
});

describe("aigcSkill - DataModel SSOT field gate", () => {
  it("rejects missing input/output field refs", () => {
    const broken = clone(purchaseRiskAigcModel);
    broken.capabilities[0].inputFieldRefs = ["purchase_request.missingInput"];
    broken.capabilities[0].outputFieldRefs = ["purchase_request.missingOutput"];

    const report = aigcSkill.validate(broken, { external: fullSurface });

    expect(report.ok).toBe(false);
    expect(report.errors.some(e => e.code === "AIGC_INPUT_FIELD_MISSING")).toBe(true);
    expect(report.errors.some(e => e.code === "AIGC_OUTPUT_FIELD_MISSING")).toBe(true);
  });

  it("warns on deprecated fields and fails on removed fields from DataModel metadata", () => {
    const surface = {
      ...fullSurface.datamodel,
      fields: [
        { ref: "purchase_request.amount", lifecycle: "deprecated" },
        { ref: "purchase_request.vendor", lifecycle: "removed" },
        { ref: "purchase_request.department", lifecycle: "active" },
        { ref: "purchase_request.budgetChecked", lifecycle: "active" },
      ],
    };

    const report = aigcSkill.validate(purchaseRiskAigcModel, {
      external: { datamodel: surface, rbac: fullSurface.rbac },
    });

    expect(report.ok).toBe(false);
    expect(report.warnings.some(e => e.code === "AIGC_FIELD_DEPRECATED")).toBe(true);
    expect(report.errors.some(e => e.code === "AIGC_FIELD_REMOVED")).toBe(true);
  });
});

describe("aigcSkill - projection, resolve, and crossRefs", () => {
  it("projects provider, prompt, output schema, RAG, citation, and tool nodes", () => {
    const projection = aigcSkill.project(purchaseRiskAigcModel);
    const kinds = projection.nodes.map(node => node.kind);

    expect(kinds).toEqual(
      expect.arrayContaining([
        "aigc",
        "capability",
        "provider",
        "prompt",
        "outputSchema",
        "knowledgeSource",
        "retrievalPolicy",
        "citationPolicy",
        "tool",
        "toolPolicy",
      ]),
    );
    expect(projection.mermaid).toContain("budget_risk_summary");
  });

  it("resolves AIGC surfaces and emits RBAC/DataModel cross refs", () => {
    const surface = aigcSkill.resolve(purchaseRiskAigcModel);
    const refs = aigcSkill.crossRefs(purchaseRiskAigcModel);

    expect(surface.aigc).toEqual(["aigc_purchase_risk"]);
    expect(surface.capability).toContain("budget_risk_summary");
    expect(surface.provider).toContain("openai_gpt4o_ref");
    expect(surface.prompt).toContain("purchase_risk_prompt");
    expect(surface.outputSchema).toContain("purchase_risk_output");
    expect(surface.knowledgeSource).toContain("vendor_policy_knowledge");
    expect(surface.tool).toContain("budget_policy_lookup");
    expect(refs.some(ref => ref.toSkill === "datamodel" && ref.toValue === "purchase_request.amount")).toBe(true);
    expect(refs.some(ref => ref.toSkill === "rbac" && ref.toValue === "finance")).toBe(true);
    expect(aigcSkill.refNodeId("capability", "budget_risk_summary")).toBe("aigc_cap_budget_risk_summary");
  });
});
