import type {
  WebAigcFieldSchema,
  WebAigcGraphDefinition,
  WebAigcGraphInstance,
  WebAigcNodeSchema,
} from "./workflow-domain.js";

export interface WorkflowNodeExecutionContext {
  definition: WebAigcGraphDefinition;
  instance: WebAigcGraphInstance;
  node: WebAigcNodeSchema;
  input: Record<string, unknown>;
  variables: Record<string, unknown>;
  resumePayload?: Record<string, unknown>;
}

export interface WorkflowNodeAdvanceResult {
  kind: "advance";
  output?: Record<string, unknown>;
  nextNodeId?: string;
}

export interface WorkflowNodeWaitResult {
  kind: "wait";
  waitingFor: string;
  output?: Record<string, unknown>;
  inputSchema?: WebAigcFieldSchema[];
  checkpointData?: Record<string, unknown>;
}

export interface WorkflowNodeCompleteResult {
  kind: "complete";
  output?: Record<string, unknown>;
}

export interface WorkflowNodeErrorResult {
  kind: "error";
  message: string;
  output?: Record<string, unknown>;
  retryable?: boolean;
}

export type WorkflowNodeAdapterResult =
  | WorkflowNodeAdvanceResult
  | WorkflowNodeWaitResult
  | WorkflowNodeCompleteResult
  | WorkflowNodeErrorResult;

export interface WorkflowNodeAdapter {
  type: string;
  execute(context: WorkflowNodeExecutionContext): Promise<WorkflowNodeAdapterResult>;
  resume?(
    context: WorkflowNodeExecutionContext,
  ): Promise<WorkflowNodeAdapterResult>;
}
