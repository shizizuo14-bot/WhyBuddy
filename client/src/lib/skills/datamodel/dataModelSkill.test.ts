import { describe, expect, it } from "vitest";

import { dataModelSkill, leaveRequestDataModel } from "./dataModelSkill";
import type { DataModelModel } from "./dataModelModel";

const clone = (m: DataModelModel): DataModelModel => structuredClone(m);

describe("dataModelSkill — the gate", () => {
  it("passes the coherent 请假 data model", () => {
    const report = dataModelSkill.validate(leaveRequestDataModel);
    expect(report.ok).toBe(true);
    expect(report.errors).toHaveLength(0);
  });

  it("CATCHES a ref field pointing at a non-existent entity", () => {
    const broken = clone(leaveRequestDataModel);
    broken.entities[1].fields.find(f => f.key === "applicant")!.refEntity = "ghost_entity";
    const report = dataModelSkill.validate(broken);
    expect(report.ok).toBe(false);
    expect(report.errors.some(e => e.code === "DM_REF_MISSING_ENTITY")).toBe(true);
  });

  it("CATCHES an enum field with no values", () => {
    const broken = clone(leaveRequestDataModel);
    broken.entities[1].fields.find(f => f.key === "leaveType")!.enumValues = [];
    const report = dataModelSkill.validate(broken);
    expect(report.ok).toBe(false);
    expect(report.errors.some(e => e.code === "DM_ENUM_NO_VALUES")).toBe(true);
  });

  it("exposes entities + fields for other skills to reference", () => {
    const surface = dataModelSkill.resolve(leaveRequestDataModel);
    expect(surface.entity).toContain("leave_request");
    expect(surface.field).toContain("leave_request.approved");
  });

  it("supports SSOT stable field identity, lifecycle, namespace and storageRole without breaking existing resolve/validate", () => {
    // Existing sample must continue to validate and resolve exactly as before (no breakage)
    const origReport = dataModelSkill.validate(leaveRequestDataModel);
    expect(origReport.ok).toBe(true);
    const origSurface = dataModelSkill.resolve(leaveRequestDataModel);
    expect(origSurface.entity).toContain("employee");
    expect(origSurface.entity).toContain("leave_request");
    expect(origSurface.field).toContain("leave_request.approved");
    expect(origSurface.field).toContain("employee.name");

    // The real leave-approval sample is the SSOT host; do not prove this only
    // with a temporary test-only model.
    const sampleIdField = leaveRequestDataModel.entities[1].fields.find(f => f.key === "id")!;
    expect(sampleIdField.fieldId).toBe("f_leave_id_v1");
    expect(sampleIdField.version).toBe(1);
    expect(sampleIdField.lifecycle).toBe("active");
    expect(sampleIdField.storageRole).toBe("ssot");
    expect(leaveRequestDataModel.entities[0].namespace).toBe("hr");

    for (const entity of leaveRequestDataModel.entities) {
      expect(entity.namespace).toBeTruthy();
      for (const field of entity.fields) {
        expect(field.fieldId).toMatch(/^f_/);
        expect(field.version).toBeGreaterThan(0);
        expect(field.lifecycle).toBe("active");
        expect(field.storageRole).toBe("ssot");
      }
    }

    // Construct leave-approval style model using stable field IDs + active lifecycle + namespace + ssot role
    const ssotLeaveModel: DataModelModel = {
      entities: [
        {
          id: "employee",
          name: "员工",
          namespace: "hr",
          fields: [
            { key: "id", name: "工号", type: "string", required: true, fieldId: "f_emp_id_v1", version: 1, lifecycle: "active", storageRole: "ssot" },
            { key: "name", name: "姓名", type: "string", required: true, fieldId: "f_emp_name_v1", version: 1, lifecycle: "active", storageRole: "ssot" },
            { key: "dept", name: "部门", type: "string", fieldId: "f_emp_dept_v1", version: 1, lifecycle: "active", storageRole: "ssot" },
          ],
        },
        {
          id: "leave_request",
          name: "请假单",
          namespace: "hr",
          fields: [
            { key: "id", name: "单号", type: "string", required: true, fieldId: "f_leave_id_v1", version: 1, lifecycle: "active", storageRole: "ssot" },
            { key: "applicant", name: "申请人", type: "ref", refEntity: "employee", required: true, fieldId: "f_leave_applicant_v1", version: 1, lifecycle: "active", storageRole: "ssot" },
            { key: "leaveType", name: "请假类型", type: "enum", enumValues: ["年假", "病假", "事假"], fieldId: "f_leave_type_v1", version: 1, lifecycle: "active", storageRole: "ssot" },
            { key: "days", name: "天数", type: "number", required: true, fieldId: "f_leave_days_v1", version: 1, lifecycle: "active", storageRole: "ssot" },
            { key: "reason", name: "事由", type: "string", fieldId: "f_leave_reason_v1", version: 1, lifecycle: "active", storageRole: "ssot" },
            { key: "approved", name: "是否通过", type: "boolean", fieldId: "f_leave_approved_v1", version: 1, lifecycle: "active", storageRole: "ssot" },
          ],
        },
      ],
    };

    const ssotReport = dataModelSkill.validate(ssotLeaveModel);
    expect(ssotReport.ok).toBe(true);
    expect(ssotReport.errors).toHaveLength(0);

    const ssotSurface = dataModelSkill.resolve(ssotLeaveModel);
    expect(ssotSurface.entity).toContain("leave_request");
    expect(ssotSurface.field).toContain("leave_request.approved");
    // current resolve still uses keys (no breakage of relationship behavior)
    expect(ssotSurface.field).toContain("employee.dept");

    // Prove stable IDs and SSOT markers are carried on fields
    const idField = ssotLeaveModel.entities[1].fields.find(f => f.key === "id")!;
    expect(idField.fieldId).toBe("f_leave_id_v1");
    expect(idField.version).toBe(1);
    expect(idField.lifecycle).toBe("active");
    expect(idField.storageRole).toBe("ssot");
    expect(ssotLeaveModel.entities[0].namespace).toBe("hr");

    // OLAP projection role is distinguishable (not authoritative)
    const olapModel: DataModelModel = {
      entities: [{
        id: "leave_request_olap",
        name: "请假单OLAP",
        namespace: "analytics",
        fields: [
          { key: "id", name: "单号", type: "string", fieldId: "f_olap_leave_id", version: 1, lifecycle: "active", storageRole: "olap_projection" },
        ],
      }],
    };
    const olapReport = dataModelSkill.validate(olapModel);
    expect(olapReport.ok).toBe(true);
    expect(olapModel.entities[0].fields[0].storageRole).toBe("olap_projection");
  });

  it("accepts lifecycle values active/deprecated/removed", () => {
    const m: DataModelModel = {
      entities: [{
        id: "x",
        name: "X",
        fields: [
          { key: "id", name: "ID", type: "string", fieldId: "fx1", version: 1, lifecycle: "active", storageRole: "ssot" },
          { key: "old", name: "Old", type: "string", fieldId: "fx2", version: 2, lifecycle: "deprecated", storageRole: "ssot" },
          { key: "removed", name: "Removed", type: "string", fieldId: "fx3", version: 3, lifecycle: "removed", storageRole: "ssot" },
        ],
      }],
    };
    expect(dataModelSkill.validate(m).ok).toBe(true);
  });
});
