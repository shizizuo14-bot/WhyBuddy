import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  FileText,
  RefreshCw,
  Save,
  Send,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  fetchBlueprintSpecDocuments,
  generateBlueprintSpecDocuments,
  reviewBlueprintSpecDocument,
  saveBlueprintSpecDocumentVersion,
  type BlueprintSpecDocumentReviewDecision,
} from "@/lib/blueprint-api";
import type { ApiRequestError } from "@/lib/api-client";
import { blueprintCopy } from "@/lib/blueprint-copy";
import { cn } from "@/lib/utils";
import type {
  BlueprintSpecDocument,
  BlueprintSpecDocumentType,
  BlueprintSpecTree,
  BlueprintSpecTreeNode,
} from "@shared/blueprint/contracts";

interface SpecDocumentWorkbenchPanelProps {
  specTree: BlueprintSpecTree;
  jobId?: string | null;
  initialDocuments?: BlueprintSpecDocument[];
  autoLoad?: boolean;
  onDocumentsChange?: (documents: BlueprintSpecDocument[]) => void;
}

type ReviewStatus = "draft" | "accepted" | "rejected" | "reviewing" | string;
type ReviewAction = BlueprintSpecDocumentReviewDecision | "save-version";
type ReviewableSpecDocument = BlueprintSpecDocument & {
  status?: ReviewStatus;
  reviewStatus?: ReviewStatus;
  reviewState?: ReviewStatus;
  decision?: ReviewStatus;
};

const DOCUMENT_TYPES: Array<{
  type: BlueprintSpecDocumentType;
  label: string;
  filename: string;
}> = [
  { type: "requirements", label: "需求", filename: "requirements.md" },
  { type: "design", label: "设计", filename: "design.md" },
  { type: "tasks", label: "任务", filename: "tasks.md" },
];

function preferredInitialNodeId(specTree: BlueprintSpecTree): string {
  return (
    specTree.nodes.find(node => node.type === "spec_document")?.id ??
    specTree.rootNodeId ??
    specTree.nodes[0]?.id ??
    ""
  );
}

function nodeTypeLabel(type: BlueprintSpecTreeNode["type"]): string {
  const translated = blueprintCopy(type);
  if (translated !== type) return translated;

  return type
    .split("_")
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function reviewStatusLabel(value: ReviewStatus): string {
  const normalized = value.trim().toLowerCase();

  if (normalized === "accepted" || normalized === "approved") return "已接受";
  if (normalized === "rejected" || normalized === "declined") return "已拒绝";
  if (
    normalized === "reviewing" ||
    normalized === "in_review" ||
    normalized === "review"
  ) {
    return "评审中";
  }
  if (normalized === "draft" || normalized === "seed") return "草稿";

  const translated = blueprintCopy(value);
  if (translated !== value) return translated;

  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function readReviewStatus(
  document: BlueprintSpecDocument | null,
  hasGeneratedDocument: boolean
): ReviewStatus {
  if (!document) return "draft";

  const reviewable = document as ReviewableSpecDocument;
  const status =
    reviewable.reviewStatus ??
    reviewable.reviewState ??
    reviewable.decision ??
    reviewable.status;

  return typeof status === "string" && status.trim()
    ? status
    : hasGeneratedDocument
      ? "reviewing"
      : "draft";
}

function buildPreviewFallback(
  node: BlueprintSpecTreeNode | undefined,
  type: BlueprintSpecDocumentType
): string {
  if (!node) return "请选择 SPEC 树节点来预览生成文档。";

  const heading =
    type === "requirements"
      ? "需求"
      : type === "design"
        ? "设计"
        : "任务";
  const outputs = node.outputs.length
    ? node.outputs.map(output => `- ${blueprintCopy(output)}`).join("\n")
    : "- 暂无声明输出。";
  const dependencies = node.dependencies.length
    ? node.dependencies.map(dependency => `- ${blueprintCopy(dependency)}`).join("\n")
    : "- 暂无上游依赖记录。";

  return `# ${heading}：${blueprintCopy(node.title)}

${blueprintCopy(node.summary)}

## 预期输出
${outputs}

## 依赖
${dependencies}
`;
}

export function SpecDocumentWorkbenchPanel({
  specTree,
  jobId = null,
  initialDocuments = [],
  autoLoad = true,
  onDocumentsChange,
}: SpecDocumentWorkbenchPanelProps) {
  const [documents, setDocuments] =
    useState<BlueprintSpecDocument[]>(initialDocuments);
  const [selectedNodeId, setSelectedNodeId] = useState(
    preferredInitialNodeId(specTree)
  );
  const [selectedType, setSelectedType] =
    useState<BlueprintSpecDocumentType>("requirements");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [reviewAction, setReviewAction] = useState<ReviewAction | null>(null);
  const [reviewMessage, setReviewMessage] = useState(
    "选择已生成的 Markdown 文档后即可执行评审操作。"
  );
  const [error, setError] = useState<ApiRequestError | null>(null);

  useEffect(() => {
    setDocuments(initialDocuments);
  }, [initialDocuments]);

  useEffect(() => {
    setSelectedNodeId(current =>
      specTree.nodes.some(node => node.id === current)
        ? current
        : preferredInitialNodeId(specTree)
    );
  }, [specTree]);

  useEffect(() => {
    if (!autoLoad || !jobId || initialDocuments.length > 0) return;

    let active = true;
    setLoading(true);
    setError(null);

    fetchBlueprintSpecDocuments(jobId)
      .then(result => {
        if (!active) return;
        if (result.ok) {
          publishDocuments(result.data.documents);
        } else {
          setError(result.error);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [autoLoad, initialDocuments.length, jobId]);

  const selectedNode = useMemo(
    () =>
      specTree.nodes.find(node => node.id === selectedNodeId) ??
      specTree.nodes[0],
    [selectedNodeId, specTree.nodes]
  );
  const nodeDocuments = useMemo(
    () =>
      documents.filter(document =>
        selectedNode ? document.nodeId === selectedNode.id : false
      ),
    [documents, selectedNode]
  );
  const activeDocument = useMemo(
    () =>
      nodeDocuments.find(document => document.type === selectedType) ?? null,
    [nodeDocuments, selectedType]
  );
  const documentCounts = useMemo(() => {
    return DOCUMENT_TYPES.reduce<Record<BlueprintSpecDocumentType, number>>(
      (acc, item) => {
        acc[item.type] = nodeDocuments.filter(
          document => document.type === item.type
        ).length;
        return acc;
      },
      { requirements: 0, design: 0, tasks: 0 }
    );
  }, [nodeDocuments]);
  const reviewStatus = readReviewStatus(activeDocument, Boolean(activeDocument));
  const reviewStatusText = reviewStatusLabel(reviewStatus);

  const publishDocuments = (nextDocuments: BlueprintSpecDocument[]) => {
    setDocuments(nextDocuments);
    onDocumentsChange?.(nextDocuments);
  };

  const replaceDocument = (nextDocument: BlueprintSpecDocument) => {
    setDocuments(current => {
      const seen = current.some(document => document.id === nextDocument.id);
      const nextDocuments = seen
        ? current.map(document =>
            document.id === nextDocument.id ? nextDocument : document
          )
        : current.concat(nextDocument);
      onDocumentsChange?.(nextDocuments);
      return nextDocuments;
    });
  };

  const handleRefresh = async () => {
    if (!jobId) return;

    setLoading(true);
    setError(null);

    try {
      const result = await fetchBlueprintSpecDocuments(jobId);
      if (result.ok) {
        publishDocuments(result.data.documents);
        setReviewMessage("生成的 Markdown 已准备好评审。");
      } else {
        setError(result.error);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!jobId || !selectedNode) return;

    setGenerating(true);
    setError(null);

    try {
      const result = await generateBlueprintSpecDocuments(jobId, {
        nodeId: selectedNode.id,
        types: DOCUMENT_TYPES.map(item => item.type),
      });

      if (result.ok) {
        publishDocuments(result.data.documents);
        setReviewMessage("生成的 Markdown 已准备好评审。");
      } else {
        setError(result.error);
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleReviewDecision = async (
    decision: BlueprintSpecDocumentReviewDecision
  ) => {
    if (!jobId || !selectedNode || !activeDocument) return;

    setReviewAction(decision);
    setError(null);

    try {
      const result = await reviewBlueprintSpecDocument(jobId, activeDocument.id, {
        status: decision,
        reviewedBy: "spec-document-workbench",
        reviewNote: `从 SPEC 文档工作台标记为${reviewStatusLabel(decision)}。`,
      });

      if (result.ok) {
        replaceDocument(result.data.document);
        setReviewMessage(`文档已标记为${reviewStatusLabel(decision)}。`);
      } else {
        setError(result.error);
      }
    } finally {
      setReviewAction(null);
    }
  };

  const handleSaveVersion = async () => {
    if (!jobId || !selectedNode || !activeDocument) return;

    setReviewAction("save-version");
    setError(null);

    try {
      const result = await saveBlueprintSpecDocumentVersion(
        jobId,
        activeDocument.id,
        {
          savedBy: "spec-document-workbench",
          reviewNote: `从 ${selectedNode.title} / ${selectedType} 保存。`,
        }
      );

      if (result.ok) {
        replaceDocument(result.data.document);
        setReviewMessage(
          `文档版本快照已保存为 v${result.data.version.version}。`
        );
      } else {
        setError(result.error);
      }
    } finally {
      setReviewAction(null);
    }
  };

  return (
    <div
      className="mt-4 rounded-[20px] border border-[#0f766e]/25 bg-[#f0fdfa] px-4 py-4"
      data-testid="spec-document-workbench"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-normal text-[#0f766e]">
            <FileText className="size-3.5" aria-hidden="true" />
            规格文档工作台
          </div>
          <h3 className="mt-2 text-lg font-black text-slate-950">
            需求 / 设计 / 任务
          </h3>
          <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
            选择一个 SPEC 树节点，生成三份规格文档，并在评审、版本化和打包前检查 Markdown 预览。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="gap-2 rounded-full border-[#0f766e]/25 bg-white font-black text-[#0f766e] hover:bg-[#ecfdf5] hover:text-[#115e59]"
            disabled={!jobId || loading || generating}
            onClick={handleRefresh}
            data-testid="spec-document-refresh-button"
          >
            <RefreshCw
              className={cn("size-3.5", loading && "animate-spin")}
              aria-hidden="true"
            />
            刷新
          </Button>
          <Button
            type="button"
            className="gap-2 rounded-full bg-[#0f766e] font-black text-white hover:bg-[#115e59]"
            disabled={!jobId || !selectedNode || generating || loading}
            onClick={handleGenerate}
            data-testid="spec-document-generate-button"
          >
            {generating ? (
              <RefreshCw className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="size-3.5" aria-hidden="true" />
            )}
            生成文档
          </Button>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-[16px] border border-dashed border-rose-200 bg-rose-50 px-4 py-3 text-sm">
          <div className="font-black text-rose-950">{error.message}</div>
          <p className="mt-1 font-semibold leading-6 text-rose-700">
            {error.detail}
          </p>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(250px,0.8fr)_minmax(0,1.2fr)]">
        <div className="rounded-[18px] border border-[#0f766e]/20 bg-white p-3">
          <div className="flex items-center justify-between gap-3 px-1">
            <div className="text-xs font-black uppercase tracking-normal text-slate-500">
              SPEC 树节点
            </div>
            <Badge
              variant="outline"
              className="rounded-full border-[#0f766e]/25 bg-[#0f766e]/10 text-[10px] font-black text-[#0f766e]"
            >
              {documents.length} 份文档
            </Badge>
          </div>
          <ScrollArea className="mt-3 max-h-[360px] pr-2">
            <div className="grid gap-2">
              {specTree.nodes.map(node => {
                const selected = selectedNode?.id === node.id;
                const docTotal = documents.filter(
                  document => document.nodeId === node.id
                ).length;

                return (
                  <button
                    key={node.id}
                    type="button"
                    className={cn(
                      "w-full rounded-[14px] border px-3 py-3 text-left transition",
                      selected
                        ? "border-[#0f766e] bg-[#0f766e]/10"
                        : "border-slate-200 bg-slate-50 hover:border-[#0f766e]/30 hover:bg-white"
                    )}
                    onClick={() => setSelectedNodeId(node.id)}
                    data-testid="spec-document-node-button"
                    aria-pressed={selected}
                  >
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <span className="truncate text-sm font-black text-slate-900">
                        {blueprintCopy(node.title)}
                      </span>
                      <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-slate-500">
                        {docTotal}/3
                      </span>
                    </div>
                    <div className="mt-1 text-[10px] font-black uppercase tracking-normal text-slate-400">
                      {nodeTypeLabel(node.type)}
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        <div className="rounded-[18px] border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-black uppercase tracking-normal text-slate-500">
                文档列表
              </div>
              <h4 className="mt-2 truncate text-base font-black text-slate-950">
                {selectedNode?.title
                  ? blueprintCopy(selectedNode.title)
                  : "尚未选择节点"}
              </h4>
            </div>
            {selectedNode ? (
              <Badge
                variant="outline"
                className="rounded-full border-slate-200 bg-slate-50 text-[10px] font-black text-slate-500"
              >
                {blueprintCopy(selectedNode.status)}
              </Badge>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-normal text-slate-400">
                评审状态
              </div>
              <div
                className="mt-1 text-sm font-black text-slate-900"
                data-testid="spec-document-review-status"
              >
                {reviewStatusText}
              </div>
              <div className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                {reviewMessage}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                className="gap-2 rounded-full bg-[#0f766e] font-black text-white hover:bg-[#115e59]"
                disabled={
                  !jobId || !selectedNode || !activeDocument || Boolean(reviewAction)
                }
                onClick={() => handleReviewDecision("accepted")}
                data-testid="spec-document-accept-button"
              >
                {reviewAction === "accepted" ? (
                  <RefreshCw
                    className="size-3.5 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <CheckCircle2 className="size-3.5" aria-hidden="true" />
                )}
                接受
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2 rounded-full border-rose-200 bg-white font-black text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                disabled={
                  !jobId || !selectedNode || !activeDocument || Boolean(reviewAction)
                }
                onClick={() => handleReviewDecision("rejected")}
                data-testid="spec-document-reject-button"
              >
                {reviewAction === "rejected" ? (
                  <RefreshCw
                    className="size-3.5 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <XCircle className="size-3.5" aria-hidden="true" />
                )}
                拒绝
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2 rounded-full border-slate-200 bg-white font-black text-slate-600 hover:bg-slate-100"
                disabled={
                  !jobId || !selectedNode || !activeDocument || Boolean(reviewAction)
                }
                onClick={handleSaveVersion}
                data-testid="spec-document-save-version-button"
              >
                {reviewAction === "save-version" ? (
                  <RefreshCw
                    className="size-3.5 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Save className="size-3.5" aria-hidden="true" />
                )}
                保存版本
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {DOCUMENT_TYPES.map(item => {
              const selected = selectedType === item.type;
              const count = documentCounts[item.type];

              return (
                <button
                  key={item.type}
                  type="button"
                  className={cn(
                    "rounded-[14px] border px-3 py-3 text-left transition",
                    selected
                      ? "border-[#0f766e] bg-[#0f766e]/10"
                      : "border-slate-200 bg-slate-50 hover:border-[#0f766e]/30 hover:bg-white"
                  )}
                  onClick={() => setSelectedType(item.type)}
                  data-testid="spec-document-type-button"
                  aria-pressed={selected}
                >
                  <div className="text-sm font-black text-slate-900">
                    {item.label}
                  </div>
                  <div className="mt-1 text-xs font-bold text-slate-500">
                    {count ? "已生成" : "草稿预览"}
                  </div>
                  <div className="mt-1 truncate text-[10px] font-black text-slate-400">
                    {item.filename}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-4 rounded-[16px] border border-slate-200 bg-slate-950">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2">
              <span className="text-xs font-black text-slate-300">
                {activeDocument?.title
                  ? blueprintCopy(activeDocument.title)
                  : DOCUMENT_TYPES.find(item => item.type === selectedType)
                      ?.filename}
              </span>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-normal text-slate-300">
                markdown
              </span>
            </div>
            <pre
              className="max-h-[360px] min-h-[220px] overflow-auto whitespace-pre-wrap px-4 py-4 text-xs leading-6 text-slate-100"
              data-testid="spec-document-preview"
            >
              {activeDocument?.content
                ? blueprintCopy(activeDocument.content)
                : buildPreviewFallback(selectedNode, selectedType)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SpecDocumentWorkbenchPanel;
