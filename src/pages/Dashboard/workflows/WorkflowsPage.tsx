import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ArrowRight, FileText, RefreshCw, Search, X } from "lucide-react";
import toast from "react-hot-toast";
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  Position,
  type Edge,
  type Node,
} from "reactflow";
import "reactflow/dist/style.css";

import { useProjectService } from "@/ProjectServiceContext";
import type { ProjectWorkflow as BaseProjectWorkflow } from "@/components/projects/workflows-panel";

function classNames(...xs: Array<string | false | null | undefined>): string {
  return xs.filter(Boolean).join(" ");
}

const crispText = "subpixel-antialiased [text-rendering:optimizeLegibility]";

type WorkflowPreviewNode = {
  id: string;
  protocolId?: string;
  className?: string;
  label?: string;
  comment?: string;
  runName?: string | null;
  order?: number;
};

type WorkflowPreviewEdge = {
  id: string;
  source: string;
  target: string;
  sourceOutput?: string;
  targetParam?: string;
};

type WorkflowPreviewGraph = {
  nodes: WorkflowPreviewNode[];
  edges: WorkflowPreviewEdge[];
  rootIds?: string[];
};

type ProjectWorkflow = BaseProjectWorkflow & {
  source?: string;
  templatePath?: string;
  protocolsCount?: number;
  parseError?: string | null;
  content?: Array<Record<string, unknown>>;
  previewGraph?: WorkflowPreviewGraph;
  requiredPluginNames?: string[];
  missingPluginNames?: string[];
  canLoad?: boolean;
  disabledReason?: string;
};

function normalizeWorkflowPreviewGraph(raw: any): WorkflowPreviewGraph {
  const nodes = Array.isArray(raw?.nodes)
    ? (raw.nodes
      .map((node: any, index: number) => {
        const id = String(node?.id ?? node?.protocolId ?? index).trim();
        if (!id) return null;

        return {
          id,
          protocolId: String(node?.protocolId ?? id),
          className: node?.className ? String(node.className) : "",
          label: node?.label ? String(node.label) : id,
          comment: node?.comment ? String(node.comment) : "",
          runName: node?.runName ?? null,
          order: Number.isFinite(Number(node?.order)) ? Number(node.order) : index,
        };
      })
      .filter(Boolean) as WorkflowPreviewNode[])
    : [];

  const nodeIds = new Set(nodes.map((node) => node.id));

  const edges = Array.isArray(raw?.edges)
    ? (raw.edges
      .map((edge: any, index: number) => {
        const source = String(edge?.source ?? "").trim();
        const target = String(edge?.target ?? "").trim();

        if (!source || !target || !nodeIds.has(source) || !nodeIds.has(target)) {
          return null;
        }

        return {
          id: String(edge?.id ?? `${source}->${target}:${index}`),
          source,
          target,
          sourceOutput: edge?.sourceOutput ? String(edge.sourceOutput) : "",
          targetParam: edge?.targetParam ? String(edge.targetParam) : "",
        };
      })
      .filter(Boolean) as WorkflowPreviewEdge[])
    : [];

  const rootIds = Array.isArray(raw?.rootIds)
    ? raw.rootIds
      .map((id: any) => String(id))
      .filter((id: string) => nodeIds.has(id))
    : [];

  return { nodes, edges, rootIds };
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((item) => String(item ?? "").trim())
        .filter(Boolean),
    ),
  );
}

function canLoadWorkflow(workflow: ProjectWorkflow) {
  if (workflow.canLoad === false) return false;
  return !(workflow.missingPluginNames?.length);
}

function getWorkflowDisabledReason(workflow: ProjectWorkflow) {
  if (workflow.disabledReason) return workflow.disabledReason;

  if (workflow.missingPluginNames?.length) {
    return `Missing required plugins: ${workflow.missingPluginNames.join(", ")}`;
  }

  return "";
}

function buildWorkflowReactFlowElements(
  previewNodes: WorkflowPreviewNode[],
  previewEdges: WorkflowPreviewEdge[],
): { nodes: Node[]; edges: Edge[] } {
  const nodeWidth = 300;
  const nodeHeight = 82;
  const xGap = 72;
  const yGap = 50;

  const nodeIds = previewNodes.map((node) => node.id);
  const nodeIdSet = new Set(nodeIds);

  const parentsById = new Map<string, string[]>();
  nodeIds.forEach((id) => parentsById.set(id, []));

  previewEdges.forEach((edge) => {
    if (!nodeIdSet.has(edge.source) || !nodeIdSet.has(edge.target)) return;
    parentsById.get(edge.target)?.push(edge.source);
  });

  const levelById = new Map<string, number>();

  const resolveLevel = (id: string, stack: Set<string> = new Set()): number => {
    if (levelById.has(id)) return levelById.get(id) ?? 0;
    if (stack.has(id)) return 0;

    stack.add(id);

    const parents = (parentsById.get(id) ?? []).filter((parentId) =>
      nodeIdSet.has(parentId),
    );

    const level =
      parents.length === 0
        ? 0
        : Math.max(...parents.map((parentId) => resolveLevel(parentId, stack))) + 1;

    stack.delete(id);
    levelById.set(id, level);

    return level;
  };

  nodeIds.forEach((id) => resolveLevel(id));

  const levels = new Map<number, WorkflowPreviewNode[]>();

  previewNodes.forEach((node) => {
    const level = levelById.get(node.id) ?? 0;
    const items = levels.get(level) ?? [];
    items.push(node);
    levels.set(level, items);
  });

  Array.from(levels.values()).forEach((items) => {
    items.sort((a, b) => {
      const orderA = Number.isFinite(Number(a.order)) ? Number(a.order) : 0;
      const orderB = Number.isFinite(Number(b.order)) ? Number(b.order) : 0;
      return orderA - orderB;
    });
  });

  const nodes: Node[] = [];

  Array.from(levels.entries()).forEach(([level, items]) => {
    const rowWidth = items.length * nodeWidth + Math.max(0, items.length - 1) * xGap;
    const startX = -rowWidth / 2;

    items.forEach((node, index) => {
      nodes.push({
        id: node.id,
        type: "default",
        position: {
          x: startX + index * (nodeWidth + xGap),
          y: level * (nodeHeight + yGap),
        },
        data: {
          label: (
            <div className="min-w-0 px-1 py-3.5">
              <div className="truncate text-[14px]  text-black">
                {node.label || node.id}
              </div>

            </div>
          ),
        },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        draggable: false,
        selectable: false,
        connectable: false,
        style: {
          width: nodeWidth,
          minHeight: nodeHeight,
          borderRadius: 14,
          border: "1px solid rgba(34, 139, 64, 0.95)",
          background: "#28A745",
          color: "#ffffff",
          boxShadow: "0 10px 24px rgba(40, 167, 69, 0.24)",
          fontSize: 12,
        },
      });
    });
  });

  const edges: Edge[] = previewEdges
    .filter((edge) => nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target))
    .map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "smoothstep",
      animated: false,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 16,
        height: 16,
      },
      style: {
        strokeWidth: 1.5,
      },
    }));

  return { nodes, edges };
}

function WorkflowGraphPreview({ workflow }: { workflow: ProjectWorkflow }) {
  const graph = workflow.previewGraph;
  const previewNodes = graph?.nodes ?? [];
  const previewEdges = graph?.edges ?? [];

  const { nodes, edges } = useMemo(
    () => buildWorkflowReactFlowElements(previewNodes, previewEdges),
    [previewNodes, previewEdges],
  );

  if (!nodes.length) {
    return (
      <div className="rounded-xl border border-gray-300/80 px-3 py-4 text-sm leading-6 text-gray-700 dark:border-gray-700 dark:text-gray-300">
        No preview graph available.
      </div>
    );
  }

  return (
    <div className="h-[520px] overflow-hidden rounded-xl border border-gray-300/80 bg-gray-50 dark:border-gray-700 dark:bg-slate-950">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.22 }}
        minZoom={0.2}
        maxZoom={1.8}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick
        preventScrolling={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={18} size={1} />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
    </div>
  );
}

function CardShell(props: { title: string; subtitle?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div
      className={classNames(
        crispText,
        "relative overflow-hidden rounded-2xl border p-5 shadow-sm",
        "border-gray-300/90 bg-white",
        "dark:border-gray-700 dark:bg-slate-900",
        "lg:p-6",
      )}
    >
      <div className="relative">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold tracking-[0.01em] text-gray-950 dark:text-white">
              {props.title}
            </h3>
            {props.subtitle ? (
              <p className="mt-1 text-sm leading-6 text-gray-700 dark:text-gray-300">{props.subtitle}</p>
            ) : null}
          </div>
          {props.right ? <div className="shrink-0">{props.right}</div> : null}
        </div>
        {props.children}
      </div>
    </div>
  );
}

function StatPill(props: { label: string; value: ReactNode; accent?: "indigo" | "sky" | "cyan" }) {
  return (
    <div
      className={classNames(
        crispText,
        "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium",
        "border-gray-300/80 bg-white text-gray-900",
        "dark:border-gray-700 dark:bg-slate-900 dark:text-white",
      )}
    >
      <span className="text-gray-700 dark:text-gray-300">{props.label}</span>
      <span className="font-semibold">{props.value}</span>
    </div>
  );
}

function PrimaryButton(props: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  title?: string;
}) {

  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
      className={classNames(
        crispText,
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition",
        "text-white shadow-sm",
        "bg-gradient-to-r from-indigo-600 via-sky-600 to-cyan-600",
        "hover:brightness-[0.98] hover:shadow-md",
        "disabled:cursor-not-allowed disabled:opacity-60",
        props.className,
      )}
    >
      {props.children}
    </button>
  );
}

function SecondaryButton(props: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
      className={classNames(
        crispText,
        "inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition",
        "border-gray-300/80 bg-white text-gray-900 shadow-sm hover:border-gray-400 hover:shadow-md",
        "dark:border-gray-700 dark:bg-slate-900 dark:text-white dark:hover:border-gray-600",
        "disabled:cursor-not-allowed disabled:opacity-60",
        props.className,
      )}
    >
      {props.children}
    </button>
  );
}

function normalizeWorkflowDescriptionText(description?: string) {
  return String(description ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/(ScipionWeb metadata format:)/g, "\n$1")
    .replace(/(ScipionWeb metadata version:)/g, "\n$1")
    .replace(/(ScipionWeb exported at UTC:)/g, "\n$1")
    .replace(/(ScipionWeb required plugins:)/g, "\n$1")
    .replace(/(Scipion required plugins:)/g, "\n$1")
    .replace(/(ScipionWeb protocol plugin:)/g, "\n$1")
    .replace(/(You'll need)/g, "\n$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseWorkflowDescription(description?: string) {
  const normalized = normalizeWorkflowDescriptionText(description);

  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const metadataLines: string[] = [];
  const pluginNames: string[] = [];
  const descriptionLines: string[] = [];

  for (const line of lines) {
    const requiredPluginsMatch = line.match(/^Scipion(?:Web)? required plugins:\s*(.*)$/i);

    if (requiredPluginsMatch) {
      const names = requiredPluginsMatch[1]
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean);

      pluginNames.push(...names);
      metadataLines.push(line);
      continue;
    }

    if (
      line.startsWith("ScipionWeb metadata") ||
      line.startsWith("ScipionWeb exported") ||
      line.startsWith("ScipionWeb protocol plugin:")
    ) {
      metadataLines.push(line);
      continue;
    }

    descriptionLines.push(line);
  }

  const uniquePluginNames = Array.from(new Set(pluginNames));

  return {
    lead: descriptionLines[0] || "No description available.",
    details: descriptionLines.slice(1),
    metadataLines,
    pluginNames: uniquePluginNames,
  };
}

function WorkflowDescriptionCard({ workflow }: { workflow: ProjectWorkflow }) {
  const { lead, details, metadataLines, pluginNames } = useMemo(
    () => parseWorkflowDescription(workflow.description),
    [workflow.description],
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-300/80 bg-white shadow-sm dark:border-gray-700 dark:bg-slate-900">
      <div className="border-b border-gray-200/90 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-slate-800/70">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-300/80 bg-white text-gray-700 shadow-sm dark:border-gray-700 dark:bg-slate-900 dark:text-gray-300">
              <FileText className="h-4 w-4" />
            </div>

            <div className="min-w-0">
              <div className="text-sm font-semibold tracking-[0.01em] text-gray-950 dark:text-white">
                Description
              </div>
              <div className="mt-0.5 truncate text-xs text-gray-600 dark:text-gray-400">
                Workflow overview and import requirements
              </div>
            </div>
          </div>

          {workflow.source ? (
            <span className="shrink-0 rounded-full border border-gray-300/80 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 dark:border-gray-700 dark:bg-slate-900 dark:text-gray-300">
              {workflow.source}
            </span>
          ) : null}

          {workflow.missingPluginNames?.length ? (
            <div className="rounded-xl border border-amber-300/80 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              This workflow cannot be loaded because these plugins are missing:{" "}
              <span className="font-semibold">{workflow.missingPluginNames.join(", ")}</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/70 px-4 py-3 dark:border-emerald-900/70 dark:bg-emerald-950/20">
          <div className="text-[15px]  leading-6 text-gray-950 dark:text-white">
            {lead}
          </div>
        </div>

        {details.length ? (
          <div className="space-y-2">
            {details.map((line, index) => (
              <div
                key={`${workflow.id}-description-detail-${index}`}
                className="rounded-xl border border-gray-200/90 bg-white px-3 py-2 text-sm leading-6 text-gray-800 dark:border-gray-700 dark:bg-slate-950/40 dark:text-gray-200"
              >
                {line}
              </div>
            ))}
          </div>
        ) : null}

        {pluginNames.length ? (
          <div className="rounded-xl border border-gray-200/90 bg-white p-3 dark:border-gray-700 dark:bg-slate-950/40">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
              Required plugins
            </div>

            <div className="flex flex-wrap gap-1.5">
              {pluginNames.map((pluginName) => (
                <span
                  key={`${workflow.id}-plugin-${pluginName}`}
                  className="rounded-full border border-emerald-300/80 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                >
                  {pluginName}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {metadataLines.length ? (
          <details className="rounded-xl border border-gray-200/90 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-slate-950/40">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
              ScipionWeb metadata
            </summary>

            <div className="mt-2 space-y-1.5">
              {metadataLines.map((line, index) => (
                <div
                  key={`${workflow.id}-metadata-${index}`}
                  className="break-words rounded-lg bg-white px-2.5 py-1.5 font-mono text-[11px] leading-5 text-gray-700 dark:bg-slate-900 dark:text-gray-300"
                >
                  {line}
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}

export default function WorkflowsPage() {
  const svc = useProjectService();

  const [workflows, setWorkflows] = useState<ProjectWorkflow[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [selectedWorkflow, setSelectedWorkflow] = useState<ProjectWorkflow | null>(null);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");

  const loadWorkflows = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const data = await svc.fetchWorkflows();

      const normalized: ProjectWorkflow[] = Array.isArray(data)
        ? data.map((wf: any, index: number) => {
          const previewGraph = normalizeWorkflowPreviewGraph(wf.previewGraph);
          const requiredPluginNames = normalizeStringArray(wf.requiredPluginNames);
          const missingPluginNames = normalizeStringArray(wf.missingPluginNames);


          return {
            id: String(wf.id ?? wf.name ?? index),
            name: String(wf.name ?? wf.id ?? `Workflow ${index + 1}`),
            description: String(wf.description ?? ""),
            source: wf.source ? String(wf.source) : "",
            templatePath: wf.templatePath ? String(wf.templatePath) : "",
            protocolsCount: Number.isFinite(Number(wf.protocolsCount))
              ? Number(wf.protocolsCount)
              : Array.isArray(wf.content)
                ? wf.content.length
                : previewGraph.nodes.length,
            parseError: wf.parseError ?? null,
            content: Array.isArray(wf.content) ? wf.content : [],
            previewGraph,
            requiredPluginNames,
            missingPluginNames,
            canLoad: typeof wf.canLoad === "boolean" ? wf.canLoad : missingPluginNames.length === 0,
            disabledReason: wf.disabledReason ? String(wf.disabledReason) : "",
          };
        })
        : [];

      normalized.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

      setWorkflows(normalized);
    } catch (err: any) {
      console.error("[WorkflowsPage] loadWorkflows error:", err);
      setErrorMessage(err?.message || "Failed to load workflows.");
      setWorkflows([]);
    } finally {
      setLoading(false);
    }
  }, [svc]);

  useEffect(() => {
    void loadWorkflows();
  }, [loadWorkflows]);

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredWorkflows = useMemo(() => {
    if (!normalizedSearch) return workflows;

    return workflows.filter((wf) => {
      const haystack = [
        wf.name,
        wf.description,
        wf.source,
        ...(wf.previewGraph?.nodes ?? []).map((node) => node.className),
        ...(wf.previewGraph?.nodes ?? []).map((node) => node.label),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [workflows, normalizedSearch]);

  const hasAnyWorkflows = workflows.length > 0;
  const hasFilteredWorkflows = filteredWorkflows.length > 0;

  const stats = useMemo(() => {
    return {
      total: workflows.length,
      shown: filteredWorkflows.length,
      selected: selectedWorkflow ? 1 : 0,
    };
  }, [filteredWorkflows.length, selectedWorkflow, workflows.length]);

  const selectedWorkflowIsLoadable = selectedWorkflow ? canLoadWorkflow(selectedWorkflow) : false;
  const selectedWorkflowDisabledReason = selectedWorkflow ? getWorkflowDisabledReason(selectedWorkflow) : "";

  const openApply = useCallback((wf: ProjectWorkflow) => {
    if (!canLoadWorkflow(wf)) {
      toast.error(getWorkflowDisabledReason(wf) || "This workflow cannot be loaded.");
      return;
    }

    setSelectedWorkflow(wf);
    setApplyDialogOpen(true);
  }, []);

  const onRowClick = useCallback((wf: ProjectWorkflow) => {
    setSelectedWorkflow(wf);
  }, []);

  const onRowDoubleClick = useCallback(
    (wf: ProjectWorkflow) => {
      openApply(wf);
    },
    [openApply],
  );

  return (
    <div className={classNames(crispText, "h-app min-h-0 flex flex-col px-2 py-2")}>
      <div className="grid grid-cols-12 gap-4 md:gap-6">
        <div className="col-span-12 xl:col-span-7">
          <CardShell
            title="Workflows"
            subtitle="Browse templates and load them into a project."
            right={
              <SecondaryButton onClick={() => void loadWorkflows()} disabled={loading} title="Reload workflows">
                <RefreshCw className={classNames("h-4 w-4", loading ? "animate-spin" : "")} />
                Refresh
              </SecondaryButton>
            }
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-[420px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search workflow…"
                  className={classNames(
                    crispText,
                    "w-full rounded-xl border py-2.5 pl-9 pr-3 text-sm font-medium outline-none transition",
                    "border-gray-300/80 bg-white text-gray-950 placeholder:text-gray-400",
                    "focus:border-indigo-500/40 focus:ring-2 focus:ring-indigo-500/10",
                    "dark:border-gray-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-gray-500",
                    "dark:focus:border-indigo-400/40 dark:focus:ring-indigo-400/15",
                  )}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <StatPill label="Total" value={stats.total} />
                <StatPill label="Shown" value={stats.shown} />
                {selectedWorkflow ? (
                  <StatPill label="Selected" value={(selectedWorkflow.name ?? "").slice(0, 18)} />
                ) : null}
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-gray-300/90 bg-white shadow-sm dark:border-gray-700 dark:bg-slate-900">
              <div
                className={classNames(
                  crispText,
                  "grid grid-cols-12 gap-3 border-b px-4 py-3.5",
                  "border-gray-300/80 bg-gray-100 text-gray-800",
                  "dark:border-gray-700 dark:bg-slate-800 dark:text-gray-200",
                )}
              >
                <div className="col-span-4 text-sm font-semibold tracking-[0.01em]">Workflow</div>
                <div className="col-span-6 hidden text-sm font-semibold tracking-[0.01em] md:block">Description</div>
                <div className="col-span-8 text-right text-sm font-semibold tracking-[0.01em] md:col-span-2">Action</div>
              </div>

              <div className="max-h-[62vh] overflow-y-auto divide-y divide-gray-200/90 dark:divide-gray-700">
                {loading ? (
                  <div className="px-4 py-4 text-sm leading-6 text-gray-700 dark:text-gray-200">
                    Loading workflows…
                  </div>
                ) : errorMessage ? (
                  <div className="px-4 py-4 text-sm leading-6 text-red-600 dark:text-red-300">{errorMessage}</div>
                ) : !hasAnyWorkflows ? (
                  <div className="px-4 py-4 text-sm leading-6 text-gray-700 dark:text-gray-300">
                    No workflows defined yet.
                  </div>
                ) : !hasFilteredWorkflows ? (
                  <div className="px-4 py-4 text-sm leading-6 text-gray-700 dark:text-gray-300">
                    No workflows found matching your search.
                  </div>
                ) : (
                  filteredWorkflows.map((wf) => {
                    const isSelected = selectedWorkflow && String(selectedWorkflow.id) === String(wf.id);
                    const isLoadable = canLoadWorkflow(wf);
                    const disabledReason = getWorkflowDisabledReason(wf);

                    return (
                      <div
                        key={wf.id}
                        className={classNames(
                          "grid grid-cols-12 gap-3 px-4 py-3.5 transition",
                          "hover:bg-gray-50 dark:hover:bg-slate-800/70",
                          isSelected ? "bg-gray-100 dark:bg-slate-800" : "",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => onRowClick(wf)}
                          onDoubleClick={() => onRowDoubleClick(wf)}
                          className="col-span-4 min-w-0 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950"
                          title="Click to select, double-click to load"
                        >
                          <div
                            className="truncate text-[15px] font-medium leading-6 text-gray-950 dark:text-white"
                            title={wf.name}
                          >
                            {wf.name}
                          </div>

                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            {wf.source ? (
                              <span className="rounded-full border border-gray-300/80 px-2 py-0.5 text-[11px] font-medium text-gray-700 dark:border-gray-700 dark:text-gray-300">
                                {wf.source}
                              </span>
                            ) : null}

                            <span className="rounded-full border border-gray-300/80 px-2 py-0.5 text-[11px] font-medium text-gray-700 dark:border-gray-700 dark:text-gray-300">
                              {wf.protocolsCount ?? wf.previewGraph?.nodes?.length ?? 0} protocols
                            </span>

                            {wf.parseError ? (
                              <span className="rounded-full border border-red-300/80 px-2 py-0.5 text-[11px] font-medium text-red-600 dark:border-red-800 dark:text-red-300">
                                parse error
                              </span>
                            ) : null}

                            {wf.missingPluginNames?.length ? (
                              <span
                                className="rounded-full border border-amber-300/80 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
                                title={disabledReason}
                              >
                                missing plugins
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-1 line-clamp-2 text-sm leading-6 text-gray-700 dark:text-gray-300 md:hidden">
                            {wf.description || "—"}
                          </div>
                        </button>

                        <div className="col-span-6 hidden md:block">
                          <div className="line-clamp-2 whitespace-pre-line text-sm leading-6 text-gray-800 dark:text-gray-200">
                            {wf.description || "—"}
                          </div>
                        </div>

                        <div className="col-span-8 flex items-center justify-end md:col-span-2">
                          <PrimaryButton
                            onClick={() => openApply(wf)}
                            disabled={!isLoadable}
                            className="px-3 py-2 text-xs"
                            title={isLoadable ? "Load this workflow" : disabledReason}
                          >
                            Load
                            <ArrowRight className="h-4 w-4" />
                          </PrimaryButton>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="mt-3 text-sm leading-6 text-gray-700 dark:text-gray-300">
              Tip: double-click a workflow row to load it.
            </div>
          </CardShell>
        </div>

        <div className="col-span-12 xl:col-span-5">
          <CardShell
            title="Details"
            subtitle={selectedWorkflow ? "Selected workflow overview." : "Select a workflow to preview it."}
          >
            {!selectedWorkflow ? (
              <div className="rounded-2xl border border-gray-300/80 bg-white p-4 text-sm leading-6 text-gray-700 dark:border-gray-700 dark:bg-slate-900 dark:text-gray-200">
                No workflow selected.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-2xl border border-gray-300/80 bg-white p-4 dark:border-gray-700 dark:bg-slate-900">
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Name</div>
                  <div className="mt-1 text-[15px] font-medium leading-6 text-gray-950 dark:text-white">
                    {selectedWorkflow.name}
                  </div>
                </div>

                <WorkflowDescriptionCard workflow={selectedWorkflow} />

                <div className="rounded-2xl border border-gray-300/80 bg-white p-4 dark:border-gray-700 dark:bg-slate-900">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Preview
                      </div>
                      <div className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                        {selectedWorkflow.protocolsCount ?? selectedWorkflow.previewGraph?.nodes?.length ?? 0} protocols ·{" "}
                        {selectedWorkflow.previewGraph?.edges?.length ?? 0} links
                      </div>
                    </div>

                    {selectedWorkflow.source ? (
                      <span className="rounded-full border border-gray-300/80 px-2 py-1 text-xs font-medium text-gray-700 dark:border-gray-700 dark:text-gray-300">
                        {selectedWorkflow.source}
                      </span>
                    ) : null}
                  </div>

                  {selectedWorkflow.parseError ? (
                    <div className="rounded-xl border border-red-300/80 bg-red-50 px-3 py-2 text-sm leading-6 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                      {selectedWorkflow.parseError}
                    </div>
                  ) : (
                    <WorkflowGraphPreview workflow={selectedWorkflow} />
                  )}
                </div>

                <PrimaryButton
                  onClick={() => openApply(selectedWorkflow)}
                  disabled={!selectedWorkflowIsLoadable}
                  title={selectedWorkflowIsLoadable ? "Load this workflow" : selectedWorkflowDisabledReason}
                  className="w-full"
                >
                  Load workflow
                  <ArrowRight className="h-4 w-4" />
                </PrimaryButton>
              </div>
            )}
          </CardShell>
        </div>
      </div>

      <ApplyWorkflowDialog
        open={applyDialogOpen}
        workflow={selectedWorkflow}
        onClose={() => setApplyDialogOpen(false)}
      />
    </div>
  );
}

interface ApplyWorkflowDialogProps {
  open: boolean;
  workflow: ProjectWorkflow | null;
  onClose: () => void;
}

type ApplyWorkflowMode = "create" | "select";

function ApplyWorkflowDialog({ open, workflow, onClose }: ApplyWorkflowDialogProps) {
  const svc = useProjectService();

  const [mode, setMode] = useState<ApplyWorkflowMode>("create");
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");

  const [projectOptions, setProjectOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (open && workflow) {
      setMode("create");
      setNewProjectTitle(workflow.name ?? "");
      setNewProjectDescription(workflow.description ?? "");
      setSelectedProjectId("");
      setSubmitError(null);
    }
  }, [open, workflow]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    const loadProjects = async () => {
      setProjectsLoading(true);
      setProjectsError(null);

      try {
        const data = await svc.fetchList();
        const normalized: Array<{ id: string; name: string }> = Array.isArray(data)
          ? data.map((p: any) => ({
            id: String(p.id ?? p.name),
            name: p.name ?? String(p.id ?? ""),
          }))
          : [];

        if (!cancelled) setProjectOptions(normalized);
      } catch (err: any) {
        console.error("[ApplyWorkflowDialog] loadProjects error:", err);
        if (!cancelled) {
          setProjectsError(err?.message || "Failed to load projects for selection.");
          setProjectOptions([]);
        }
      } finally {
        if (!cancelled) setProjectsLoading(false);
      }
    };

    void loadProjects();

    return () => {
      cancelled = true;
    };
  }, [open, svc]);

  const handleApply = useCallback(async () => {
    if (!workflow) {
      onClose();
      return;
    }

    setSubmitError(null);
    setSubmitting(true);

    try {
      let targetProjectId: string | number | undefined;
      let targetProjectName: string | undefined;

      if (mode === "create") {
        const payload = {
          name: newProjectTitle.trim(),
          description: newProjectDescription.trim() || undefined,
        };

        const createdProject: any = await svc.createProject(payload);

        targetProjectId =
          createdProject?.id ??
          createdProject?.projectId ??
          createdProject?.project?.id ??
          createdProject?.data?.id;

        targetProjectName = createdProject?.name ?? createdProject?.project?.name ?? payload.name;

        if (!targetProjectId) throw new Error("Project id not returned by backend.");
      } else {
        if (!selectedProjectId) throw new Error("No project selected.");

        targetProjectId = selectedProjectId;
        const match = projectOptions.find((p) => String(p.id) === String(selectedProjectId));
        targetProjectName = match?.name ?? selectedProjectId;
      }

      await svc.loadWorkflow(targetProjectId, { workflowId: String(workflow.id) });

      toast.success(`Workflow "${workflow.name}" applied to project "${targetProjectName}".`);
      onClose();
    } catch (err: any) {
      console.error("[ApplyWorkflowDialog] handleApply error:", err);
      setSubmitError(err?.message || "Failed to apply workflow. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [mode, newProjectDescription, newProjectTitle, onClose, projectOptions, selectedProjectId, svc, workflow]);

  if (!open || !workflow) return null;

  const applyDisabled =
    submitting ||
    (mode === "create"
      ? !newProjectTitle.trim()
      : !selectedProjectId || projectsLoading || !!projectsError);

  return (
    <div
      className={classNames(
        crispText,
        "fixed inset-0 z-[90] flex items-center justify-center",
        "bg-black/[0.02] dark:bg-white/[0.02]",
      )}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={classNames(
          "relative z-10 w-full max-w-md overflow-hidden rounded-2xl border shadow-2xl",
          "min-h-[520px] max-h-[520px]",
          "border-gray-300/90 bg-white",
          "ring-1 ring-inset ring-black/[0.10]",
          "dark:border-gray-600 dark:bg-slate-900 dark:ring-white/[0.10]",
        )}
      >
        <div className="relative flex h-full flex-col px-6 pt-6 pb-5">
          <button
            type="button"
            onClick={onClose}
            className={classNames(
              "absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-xl border transition",
              "border-gray-300/80 bg-white text-gray-800 hover:shadow-sm",
              "dark:border-gray-700 dark:bg-slate-900 dark:text-gray-200",
            )}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="mb-4">
            <h2 className="text-lg font-semibold tracking-[0.01em] text-gray-950 dark:text-white">Load workflow</h2>
            <p className="mt-1 text-sm leading-6 text-gray-700 dark:text-gray-300">{workflow.name}</p>
          </div>

          <div className="rounded-xl border border-gray-300/80 bg-white p-1 dark:border-gray-700 dark:bg-slate-900">
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => setMode("create")}
                className={classNames(
                  "rounded-lg px-3 py-2 text-sm font-medium transition",
                  mode === "create"
                    ? "bg-gray-100 text-gray-950 shadow-sm dark:bg-slate-800 dark:text-white"
                    : "text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-slate-800/60",
                )}
              >
                Create new
              </button>
              <button
                type="button"
                onClick={() => setMode("select")}
                className={classNames(
                  "rounded-lg px-3 py-2 text-sm font-medium transition",
                  mode === "select"
                    ? "bg-gray-100 text-gray-950 shadow-sm dark:bg-slate-800 dark:text-white"
                    : "text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-slate-800/60",
                )}
              >
                Select project
              </button>
            </div>
          </div>

          <div className="mt-4 min-h-0 flex-1">
            {mode === "create" ? (
              <>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-900 dark:text-gray-200">New project name</label>
                  <input
                    type="text"
                    value={newProjectTitle}
                    onChange={(e) => setNewProjectTitle(e.target.value)}
                    placeholder="Enter a title"
                    className={classNames(
                      crispText,
                      "w-full rounded-xl border px-3 py-2.5 text-sm font-medium outline-none transition",
                      "border-gray-300/80 bg-white text-gray-950 placeholder:text-gray-400",
                      "focus:border-indigo-500/40 focus:ring-2 focus:ring-indigo-500/10",
                      "dark:border-gray-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-gray-500",
                    )}
                  />
                </div>

                <div className="mt-4 space-y-1.5">
                  <label className="text-sm font-medium text-gray-900 dark:text-gray-200">Project description</label>
                  <textarea
                    rows={4}
                    value={newProjectDescription}
                    onChange={(e) => setNewProjectDescription(e.target.value)}
                    placeholder="Optional description for this project"
                    className={classNames(
                      crispText,
                      "w-full resize-none rounded-xl border px-3 py-2.5 text-sm leading-6 text-gray-900 outline-none transition placeholder:text-gray-400",
                      "border-gray-300/80 bg-white",
                      "focus:border-indigo-500/40 focus:ring-2 focus:ring-indigo-500/10",
                      "dark:border-gray-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-gray-500",
                    )}
                  />
                  <p className="text-sm leading-6 text-gray-700 dark:text-gray-300">
                    A new project will be created and this workflow will be loaded into it.
                  </p>
                </div>
              </>
            ) : (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-900 dark:text-gray-200">Project</label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className={classNames(
                    crispText,
                    "w-full rounded-xl border px-3 py-2.5 text-sm font-medium outline-none transition",
                    "border-gray-300/80 bg-white text-gray-950",
                    "focus:border-indigo-500/40 focus:ring-2 focus:ring-indigo-500/10",
                    "dark:border-gray-700 dark:bg-slate-900 dark:text-white",
                  )}
                  disabled={projectsLoading || !!projectsError}
                >
                  <option value="">
                    {projectsLoading ? "Loading projects…" : projectsError ? "Could not load projects" : "Select a project"}
                  </option>
                  {!projectsLoading &&
                    !projectsError &&
                    projectOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>

                {projectsError ? (
                  <p className="text-sm leading-6 text-red-600 dark:text-red-300">{projectsError}</p>
                ) : (
                  <p className="text-sm leading-6 text-gray-700 dark:text-gray-300">
                    The workflow will be loaded inside the selected existing project.
                  </p>
                )}
              </div>
            )}

            {submitError ? <div className="mt-4 text-sm leading-6 text-red-600 dark:text-red-300">{submitError}</div> : null}
          </div>

          <div className="mt-6 flex items-center justify-between gap-3">
            <SecondaryButton onClick={onClose} disabled={submitting} className="min-w-[110px]">
              Cancel
            </SecondaryButton>

            <PrimaryButton onClick={() => void handleApply()} disabled={applyDisabled} className="min-w-[110px]">
              {submitting ? "Loading…" : "Load"}
              <ArrowRight className="h-4 w-4" />
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}