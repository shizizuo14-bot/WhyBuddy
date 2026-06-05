/**
 * `blueprint-checks-ledger` spec Task 2.1：服务层类型定义。
 *
 * 定义 ChecksLedgerService 接口、录入输入与查询过滤器。
 * 纯类型文件，无 runtime 副作用。
 */

import type {
  BlueprintCheckType,
  BlueprintCheckStatus,
  BlueprintChecksLedgerEntry,
  BlueprintChecksLedgerResponse,
  BlueprintChecksLedgerSummary,
} from "../../../../shared/blueprint/checks-ledger/types.js";
import type { BlueprintGenerationStage } from "../../../../shared/blueprint/contracts.js";

export type {
  BlueprintCheckType,
  BlueprintCheckStatus,
  BlueprintChecksLedgerEntry,
  BlueprintChecksLedgerResponse,
  BlueprintChecksLedgerSummary,
};

/** `recordCheck()` 输入参数 */
export interface RecordCheckInput {
  jobId: string;
  stage: BlueprintGenerationStage;
  checkType: BlueprintCheckType;
  checkName: string;
  status: BlueprintCheckStatus;
  validator: string;
  exitCode?: number;
  output?: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

/** `getChecks()` 过滤参数 */
export interface GetChecksFilter {
  stage?: BlueprintGenerationStage;
  status?: BlueprintCheckStatus;
  checkType?: BlueprintCheckType;
}

/** 校验台账服务接口 */
export interface ChecksLedgerService {
  /** 追加一条校验记录（append-only） */
  recordCheck(input: RecordCheckInput): BlueprintChecksLedgerEntry;
  /** 查询某 job 的校验记录（支持过滤） */
  getChecks(jobId: string, filter?: GetChecksFilter): BlueprintChecksLedgerResponse;
  /** 判断某 job 是否通过所有检查（无 fail 条目且至少 1 条 pass） */
  isGatePassed(jobId: string): boolean;
  /** 渲染为 Markdown 导出格式 */
  renderMarkdown(jobId: string): string;
}
