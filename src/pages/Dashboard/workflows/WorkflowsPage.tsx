import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ArrowRight, ArrowUpDown, ChevronDown, FileText, MousePointerClick, RefreshCw, Search, Workflow, X } from "lucide-react";
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
import WorkflowRequirements, { type MissingPlugin } from "@/components/workflows/WorkflowRequirements";

type WorkflowSort = "name" | "protocols";
type WorkflowFilter = "all" | "ready" | "needsPlugins";

const WORKFLOW_SORTS: Array<{ value: WorkflowSort; label: string }> = [
  { value: "name", label: "Name" },
  { value: "protocols", label: "Most protocols" },
];
const WORKFLOW_FILTERS: Array<{ value: WorkflowFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "ready", label: "Ready to load" },
  { value: "needsPlugins", label: "Need plugins" },
];
const WORKFLOWS_SORT_STORAGE_KEY = "scipion.workflows.sort.v1";
const WORKFLOWS_FILTER_STORAGE_KEY = "scipion.workflows.filter.v1";

function readStoredChoice<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = window.localStorage.getItem(key) as T | null;
    return value && allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function storeChoice(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // only a convenience
  }
}

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
  // Each missing plugin with the package that installs it
  missingPlugins?: MissingPlugin[];
  // A workflow that does not say which plugins it needs: a warning to migrate it, and the protocols this
  // installation does not know (it cannot load then)
  designWarning?: string;
  unknownProtocolClasses?: string[];
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
              <div className="truncate text-[14px] font-medium text-gray-900">
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
          // Like a new protocol in a project's graph
          borderRadius: 10,
          border: "1px solid #7fb9d6",
          background: "#D9F1FA",
          color: "#111827",
          boxShadow: "0 1px 3px rgba(15, 23, 42, 0.12)",
          fontSize: 14,
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
      <div className="rounded-[10px] border border-dashed border-gray-300 px-3 py-6 text-center text-[14px] text-gray-500 dark:border-gray-700 dark:text-gray-400">
        No preview graph available.
      </div>
    );
  }

  return (
    <div className="h-[480px] overflow-hidden rounded-[10px] border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-950">
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
        // The wheel zooms the preview (React Flow ignores it without Ctrl when preventScrolling is off)
        preventScrolling
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={18} size={1} />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
    </div>
  );
}

function Panel(props: {
  title: string;
  count?: number;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <section
      className={classNames(
        crispText,
        "flex min-h-0 flex-col overflow-hidden rounded-[10px] border",
        "border-gray-300/85 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]",
        "dark:border-gray-700 dark:bg-gray-900",
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-gray-200/90 px-5 py-4 dark:border-gray-700 lg:px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h2 className="text-[19px] font-semibold text-gray-900 dark:text-white">{props.title}</h2>
            {props.count !== undefined ? (
              <span className="rounded-full bg-gray-200/80 px-2.5 py-0.5 text-[13px] font-semibold tabular-nums text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                {props.count}
              </span>
            ) : null}
          </div>
          {props.subtitle ? (
            <p className="mt-0.5 text-[13.5px] text-gray-500 dark:text-gray-400">{props.subtitle}</p>
          ) : null}
        </div>
        {props.right ? <div className="shrink-0">{props.right}</div> : null}
      </div>
      <div className={classNames("min-h-0 flex-1", props.bodyClassName)}>{props.children}</div>
    </section>
  );
}

function Tag(props: { children: ReactNode; tone?: "gray" | "amber" | "red"; title?: string }) {
  const tone = props.tone ?? "gray";
  return (
    <span
      title={props.title}
      className={classNames(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[13px] font-medium",
        tone === "amber"
          ? "border-amber-300/80 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
          : tone === "red"
            ? "border-red-300/80 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
            : "border-gray-300/80 bg-white text-gray-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200",
      )}
    >
      {props.children}
    </span>
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
        "inline-flex h-10 items-center justify-center gap-2 rounded-[10px] px-4 text-[14px] font-semibold transition",
        "bg-brand-500 text-white shadow-sm hover:bg-brand-600",
        "disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-600 dark:disabled:bg-gray-700 dark:disabled:text-gray-400",
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
        "inline-flex h-10 items-center justify-center gap-2 rounded-[10px] border px-4 text-[14px] font-medium transition",
        "border-gray-300 bg-white text-gray-700 shadow-theme-xs hover:bg-gray-50 hover:text-gray-900",
        "dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-white/[0.05]",
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

function WorkflowDescriptionCard({ workflow, onInstalling }: { workflow: ProjectWorkflow; onInstalling?: () => void }) {
  const { lead, details, metadataLines, pluginNames } = useMemo(
    () => parseWorkflowDescription(workflow.description),
    [workflow.description],
  );

  return (
    <div className="overflow-hidden rounded-[10px] border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="border-b border-gray-200/90 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/40">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-gray-200 bg-white text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
              <FileText className="h-4 w-4" />
            </div>

            <div className="min-w-0">
              <div className="text-[15px] font-semibold text-gray-900 dark:text-white">
                Description
              </div>
              <div className="mt-0.5 truncate text-[13px] text-gray-500 dark:text-gray-400">
                Workflow overview and import requirements
              </div>
            </div>
          </div>

          {workflow.source ? (
            <Tag>{workflow.source}</Tag>
          ) : null}

          <WorkflowRequirements
            missingPlugins={workflow.missingPlugins?.length ? workflow.missingPlugins
              : (workflow.missingPluginNames ?? []).map((name) => ({ name, pipName: `scipion-em-${name}` }))}
            unknownProtocolClasses={workflow.unknownProtocolClasses}
            designWarning={workflow.designWarning}
            onInstalling={onInstalling}
          />
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div className="rounded-[10px] border-l-4 border-brand-400 bg-brand-50/60 px-4 py-3 dark:border-brand-500 dark:bg-brand-500/10">
          <div className="text-[15px] leading-6 text-gray-900 dark:text-white">
            {lead}
          </div>
        </div>

        {details.length ? (
          <div className="space-y-2">
            {details.map((line, index) => (
              <div
                key={`${workflow.id}-description-detail-${index}`}
                className="rounded-[10px] border border-gray-200 bg-white px-3 py-2 text-[14px] leading-6 text-gray-800 dark:border-gray-700 dark:bg-gray-950/40 dark:text-gray-200"
              >
                {line}
              </div>
            ))}
          </div>
        ) : null}

        {pluginNames.length ? (
          <div className="rounded-[10px] border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-950/40">
            <div className="mb-2 text-[13.5px] font-medium text-gray-500 dark:text-gray-400">
              Required plugins
            </div>

            <div className="flex flex-wrap gap-1.5">
              {pluginNames.map((pluginName) => (
                <span
                  key={`${workflow.id}-plugin-${pluginName}`}
                  className="rounded-md border border-emerald-300/80 bg-emerald-50 px-2 py-0.5 text-[13px] font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                >
                  {pluginName}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {metadataLines.length ? (
          <details className="rounded-[10px] border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-950/40">
            <summary className="cursor-pointer text-[13.5px] font-medium text-gray-500 dark:text-gray-400">
              ScipionWeb metadata
            </summary>

            <div className="mt-2 space-y-1.5">
              {metadataLines.map((line, index) => (
                <div
                  key={`${workflow.id}-metadata-${index}`}
                  className="break-words rounded-lg bg-white px-2.5 py-1.5 font-mono text-[13px] leading-5 text-gray-700 dark:bg-gray-900 dark:text-gray-300"
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
  const [sort, setSort] = useState<WorkflowSort>(() =>
    readStoredChoice(WORKFLOWS_SORT_STORAGE_KEY, WORKFLOW_SORTS.map((x) => x.value), "name"));
  const [filter, setFilter] = useState<WorkflowFilter>(() =>
    readStoredChoice(WORKFLOWS_FILTER_STORAGE_KEY, WORKFLOW_FILTERS.map((x) => x.value), "all"));

  useEffect(() => storeChoice(WORKFLOWS_SORT_STORAGE_KEY, sort), [sort]);
  useEffect(() => storeChoice(WORKFLOWS_FILTER_STORAGE_KEY, filter), [filter]);

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
            missingPlugins: Array.isArray(wf.missingPlugins)
              ? wf.missingPlugins.filter((plugin: any) => plugin?.name)
                .map((plugin: any) => ({ name: String(plugin.name), pipName: plugin.pipName ? String(plugin.pipName) : null }))
              : undefined,
            designWarning: wf.designWarning ? String(wf.designWarning) : "",
            unknownProtocolClasses: normalizeStringArray(wf.unknownProtocolClasses),
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

  const searchedWorkflows = useMemo(() => {
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

  const matchesFilter = useCallback((wf: ProjectWorkflow, value: WorkflowFilter) => {
    if (value === "ready") return canLoadWorkflow(wf);
    if (value === "needsPlugins") return !canLoadWorkflow(wf);
    return true;
  }, []);

  const filterCounts = useMemo(
    () => Object.fromEntries(WORKFLOW_FILTERS.map(({ value }) =>
      [value, searchedWorkflows.filter((wf) => matchesFilter(wf, value)).length])) as Record<WorkflowFilter, number>,
    [searchedWorkflows, matchesFilter],
  );

  const protocolCount = (wf: ProjectWorkflow) => wf.protocolsCount ?? wf.previewGraph?.nodes?.length ?? 0;

  const filteredWorkflows = useMemo(() => {
    const shown = searchedWorkflows.filter((wf) => matchesFilter(wf, filter));
    return [...shown].sort((a, b) =>
      sort === "protocols"
        ? protocolCount(b) - protocolCount(a) || a.name.localeCompare(b.name)
        : a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
  }, [searchedWorkflows, filter, sort, matchesFilter]);

  const hasAnyWorkflows = workflows.length > 0;
  const hasFilteredWorkflows = filteredWorkflows.length > 0;

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

  const renderListState = (text: string, tone: "gray" | "red" = "gray", action?: ReactNode) => (
    <div
      className={classNames(
        "flex flex-col items-center rounded-[10px] border border-dashed px-6 py-12 text-center text-[14.5px]",
        tone === "red"
          ? "border-red-300 bg-red-50/60 text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300"
          : "border-gray-300 bg-white/60 text-gray-500 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-400",
      )}
    >
      {text}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );

  return (
    <div className={classNames(crispText, "h-app min-h-0 flex flex-col px-2 py-2")}>
      <div className="grid min-h-0 flex-1 grid-cols-12 gap-4 md:gap-5">
        <div className="col-span-12 flex min-h-0 flex-col xl:col-span-7">
          <Panel
            title="Workflows"
            count={workflows.length}
            subtitle="Templates to load into a new or an existing project. Double-click one to load it."
            right={
              <SecondaryButton onClick={() => void loadWorkflows()} disabled={loading} title="Reload workflows">
                <RefreshCw className={classNames("h-4 w-4", loading ? "animate-spin" : "")} />
                Refresh
              </SecondaryButton>
            }
            bodyClassName="flex flex-col bg-gray-100 dark:bg-gray-950"
          >
            <div className="shrink-0 space-y-3 px-5 pt-4 pb-3 lg:px-6">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative min-w-[220px] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search workflows or protocols…"
                    aria-label="Search workflows"
                    className={classNames(
                      crispText,
                      "h-10 w-full rounded-[10px] border pl-9 pr-3 text-[14.5px] outline-none transition",
                      "border-gray-300 bg-white text-gray-900 placeholder:text-gray-400",
                      "focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10",
                      "dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:placeholder:text-gray-500",
                    )}
                  />
                </div>
                <label className="relative inline-flex items-center">
                  <ArrowUpDown className="pointer-events-none absolute left-3 h-4 w-4 text-gray-500 dark:text-gray-400" />
                  <select
                    aria-label="Sort workflows by"
                    value={sort}
                    onChange={(e) => setSort(e.target.value as WorkflowSort)}
                    className={classNames(
                      "h-10 appearance-none rounded-[10px] border pl-9 pr-9 text-[14px] font-medium outline-none transition",
                      "border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
                      "focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10",
                      "dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800",
                    )}
                  >
                    {WORKFLOW_SORTS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-gray-500" />
                </label>
              </div>

              <div role="group" aria-label="Show workflows" className="flex flex-wrap items-center gap-1.5">
                {WORKFLOW_FILTERS.map((option) => {
                  const selected = filter === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setFilter(option.value)}
                      className={classNames(
                        "inline-flex h-8 items-center gap-1.5 rounded-[10px] border px-3 text-[13.5px] font-medium transition",
                        selected
                          ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
                          : "border-gray-300 bg-white text-gray-700 hover:border-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-gray-500",
                      )}
                    >
                      {option.label}
                      <span className={classNames("tabular-nums", selected ? "text-white/70 dark:text-gray-900/60" : "text-gray-400 dark:text-gray-500")}>
                        {filterCounts[option.value] ?? 0}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 pb-5 lg:px-6" style={{ maxHeight: "calc(100dvh - 300px)" }}>
              {loading ? (
                renderListState("Loading workflows…")
              ) : errorMessage ? (
                renderListState(errorMessage, "red")
              ) : !hasAnyWorkflows ? (
                renderListState("No workflows defined yet.")
              ) : !hasFilteredWorkflows ? (
                renderListState(
                  "No workflows match your search.",
                  "gray",
                  <SecondaryButton onClick={() => { setSearchTerm(""); setFilter("all"); }}>
                    <X className="h-4 w-4" />
                    Clear search and filters
                  </SecondaryButton>,
                )
              ) : (
                filteredWorkflows.map((wf) => {
                  const isSelected = Boolean(selectedWorkflow && String(selectedWorkflow.id) === String(wf.id));
                  const isLoadable = canLoadWorkflow(wf);
                  const disabledReason = getWorkflowDisabledReason(wf);

                  return (
                    // The whole card selects the workflow, and a double click loads it
                    <div
                      key={wf.id}
                      onClick={() => onRowClick(wf)}
                      onDoubleClick={() => onRowDoubleClick(wf)}
                      title="Click to select, double-click to load"
                      className={classNames(
                        "flex cursor-pointer items-center gap-4 rounded-[10px] border bg-white px-4 py-3.5 transition-[border-color,box-shadow] dark:bg-gray-900",
                        isSelected
                          ? "border-brand-400 ring-2 ring-brand-500/15 dark:border-brand-600"
                          : "border-gray-300 shadow-[0_1px_3px_rgba(15,23,42,0.08)] hover:border-gray-400 hover:shadow-[0_6px_18px_rgba(15,23,42,0.12)] dark:border-gray-700 dark:hover:border-gray-500",
                      )}
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                        <Workflow className="h-5 w-5" />
                      </div>

                      <button
                        type="button"
                        className="min-w-0 flex-1 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
                      >
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
                          <span className="truncate text-[15.5px] font-semibold text-gray-900 dark:text-white" title={wf.name}>
                            {wf.name}
                          </span>
                          <span className="text-[13.5px] tabular-nums text-gray-500 dark:text-gray-400">
                            {protocolCount(wf)} protocols
                          </span>
                          {wf.source ? <Tag>{wf.source}</Tag> : null}
                          {wf.parseError ? <Tag tone="red">parse error</Tag> : null}
                          {wf.missingPluginNames?.length ? (
                            <Tag tone="amber" title={disabledReason}>missing plugins</Tag>
                          ) : null}
                        </div>
                        <div className="mt-1 line-clamp-2 whitespace-pre-line text-[13.5px] leading-6 text-gray-600 dark:text-gray-300">
                          {wf.description || "—"}
                        </div>
                      </button>

                      <div
                        className="shrink-0"
                        // Load opens its dialog once, not a second time through the card's double click
                        onDoubleClick={(event) => event.stopPropagation()}
                      >
                        <PrimaryButton
                          onClick={() => openApply(wf)}
                          disabled={!isLoadable}
                          className="h-9 px-3.5"
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
          </Panel>
        </div>

        <div className="col-span-12 flex min-h-0 flex-col xl:col-span-5">
          <Panel
            title="Details"
            subtitle={selectedWorkflow ? "What the workflow does and the protocols it brings." : "Select a workflow to preview it."}
            right={
              selectedWorkflow ? (
                <PrimaryButton
                  onClick={() => openApply(selectedWorkflow)}
                  disabled={!selectedWorkflowIsLoadable}
                  title={selectedWorkflowIsLoadable ? "Load this workflow" : selectedWorkflowDisabledReason}
                >
                  Load workflow
                  <ArrowRight className="h-4 w-4" />
                </PrimaryButton>
              ) : undefined
            }
            bodyClassName="overflow-y-auto"
          >
            {!selectedWorkflow ? (
              <div className="flex flex-col items-center px-6 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                  <MousePointerClick className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-[16px] font-semibold text-gray-900 dark:text-white">No workflow selected</h3>
                <p className="mt-1 max-w-xs text-[14px] text-gray-500 dark:text-gray-400">
                  Pick one in the list to see its description and a preview of its protocols.
                </p>
              </div>
            ) : (
              <div className="space-y-4 p-5 lg:p-6">
                <div>
                  <h3
                    className="break-words text-[18px] font-semibold leading-7 text-gray-900 dark:text-white"
                    data-testid="workflow-details-name"
                  >
                    {selectedWorkflow.name}
                  </h3>
                  <p className="mt-0.5 text-[13.5px] text-gray-500 dark:text-gray-400">
                    {protocolCount(selectedWorkflow)} protocols · {selectedWorkflow.previewGraph?.edges?.length ?? 0} links
                  </p>
                </div>

                <WorkflowDescriptionCard workflow={selectedWorkflow} onInstalling={() => void loadWorkflows()} />

                <div>
                  <div className="mb-2 text-[15px] font-semibold text-gray-900 dark:text-white">Preview</div>
                  {selectedWorkflow.parseError ? (
                    <div className="rounded-[10px] border border-red-300/80 bg-red-50 px-3 py-2 text-[14px] leading-6 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                      {selectedWorkflow.parseError}
                    </div>
                  ) : (
                    <WorkflowGraphPreview workflow={selectedWorkflow} />
                  )}
                </div>
              </div>
            )}
          </Panel>
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
        "fixed inset-0 z-[90] flex items-center justify-center p-4",
        "bg-gray-900/40 backdrop-blur-[2px] dark:bg-black/50",
      )}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={classNames(
          "relative z-10 w-full max-w-md overflow-hidden rounded-[14px] border shadow-2xl",
          "min-h-[520px] max-h-[520px]",
          "border-gray-300/90 bg-white",
          "dark:border-gray-700 dark:bg-gray-900",
        )}
      >
        <div className="relative flex h-full flex-col px-6 pt-6 pb-5">
          <button
            type="button"
            onClick={onClose}
            className={classNames(
              "absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-[10px] transition",
              "text-gray-500 hover:bg-gray-100 hover:text-gray-800",
              "dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200",
            )}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="mb-4">
            <h2 className="text-[19px] font-semibold text-gray-900 dark:text-white">Load workflow</h2>
            <p className="mt-1 text-[14px] leading-6 text-gray-500 dark:text-gray-400">{workflow.name}</p>
          </div>

          <div className="rounded-[10px] border border-gray-300/85 bg-gray-50 p-0.5 dark:border-gray-700 dark:bg-gray-800/60">
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => setMode("create")}
                className={classNames(
                  "rounded-lg px-3 py-2 text-[14px] font-medium transition",
                  mode === "create"
                    ? "bg-white text-gray-900 shadow-sm ring-1 ring-gray-300/80 dark:bg-gray-700 dark:text-white dark:ring-gray-600"
                    : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200",
                )}
              >
                Create new
              </button>
              <button
                type="button"
                onClick={() => setMode("select")}
                className={classNames(
                  "rounded-lg px-3 py-2 text-[14px] font-medium transition",
                  mode === "select"
                    ? "bg-white text-gray-900 shadow-sm ring-1 ring-gray-300/80 dark:bg-gray-700 dark:text-white dark:ring-gray-600"
                    : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200",
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
                  <label className="text-[14px] font-medium text-gray-700 dark:text-gray-300">New project name</label>
                  <input
                    type="text"
                    value={newProjectTitle}
                    onChange={(e) => setNewProjectTitle(e.target.value)}
                    placeholder="Enter a title"
                    className={classNames(
                      crispText,
                      "w-full rounded-[10px] border px-3 py-2.5 text-[14.5px] outline-none transition",
                      "border-gray-300/80 bg-white text-gray-950 placeholder:text-gray-400",
                      "focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10",
                      "dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:placeholder:text-gray-500",
                    )}
                  />
                </div>

                <div className="mt-4 space-y-1.5">
                  <label className="text-[14px] font-medium text-gray-700 dark:text-gray-300">Project description</label>
                  <textarea
                    rows={4}
                    value={newProjectDescription}
                    onChange={(e) => setNewProjectDescription(e.target.value)}
                    placeholder="Optional description for this project"
                    className={classNames(
                      crispText,
                      "w-full resize-none rounded-[10px] border px-3 py-2.5 text-[14.5px] leading-6 text-gray-900 outline-none transition placeholder:text-gray-400",
                      "border-gray-300/80 bg-white",
                      "focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10",
                      "dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:placeholder:text-gray-500",
                    )}
                  />
                  <p className="text-[13.5px] leading-6 text-gray-500 dark:text-gray-400">
                    A new project will be created and this workflow will be loaded into it.
                  </p>
                </div>
              </>
            ) : (
              <div className="space-y-1.5">
                <label className="text-[14px] font-medium text-gray-700 dark:text-gray-300">Project</label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className={classNames(
                    crispText,
                    "w-full rounded-[10px] border px-3 py-2.5 text-[14.5px] outline-none transition",
                    "border-gray-300/80 bg-white text-gray-950",
                    "focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10",
                    "dark:border-gray-700 dark:bg-gray-900 dark:text-white",
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
                  <p className="text-[13.5px] leading-6 text-red-600 dark:text-red-300">{projectsError}</p>
                ) : (
                  <p className="text-[13.5px] leading-6 text-gray-500 dark:text-gray-400">
                    The workflow will be loaded inside the selected existing project.
                  </p>
                )}
              </div>
            )}

            {submitError ? <div className="mt-4 text-[14px] leading-6 text-red-600 dark:text-red-300">{submitError}</div> : null}
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
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