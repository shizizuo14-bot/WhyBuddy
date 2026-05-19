/**
 * Blueprint SDK 子域 6：SPEC Documents（方案 B）。
 *
 * 对应需求 2.1 子域 6、2.3、4.1、4.4、6.4。
 */

export {
  fetchBlueprintSpecDocuments,
  generateBlueprintSpecDocuments,
  reviewBlueprintSpecDocument,
  saveBlueprintSpecDocumentVersion,
} from "../blueprint-api.js";

export type {
  FetchBlueprintSpecDocumentsResult,
  GenerateBlueprintSpecDocumentsResult,
  BlueprintSpecDocumentReviewDecision,
} from "../blueprint-api.js";
