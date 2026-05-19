/**
 * Blueprint SDK 子域 2：Clarification（方案 B）。
 *
 * 对应需求 2.1 子域 2、2.3、6.4。
 */

export {
  BLUEPRINT_CLARIFICATIONS_ENDPOINT,
  createBlueprintClarificationSession,
  fetchBlueprintClarificationSession,
  saveBlueprintClarificationAnswers,
} from "../blueprint-api.js";

export type {
  BlueprintClarificationStrategyMetadata,
  BlueprintClarificationStrategyQuestion,
  BlueprintClarificationStrategyAnswer,
  BlueprintClarificationStrategyReadiness,
  BlueprintClarificationStrategySession,
  BlueprintClarificationSessionResponse,
  BlueprintClarificationAnswersRequest,
  CreateBlueprintClarificationSessionResult,
  FetchBlueprintClarificationSessionResult,
  SaveBlueprintClarificationAnswersResult,
} from "../blueprint-api.js";
