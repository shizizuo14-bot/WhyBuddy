export type AigcCapabilityKind =
  | "summary"
  | "classification"
  | "extraction"
  | "recommendation"
  | "tool_orchestration";

export type AigcPepMarker = "pep";

export type OutputSchemaFieldType = "string" | "number" | "boolean" | "enum" | "object" | "array";

export interface AigcCapability {
  id: string;
  name: string;
  kind: AigcCapabilityKind;
  flowRef?: string;
  providerRef?: string;
  promptRef?: string;
  outputSchemaRef?: string;
  inputFieldRefs?: string[];
  outputFieldRefs?: string[];
  allowedRoleRefs?: string[];
  permissionRefs?: string[];
  knowledgeSourceRefs?: string[];
  retrievalPolicyRef?: string;
  citationPolicyRef?: string;
  toolRefs?: string[];
  toolPolicyRef?: string;
  allowWithoutPdp?: boolean;
  traceSpan?: string;
}

export interface ModelProviderRef {
  id: string;
  name: string;
  providerRef: string;
  modelRef: string;
  tokenBudget: number;
  keyRef?: string;
  secretRef?: string;
  apiKey?: never;
  secret?: never;
  rawKey?: never;
}

export interface PromptTemplate {
  id: string;
  version: string;
  template: string;
  variables?: string[];
}

export interface OutputSchemaField {
  key: string;
  type: OutputSchemaFieldType;
  required?: boolean;
  enumValues?: string[];
  writebackFieldRef?: string;
}

export interface OutputSchema {
  id: string;
  version: string;
  fields: OutputSchemaField[];
}

export interface KnowledgeSource {
  id: string;
  name: string;
  datasourceRef: string;
  fieldRefs?: string[];
}

export interface RetrievalPolicy {
  id: string;
  allowedRoleRefs: string[];
  permissionRefs: string[];
  maxResults: number;
  localDecision?: "allow" | "deny";
}

export interface CitationPolicy {
  id: string;
  citationRequired: boolean;
  sourceFieldRefs?: string[];
}

export interface ToolSkillConfig {
  id: string;
  name: string;
  kind: "lookup" | "api" | "mcp" | "workflow";
  toolRefs: string[];
  skillRefs?: string[];
  permissionRefs: string[];
  budgetPolicyRef: string;
}

export interface ToolPolicy {
  id: string;
  whitelist: string[];
  permissionRefs: string[];
  maxCalls: number;
  timeoutMs: number;
}

export interface AigcModel {
  id: string;
  name: string;
  pep: AigcPepMarker;
  capabilities: AigcCapability[];
  providers: ModelProviderRef[];
  promptTemplates: PromptTemplate[];
  outputSchemas: OutputSchema[];
  knowledgeSources: KnowledgeSource[];
  retrievalPolicies: RetrievalPolicy[];
  citationPolicies: CitationPolicy[];
  toolConfigs: ToolSkillConfig[];
  toolPolicies: ToolPolicy[];
  traceSpan?: string;
}
