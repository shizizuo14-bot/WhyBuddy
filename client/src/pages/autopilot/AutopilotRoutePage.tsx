import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  FileSearch,
  GitBranch,
  HelpCircle,
  Layers3,
  Link2,
  RefreshCw,
  Route,
  Send,
  ShieldCheck,
} from "lucide-react";

import { Scene3D } from "@/components/Scene3D";
import { SPECS_PATH } from "@/components/navigation-config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ApiRequestError } from "@/lib/api-client";
import {
  createBlueprintClarificationSession,
  createBlueprintGenerationJob,
  createBlueprintIntake,
  fetchBlueprintProjectContext,
  saveBlueprintClarificationAnswers,
  selectBlueprintRoute,
} from "@/lib/blueprint-api";
import { useProjectStore } from "@/lib/project-store";
import { blueprintCopy } from "@/lib/blueprint-copy";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type {
  BlueprintClarificationAnswer,
  BlueprintClarificationReadiness,
  BlueprintClarificationSession,
  BlueprintGenerationJob,
  BlueprintIntake,
  BlueprintProjectDomainContext,
  BlueprintRouteCandidate,
  BlueprintRouteSelection,
  BlueprintRouteSet,
  BlueprintSpecTree,
} from "@shared/blueprint/contracts";

import BlueprintProgressPanel from "../specs/BlueprintProgressPanel";

const GITHUB_URL_PATTERN = /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+/i;

function normalizeGithubUrl(value: string): string {
  return value.trim().replace(/\/+$/, "").toLowerCase();
}

function parseGithubInput(value: string): {
  urls: string[];
  duplicates: string[];
} {
  const seen = new Set<string>();
  const urls: string[] = [];
  const duplicates: string[] = [];

  value
    .split(/[\s,]+/)
    .map(item => item.trim())
    .filter(Boolean)
    .forEach(item => {
      if (!GITHUB_URL_PATTERN.test(item)) return;
      const normalized = normalizeGithubUrl(item);
      if (seen.has(normalized)) {
        duplicates.push(item);
        return;
      }
      seen.add(normalized);
      urls.push(item);
    });

  return { urls, duplicates };
}

function readReadinessLabel(
  readiness: BlueprintClarificationReadiness | undefined
): string {
  if (!readiness) return "待确认";
  const score = Math.round((readiness.score ?? 0) * 100);
  if (readiness.status === "ready") return `已就绪 / ${score}%`;
  return `必答 ${readiness.answeredRequired}/${readiness.requiredTotal} / ${score}%`;
}

function routeLevelLabel(level: string): string {
  if (level === "low") return "低";
  if (level === "medium") return "中";
  if (level === "high") return "高";
  return level;
}

function readAutopilotJobStatus(job: BlueprintGenerationJob | null): string {
  if (!job) return "尚未生成 RouteSet";
  if (job.stage === "spec_tree" && job.status === "reviewing") {
    return "SPEC 树草稿待确认";
  }
  return `${blueprintCopy(job.stage)} / ${blueprintCopy(job.status)}`;
}

function buildAnswersFromDrafts(
  session: BlueprintClarificationSession | null,
  answerDrafts: Record<string, string>
): BlueprintClarificationAnswer[] {
  if (!session) return [];
  return session.questions
    .map(question => ({
      questionId: question.id,
      answer: answerDrafts[question.id]?.trim() ?? "",
    }))
    .filter(item => item.answer.length > 0);
}

function ApiErrorNotice({
  error,
  className,
}: {
  error: ApiRequestError | null;
  className?: string;
}) {
  if (!error) return null;
  return (
    <div
      className={cn(
        "rounded-[16px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800",
        className
      )}
      role="alert"
      data-testid="autopilot-api-error"
    >
      <div className="font-black">{error.message}</div>
      <div className="mt-1 text-rose-700">{error.detail}</div>
    </div>
  );
}

function StatPill({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  tone?: "neutral" | "good" | "warn";
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-[16px] border px-3 py-2",
        tone === "good"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : tone === "warn"
            ? "border-amber-200 bg-amber-50 text-amber-900"
            : "border-slate-200 bg-white text-slate-700"
      )}
    >
      <div className="text-[11px] font-black uppercase tracking-normal opacity-70">
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-black">{value}</div>
    </div>
  );
}

function ProjectContextSummary({
  context,
}: {
  context: BlueprintProjectDomainContext | null;
}) {
  if (!context) {
    return (
      <div
        className="rounded-[16px] border border-dashed border-slate-300 bg-white/70 px-4 py-3 text-sm font-bold text-slate-500"
        data-testid="autopilot-project-context"
      >
        项目上下文正在等待已选项目或后端响应。
      </div>
    );
  }

  return (
    <div
      className="grid gap-2 sm:grid-cols-3"
      data-testid="autopilot-project-context"
    >
      <StatPill label="上下文资产" value={context.assets.length} />
      <StatPill label="证据" value={context.evidence.length} />
      <StatPill label="输入记录" value={context.intakeIds.length} />
    </div>
  );
}

function IntakeSummary({ intake }: { intake: BlueprintIntake | null }) {
  if (!intake) {
    return (
      <div className="rounded-[16px] border border-dashed border-slate-300 bg-white/70 px-4 py-3 text-sm font-bold text-slate-500">
        先创建输入，再解析 GitHub 源并挂接项目上下文。
      </div>
    );
  }

  const duplicateUrls = intake.duplicateGithubUrls.map(
    source => source.url || source.normalizedUrl || source.id
  );

  return (
    <div className="grid gap-3" data-testid="autopilot-intake-summary">
      <div className="grid gap-2 sm:grid-cols-3">
        <StatPill label="输入" value={intake.id} />
        <StatPill label="来源" value={intake.sources.length} tone="good" />
        <StatPill
          label="重复链接"
          value={duplicateUrls.length}
          tone={duplicateUrls.length > 0 ? "warn" : "neutral"}
        />
      </div>

      {intake.sources.length > 0 ? (
        <div className="grid gap-2">
          {intake.sources.map(source => (
            <div
              key={source.id}
              className="flex min-w-0 items-start gap-3 rounded-[16px] border border-slate-200 bg-white px-3 py-3"
            >
              <GitBranch
                className="mt-0.5 size-4 shrink-0 text-[#0f766e]"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <div className="truncate text-sm font-black text-slate-800">
                  {blueprintCopy(
                    source.slug || `${source.owner}/${source.repo}`
                  )}
                </div>
                <div className="mt-1 break-all text-xs font-semibold text-slate-500">
                  {source.normalizedUrl || source.url}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {duplicateUrls.length > 0 ? (
        <div className="rounded-[16px] border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-900">
          重复链接：{duplicateUrls.join(", ")}
        </div>
      ) : null}
    </div>
  );
}

function ClarificationPanel({
  session,
  answerDrafts,
  onAnswerChange,
}: {
  session: BlueprintClarificationSession | null;
  answerDrafts: Record<string, string>;
  onAnswerChange: (questionId: string, answer: string) => void;
}) {
  if (!session) {
    return (
      <div className="rounded-[16px] border border-dashed border-slate-300 bg-white/70 px-4 py-3 text-sm font-bold text-slate-500">
        先生成输入，再补充澄清，这样 RouteSet 的假设会更少。
      </div>
    );
  }

  if (session.questions.length === 0) {
    return (
      <div className="rounded-[16px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-800">
        当前没有阻塞性的澄清项。
      </div>
    );
  }

  return (
    <div className="grid gap-3" data-testid="autopilot-clarification-list">
      {session.questions.map(question => (
        <label
          key={question.id}
          className="grid gap-2 rounded-[16px] border border-slate-200 bg-white px-4 py-3"
        >
          <span className="flex flex-wrap items-center gap-2 text-sm font-black text-slate-800">
            {blueprintCopy(question.prompt)}
            {question.required ? (
              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] text-rose-700">
                必答
              </span>
            ) : null}
          </span>
          <textarea
            value={answerDrafts[question.id] ?? ""}
            onChange={event => onAnswerChange(question.id, event.target.value)}
            className="min-h-[74px] resize-y rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold leading-6 text-slate-700 outline-none transition focus:border-[#0f766e]/50 focus:ring-2 focus:ring-[#0f766e]/15"
            placeholder="填写这条路线规划问题的答案"
            data-testid={`autopilot-answer-${question.id}`}
          />
        </label>
      ))}
    </div>
  );
}

function RouteCandidateCard({
  route,
  primary,
  selected,
  selecting,
  onSelect,
}: {
  route: BlueprintRouteCandidate;
  primary: boolean;
  selected: boolean;
  selecting: boolean;
  onSelect: (routeId: string) => void;
}) {
  return (
    <article
      className={cn(
        "rounded-[16px] border bg-white px-4 py-4",
        selected ? "border-[#0f766e] shadow-sm" : "border-slate-200"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-base font-black text-slate-950">
              {blueprintCopy(route.title)}
            </h4>
            <Badge className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600 hover:bg-slate-100">
              {primary ? "主路" : "备选"}
            </Badge>
            {selected ? (
              <Badge className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 hover:bg-emerald-50">
                已选
              </Badge>
            ) : null}
          </div>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
            {blueprintCopy(route.summary)}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant={selected ? "outline" : "default"}
          className={cn(
            "gap-2 rounded-full font-black",
            selected
              ? "border-[#0f766e]/30 bg-emerald-50 text-[#0f766e] hover:bg-emerald-50"
              : "bg-[#0f766e] text-white hover:bg-[#115e59]"
          )}
          disabled={selected || selecting}
          onClick={() => onSelect(route.id)}
          data-testid={`autopilot-select-route-${route.id}`}
        >
          {selecting ? (
            <RefreshCw className="size-3.5 animate-spin" aria-hidden="true" />
          ) : selected ? (
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
          ) : (
            <Route className="size-3.5" aria-hidden="true" />
          )}
          {selected ? "已选择" : "选择"}
        </Button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <StatPill label="风险" value={routeLevelLabel(route.riskLevel)} />
        <StatPill label="成本" value={routeLevelLabel(route.costLevel)} />
        <StatPill label="投入" value={blueprintCopy(route.estimatedEffort)} />
      </div>
    </article>
  );
}

function RouteSetPanel({
  job,
  routeSet,
  selection,
  selectingRouteId,
  onSelectRoute,
}: {
  job: BlueprintGenerationJob | null;
  routeSet: BlueprintRouteSet | null;
  selection: BlueprintRouteSelection | null;
  selectingRouteId: string | null;
  onSelectRoute: (routeId: string) => void;
}) {
  if (!routeSet) {
    return (
      <section
        className="rounded-[24px] border border-slate-200 bg-white px-5 py-5 shadow-[0_18px_42px_rgba(15,23,42,0.06)]"
        data-testid="autopilot-routeset-empty"
      >
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-normal text-slate-500">
          <Route className="size-3.5" aria-hidden="true" />
          RouteSet 路线集
        </div>
        <h2 className="mt-2 text-xl font-black text-slate-950">
          尚未生成 RouteSet
        </h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
          可先走预检，也可以直接生成，以创建路线候选项。
        </p>
      </section>
    );
  }

  const primaryRoute =
    routeSet.routes.find(route => route.id === routeSet.primaryRouteId) ??
    routeSet.routes[0];
  const alternativeRoutes = routeSet.routes.filter(
    route => route.id !== primaryRoute?.id
  );

  return (
    <section
      className="rounded-[24px] border border-slate-200 bg-white px-5 py-5 shadow-[0_18px_42px_rgba(15,23,42,0.06)]"
      data-testid="autopilot-routeset-panel"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-normal text-slate-500">
            <Route className="size-3.5" aria-hidden="true" />
            RouteSet 结果
          </div>
          <h2 className="mt-2 text-xl font-black text-slate-950">
            {selection ? "已选择用于推导的路线" : "请选择 RouteSet 路线"}
          </h2>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-500">
            {blueprintCopy(routeSet.nextAsset.description)}
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
          {job
            ? readAutopilotJobStatus(job)
            : `${routeSet.routes.length} 条路线`}
        </span>
      </div>

      <div className="mt-4 grid gap-3">
        {primaryRoute ? (
          <RouteCandidateCard
            route={primaryRoute}
            primary
            selected={selection?.routeId === primaryRoute.id}
            selecting={selectingRouteId === primaryRoute.id}
            onSelect={onSelectRoute}
          />
        ) : null}
        {alternativeRoutes.map(route => (
          <RouteCandidateCard
            key={route.id}
            route={route}
            primary={false}
            selected={selection?.routeId === route.id}
            selecting={selectingRouteId === route.id}
            onSelect={onSelectRoute}
          />
        ))}
      </div>
    </section>
  );
}

export function AutopilotSpecTreeHandoffPanel({
  job,
  selection,
  specTree,
}: {
  job: BlueprintGenerationJob | null;
  selection: BlueprintRouteSelection | null;
  specTree: BlueprintSpecTree | null;
}) {
  if (!job || !selection || job.stage !== "spec_tree") {
    return null;
  }

  return (
    <section
      className="rounded-[24px] border border-[#0f766e]/25 bg-[#f0fdfa] px-5 py-5 shadow-[0_18px_42px_rgba(15,23,42,0.06)]"
      data-testid="autopilot-spec-tree-handoff"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-normal text-[#0f766e]">
            <FileSearch className="size-3.5" aria-hidden="true" />
            阶段交接
          </div>
          <h2 className="mt-2 text-xl font-black text-slate-950">
            自动驾驶阶段已完成，SPEC 树草稿待确认
          </h2>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
            {
              "这里不是后台卡住了。自动驾驶页负责生成 RouteSet、选择主路径或备选路径，并把选中的路线沉淀成 SPEC 树草稿；后续的微调、保存版本、规格文档、效果预演和实现提示词会在推导菜单继续。"
            }
          </p>
        </div>
        <Button
          asChild
          className="gap-2 rounded-full bg-[#0f766e] px-5 font-black text-white hover:bg-[#115e59]"
        >
          <a href={SPECS_PATH} data-testid="autopilot-open-specs-link">
            进入推导工作台
            <ArrowRight className="size-4" aria-hidden="true" />
          </a>
        </Button>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-4">
        <StatPill
          label="当前状态"
          value={readAutopilotJobStatus(job)}
          tone="good"
        />
        <StatPill
          label="SPEC 节点"
          value={specTree ? `${specTree.nodes.length} 个` : "已生成"}
        />
        <StatPill
          label="已选路线"
          value={blueprintCopy(selection.routeTitle)}
        />
        <StatPill label="下一站" value="推导 / 规格文档" tone="warn" />
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-3">
        {[
          "推导：微调、增删和保存 SPEC 树节点",
          "规格文档：生成 requirements / design / tasks",
          "效果预演与提示词：绑定已确认的 SPEC 继续展开",
        ].map(item => (
          <div
            key={item}
            className="rounded-[16px] border border-[#0f766e]/20 bg-white/78 px-3 py-3 text-xs font-black leading-5 text-slate-600"
          >
            {item}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function AutopilotRoutePage() {
  const locale = useAppStore(state => state.locale);
  const setLocale = useAppStore(state => state.setLocale);
  const currentProjectId = useProjectStore(state => state.currentProjectId);
  const projects = useProjectStore(state => state.projects);
  const currentProject =
    projects.find(project => project.id === currentProjectId) ?? null;

  const [targetText, setTargetText] = useState("");
  const [githubInput, setGithubInput] = useState("");
  const [intake, setIntake] = useState<BlueprintIntake | null>(null);
  const [projectContext, setProjectContext] =
    useState<BlueprintProjectDomainContext | null>(null);
  const [clarificationSession, setClarificationSession] =
    useState<BlueprintClarificationSession | null>(null);
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});
  const [latestJob, setLatestJob] = useState<BlueprintGenerationJob | null>(
    null
  );
  const [routeSet, setRouteSet] = useState<BlueprintRouteSet | null>(null);
  const [selection, setSelection] = useState<BlueprintRouteSelection | null>(
    null
  );
  const [specTree, setSpecTree] = useState<BlueprintSpecTree | null>(null);
  const [apiError, setApiError] = useState<ApiRequestError | null>(null);
  const [creatingIntake, setCreatingIntake] = useState(false);
  const [loadingContext, setLoadingContext] = useState(false);
  const [generatingClarifications, setGeneratingClarifications] =
    useState(false);
  const [savingAnswers, setSavingAnswers] = useState(false);
  const [generatingRouteSet, setGeneratingRouteSet] = useState(false);
  const [selectingRouteId, setSelectingRouteId] = useState<string | null>(null);

  const parsedGithub = useMemo(
    () => parseGithubInput(githubInput),
    [githubInput]
  );
  const target = targetText.trim();
  const canCreateIntake = target.length > 0 || parsedGithub.urls.length > 0;
  const canGenerateRouteSet = canCreateIntake || Boolean(intake);
  const readiness =
    clarificationSession?.readiness ?? intake?.readiness ?? undefined;
  const readinessReady = readiness?.status === "ready";
  const answers = useMemo(
    () => buildAnswersFromDrafts(clarificationSession, answerDrafts),
    [answerDrafts, clarificationSession]
  );

  useEffect(() => {
    if (locale !== "zh-CN") {
      setLocale("zh-CN");
    }
  }, [locale, setLocale]);

  useEffect(() => {
    let active = true;
    setProjectContext(null);
    if (!currentProjectId) return;

    setLoadingContext(true);
    fetchBlueprintProjectContext(currentProjectId)
      .then(result => {
        if (!active) return;
        if (result.ok) {
          setProjectContext(result.data.projectContext);
        }
      })
      .finally(() => {
        if (active) setLoadingContext(false);
      });

    return () => {
      active = false;
    };
  }, [currentProjectId]);

  const handleAnswerChange = useCallback(
    (questionId: string, answer: string) => {
      setAnswerDrafts(previous => ({ ...previous, [questionId]: answer }));
    },
    []
  );

  const handleCreateIntake = useCallback(async () => {
    if (!canCreateIntake) return;
    setCreatingIntake(true);
    setApiError(null);

    try {
      const result = await createBlueprintIntake({
        projectId: currentProjectId ?? undefined,
        targetText: target || undefined,
        githubUrls: parsedGithub.urls,
      });

      if (result.ok) {
        setIntake(result.data.intake);
        setClarificationSession(result.data.clarificationSession ?? null);
        if (result.data.projectContext) {
          setProjectContext(result.data.projectContext);
        }
        const existingAnswers = result.data.clarificationSession?.answers ?? [];
        setAnswerDrafts(
          Object.fromEntries(
            existingAnswers.map(answer => [answer.questionId, answer.answer])
          )
        );
      } else {
        setApiError(result.error);
      }
    } finally {
      setCreatingIntake(false);
    }
  }, [canCreateIntake, currentProjectId, parsedGithub.urls, target]);

  const handleGenerateClarifications = useCallback(async () => {
    if (!intake) return;
    setGeneratingClarifications(true);
    setApiError(null);

    try {
      const result = await createBlueprintClarificationSession(intake.id, {
        projectId: currentProjectId ?? undefined,
      });

      if (result.ok) {
        setClarificationSession(result.data.clarificationSession);
        if (result.data.projectContext) {
          setProjectContext(result.data.projectContext);
        }
        const existingAnswers = result.data.clarificationSession.answers ?? [];
        setAnswerDrafts(
          Object.fromEntries(
            existingAnswers.map(answer => [answer.questionId, answer.answer])
          )
        );
      } else {
        setApiError(result.error);
      }
    } finally {
      setGeneratingClarifications(false);
    }
  }, [currentProjectId, intake]);

  const handleSaveAnswers = useCallback(async () => {
    if (!clarificationSession) return;
    setSavingAnswers(true);
    setApiError(null);

    try {
      const result = await saveBlueprintClarificationAnswers(
        clarificationSession.id,
        { answers, answeredBy: "autopilot" },
        clarificationSession.answers.length > 0 ? "PATCH" : "POST"
      );

      if (result.ok) {
        setClarificationSession(result.data.clarificationSession);
        if (result.data.intake) {
          setIntake(result.data.intake);
        }
        if (result.data.projectContext) {
          setProjectContext(result.data.projectContext);
        }
      } else {
        setApiError(result.error);
      }
    } finally {
      setSavingAnswers(false);
    }
  }, [answers, clarificationSession]);

  const handleGenerateRouteSet = useCallback(async () => {
    if (!canGenerateRouteSet) return;
    setGeneratingRouteSet(true);
    setApiError(null);

    try {
      const result = await createBlueprintGenerationJob({
        mode: "autopilot_route",
        projectId: currentProjectId ?? undefined,
        targetText: target || intake?.targetText || undefined,
        githubUrls:
          parsedGithub.urls.length > 0 ? parsedGithub.urls : intake?.githubUrls,
        intakeId: intake?.id,
        clarificationSessionId: clarificationSession?.id,
        clarifications: answers,
        domainContext: projectContext ?? undefined,
      });

      if (result.ok) {
        setLatestJob(result.data.job);
        setRouteSet(result.data.routeSet ?? null);
        setSelection(null);
        setSpecTree(null);
        if (result.data.intake) {
          setIntake(result.data.intake);
        }
        if (result.data.clarificationSession) {
          setClarificationSession(result.data.clarificationSession);
        }
        if (result.data.projectContext) {
          setProjectContext(result.data.projectContext);
        }
      } else {
        setApiError(result.error);
      }
    } finally {
      setGeneratingRouteSet(false);
    }
  }, [
    answers,
    canGenerateRouteSet,
    clarificationSession?.id,
    currentProjectId,
    intake,
    parsedGithub.urls,
    projectContext,
    target,
  ]);

  const handleSelectRoute = useCallback(
    async (routeId: string) => {
      if (!latestJob) return;
      setSelectingRouteId(routeId);
      setApiError(null);

      try {
        const result = await selectBlueprintRoute(latestJob.id, {
          routeId,
          reason: "Selected from the autopilot RouteSet preflight page.",
          selectedBy: "autopilot",
        });

        if (result.ok) {
          setLatestJob(result.data.job);
          setRouteSet(result.data.routeSet);
          setSelection(result.data.selection);
          setSpecTree(result.data.specTree);
        } else {
          setApiError(result.error);
        }
      } finally {
        setSelectingRouteId(null);
      }
    },
    [latestJob]
  );

  return (
    <main
      className="relative min-h-screen overflow-hidden bg-[#edf5f7] px-4 py-4 text-slate-950 sm:px-6 sm:py-6 lg:px-10"
      data-testid="autopilot-route-page"
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[min(68svh,620px)] min-h-[420px] overflow-hidden"
        data-testid="autopilot-scene-visual"
        aria-hidden="true"
      >
        <Scene3D performanceProfile="balanced" projectId={currentProjectId} />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(237,245,247,0.96)_0%,rgba(237,245,247,0.74)_38%,rgba(237,245,247,0.22)_72%,rgba(237,245,247,0.08)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-36 bg-[linear-gradient(180deg,rgba(237,245,247,0)_0%,#edf5f7_78%)]" />
      </div>

      <div className="relative z-10 mx-auto flex max-w-6xl flex-col gap-4">
        <section className="grid min-h-[420px] items-end pb-4 pt-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,0.65fr)] lg:items-center lg:pb-10 lg:pt-10">
          <header className="max-w-3xl rounded-[24px] border border-white/70 bg-white/[0.88] px-5 py-5 shadow-[0_18px_42px_rgba(15,23,42,0.10)] backdrop-blur-md">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-black uppercase tracking-normal text-slate-500">
                  自动驾驶
                </div>
                <h1 className="mt-2 text-2xl font-black tracking-normal text-slate-950 sm:text-3xl">
                  RouteSet 生成与选择
                </h1>
                <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
                  从执行目标或 GitHub 地址开始，先收集缺失上下文和澄清问题，
                  再生成带有输入与澄清溯源的 RouteSet。
                </p>
              </div>
              {currentProject ? (
                <Badge className="rounded-full bg-[#0f766e]/12 px-3 py-1 text-[#0f766e] hover:bg-[#0f766e]/12">
                  {currentProject.name}
                </Badge>
              ) : null}
            </div>
          </header>
        </section>

        <section
          className="rounded-[24px] border border-slate-200 bg-white px-5 py-5 shadow-[0_18px_42px_rgba(15,23,42,0.06)]"
          data-testid="autopilot-preflight"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-normal text-slate-500">
                <ShieldCheck className="size-3.5" aria-hidden="true" />
                预检
              </div>
              <h2 className="mt-2 text-xl font-black text-slate-950">
                输入、GitHub 源与澄清
              </h2>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-500">
                最终 RouteSet 请求会兼容执行目标与 GitHub
                地址，同时在预检完成后带上输入记录和澄清会话。
              </p>
            </div>
            <span
              className={cn(
                "rounded-full px-3 py-1 text-xs font-black",
                readinessReady
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-slate-100 text-slate-600"
              )}
              data-testid="autopilot-readiness"
            >
              {readReadinessLabel(readiness)}
            </span>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.72fr)]">
            <div className="grid gap-3">
              <label className="grid gap-2">
                <span className="text-sm font-black text-slate-800">
                  执行目标
                </span>
                <textarea
                  value={targetText}
                  onChange={event => setTargetText(event.target.value)}
                  className="min-h-[104px] resize-y rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold leading-6 text-slate-700 outline-none transition focus:border-[#0f766e]/50 focus:ring-2 focus:ring-[#0f766e]/15"
                  placeholder="描述你希望 RouteSet 规划出的最终结果。"
                  data-testid="autopilot-target-input"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-black text-slate-800">
                  GitHub 地址
                </span>
                <textarea
                  value={githubInput}
                  onChange={event => setGithubInput(event.target.value)}
                  className="min-h-[92px] resize-y rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold leading-6 text-slate-700 outline-none transition focus:border-[#0f766e]/50 focus:ring-2 focus:ring-[#0f766e]/15"
                  placeholder="https://github.com/org/repo"
                  data-testid="autopilot-github-input"
                />
              </label>

              <div className="grid gap-2 sm:grid-cols-3">
                <StatPill label="已解析链接" value={parsedGithub.urls.length} />
                <StatPill
                  label="本地重复"
                  value={parsedGithub.duplicates.length}
                  tone={parsedGithub.duplicates.length > 0 ? "warn" : "neutral"}
                />
                <StatPill
                  label="项目上下文"
                  value={
                    loadingContext
                      ? "加载中"
                      : projectContext
                        ? "已挂接"
                        : "待处理"
                  }
                  tone={projectContext ? "good" : "neutral"}
                />
              </div>

              {parsedGithub.duplicates.length > 0 ? (
                <div className="rounded-[16px] border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-900">
                  本地重复链接：{parsedGithub.duplicates.join(", ")}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="gap-2 rounded-full bg-[#0f766e] px-5 font-black text-white hover:bg-[#115e59]"
                  disabled={!canCreateIntake || creatingIntake}
                  onClick={handleCreateIntake}
                  data-testid="autopilot-create-intake-button"
                >
                  {creatingIntake ? (
                    <RefreshCw
                      className="size-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Link2 className="size-4" aria-hidden="true" />
                  )}
                  创建输入
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2 rounded-full border-slate-200 bg-white font-black text-slate-700 hover:bg-slate-50"
                  disabled={!intake || generatingClarifications}
                  onClick={handleGenerateClarifications}
                  data-testid="autopilot-generate-clarifications-button"
                >
                  {generatingClarifications ? (
                    <RefreshCw
                      className="size-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <HelpCircle className="size-4" aria-hidden="true" />
                  )}
                  生成澄清
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2 rounded-full border-slate-200 bg-white font-black text-slate-700 hover:bg-slate-50"
                  disabled={!clarificationSession || savingAnswers}
                  onClick={handleSaveAnswers}
                  data-testid="autopilot-save-answers-button"
                >
                  {savingAnswers ? (
                    <RefreshCw
                      className="size-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <CheckCircle2 className="size-4" aria-hidden="true" />
                  )}
                  保存答案
                </Button>
              </div>
            </div>

            <div className="grid content-start gap-3">
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-normal text-slate-500">
                  <Link2 className="size-3.5" aria-hidden="true" />
                  来源
                </div>
                <IntakeSummary intake={intake} />
              </div>

              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-normal text-slate-500">
                  <Layers3 className="size-3.5" aria-hidden="true" />
                  项目上下文
                </div>
                <ProjectContextSummary context={projectContext} />
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-normal text-slate-500">
                <HelpCircle className="size-3.5" aria-hidden="true" />
                澄清流程
              </div>
              {clarificationSession ? (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                  {clarificationSession.id}
                </span>
              ) : null}
            </div>
            <ClarificationPanel
              session={clarificationSession}
              answerDrafts={answerDrafts}
              onAnswerChange={handleAnswerChange}
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
            <div className="min-w-0 text-sm font-semibold leading-6 text-slate-500">
              在创建输入前仍可直接生成；一旦预检拿到
              id，就会自动升级为带输入上下文的生成。
            </div>
            <Button
              type="button"
              className="gap-2 rounded-full bg-slate-950 px-5 font-black text-white hover:bg-slate-800"
              disabled={!canGenerateRouteSet || generatingRouteSet}
              onClick={handleGenerateRouteSet}
              data-testid="autopilot-generate-routeset-button"
            >
              {generatingRouteSet ? (
                <RefreshCw className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="size-4" aria-hidden="true" />
              )}
              生成 RouteSet
            </Button>
          </div>

          <ApiErrorNotice error={apiError} className="mt-4" />
        </section>

        <RouteSetPanel
          job={latestJob}
          routeSet={routeSet}
          selection={selection}
          selectingRouteId={selectingRouteId}
          onSelectRoute={handleSelectRoute}
        />

        <AutopilotSpecTreeHandoffPanel
          job={latestJob}
          selection={selection}
          specTree={specTree}
        />

        <BlueprintProgressPanel
          key={latestJob?.id ?? "autopilot-blueprint-progress"}
          className="relative z-10"
          projectId={currentProjectId}
          initialJob={latestJob}
          initialRouteSet={routeSet}
          initialSelection={selection}
          autoLoad={false}
          showRouteGeneration={false}
          showSpecProgress={false}
          showSpecTreePreview={false}
          showSpecDocumentWorkbench={false}
          showEffectPreviewWorkbench={false}
          showPromptPackageWorkbench={false}
          showRuntimeCapabilityBridgeWorkbench={false}
          showEngineeringLandingWorkbench={false}
          showArtifactMemoryWorkbench={false}
        />
      </div>
    </main>
  );
}
