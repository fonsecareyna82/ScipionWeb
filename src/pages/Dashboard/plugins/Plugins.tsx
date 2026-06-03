// src/pages/Dashboard/plugins/Plugins.tsx
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FolderPlus, Search, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

import PageMeta from "../../../components/common/PageMeta";
import PluginCard from "../../../components/plugin/PluginsCard";
import { usePlugins } from "@/hooks/usePlugins";
import { useProcessingPlugins } from "@/hooks/useProcessingPlugins";
import InstallDevelPluginDialog from "./InstallDevelPluginDialog";

type TabKey = "installed" | "available" | "tasks";

type PluginCategoryTab = {
  id: string;
  title: string;
  description?: string;
  count: number;
};

type PluginWithCategories = {
  category?: unknown;
  categories?: unknown;
  categoryIds?: unknown;
  categoryData?: unknown;
};

const fallbackCategoryById: Record<string, { title: string; description: string }> = {
  single_particle: {
    title: "SPA",
    description: "SPA processing, classification, refinement and reconstruction",
  },
  tomography: {
    title: "Tomography",
    description: "Tomograms, tilt series and subtomogram workflows",
  },
  modelling: {
    title: "Modelling",
    description: "Model building, fitting, validation and visualization",
  },
  flexibility: {
    title: "Flexibility",
    description: "Visualization and manipulation of flexibility data",
  },
  chem: {
    title: "CHEM",
    description: "CHEMoinformatics and virtual drug screening",
  },
  unclassified: {
    title: "Unclassified",
    description: "Unclassified plugins",
  },
};

function classNames(...xs: Array<string | false | null | undefined>): string {
  return xs.filter(Boolean).join(" ");
}

function formatTimeAgo(ms: number) {
  const diffMs = Date.now() - ms;
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 60) return `${sec} seg ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  return `${hr} hours ago`;
}

function humanizeCategoryId(id: string): string {
  const fallback = fallbackCategoryById[id];
  if (fallback) return fallback.title;

  return id
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function getFallbackCategoryDescription(id: string): string {
  return fallbackCategoryById[id]?.description ?? "";
}

function normalizeCategoryId(raw: unknown): string {
  return String(raw ?? "").trim();
}

function readCategoryMetaFromRaw(raw: unknown): Array<Omit<PluginCategoryTab, "count">> {
  if (!raw) return [];

  const items = Array.isArray(raw) ? raw : [raw];

  return items
    .map((item) => {
      if (typeof item === "string") {
        const id = normalizeCategoryId(item);
        if (!id) return null;

        return {
          id,
          title: humanizeCategoryId(id),
          description: getFallbackCategoryDescription(id),
        };
      }

      if (!item || typeof item !== "object") return null;

      const obj = item as Record<string, unknown>;
      const id = normalizeCategoryId(
        obj.id ??
          obj.categoryId ??
          obj.key ??
          obj.value ??
          obj.name,
      );

      if (!id) return null;

      return {
        id,
        title: String(obj.title ?? obj.label ?? obj.name ?? humanizeCategoryId(id)),
        description: String(obj.description ?? getFallbackCategoryDescription(id)),
      };
    })
    .filter(Boolean) as Array<Omit<PluginCategoryTab, "count">>;
}

function getPluginCategoryMetadata(plugin: PluginWithCategories): Array<Omit<PluginCategoryTab, "count">> {
  const rawMetas = [
    ...readCategoryMetaFromRaw(plugin.categoryData),
    ...readCategoryMetaFromRaw(plugin.categories),
    ...readCategoryMetaFromRaw(plugin.categoryIds),
    ...readCategoryMetaFromRaw(plugin.category),
  ];

  const byId = new Map<string, Omit<PluginCategoryTab, "count">>();

  for (const meta of rawMetas) {
    if (!meta.id) continue;

    const current = byId.get(meta.id);
    byId.set(meta.id, {
      id: meta.id,
      title: meta.title || current?.title || humanizeCategoryId(meta.id),
      description: meta.description || current?.description || getFallbackCategoryDescription(meta.id),
    });
  }

  if (byId.size === 0) {
    byId.set("unclassified", {
      id: "unclassified",
      title: fallbackCategoryById.unclassified.title,
      description: fallbackCategoryById.unclassified.description,
    });
  }

  return Array.from(byId.values());
}

function getPluginCategoryIds(plugin: PluginWithCategories): string[] {
  return getPluginCategoryMetadata(plugin).map((category) => category.id);
}

function getTaskOperationLabel(operation: string): string {
  if (operation === "install-devel") return "Install devel";
  if (operation === "install") return "Install/Update";
  if (operation === "uninstall") return "Uninstall";
  return operation;
}

function CardShell(props: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={classNames(
        "relative overflow-hidden rounded-2xl border p-5 shadow-sm backdrop-blur",
        "border-gray-200/70 bg-white/80",
        "dark:border-gray-800/80 dark:bg-white/[0.03]",
        "lg:p-6",
      )}
    >
      <div className="relative">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
              {props.title}
            </h3>
            {props.subtitle ? (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {props.subtitle}
              </p>
            ) : null}
          </div>
          {props.right ? <div className="shrink-0">{props.right}</div> : null}
        </div>
        {props.children}
      </div>
    </div>
  );
}

function StatPill(props: { label: string; value: ReactNode }) {
  return (
    <div
      className={classNames(
        "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold",
        "border-gray-200/70 bg-white/70 text-gray-700",
        "dark:border-gray-800/80 dark:bg-white/[0.02] dark:text-gray-200",
      )}
    >
      <span className="text-gray-600 dark:text-gray-300">{props.label}</span>
      <span>{props.value}</span>
    </div>
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
        "inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition",
        "border-gray-200/70 bg-white/70 text-gray-800 shadow-sm hover:border-gray-300/80 hover:shadow-md",
        "dark:border-gray-800/80 dark:bg-white/[0.02] dark:text-white/90 dark:hover:border-gray-700",
        "disabled:cursor-not-allowed disabled:opacity-60",
        props.className,
      )}
    >
      {props.children}
    </button>
  );
}

function TabButton(props: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={classNames(
        "rounded-lg border px-3 py-2 text-sm font-semibold transition",
        "focus:outline-none focus:ring-2 focus:ring-indigo-500/25 dark:focus:ring-indigo-400/25",
        props.active
          ? [
              "border-indigo-500/70 bg-indigo-600 text-white shadow-md shadow-indigo-500/20",
              "ring-1 ring-indigo-500/30",
              "dark:border-indigo-400/70 dark:bg-indigo-500 dark:text-white dark:shadow-indigo-500/20",
            ].join(" ")
          : [
              "border-transparent text-gray-700 hover:border-gray-200 hover:bg-gray-50/80",
              "dark:text-gray-200 dark:hover:border-gray-700 dark:hover:bg-gray-800/40",
            ].join(" "),
      )}
    >
      {props.children}
    </button>
  );
}

export default function Plugins() {
  const navigate = useNavigate();
  const { tasks, installing, removing } = useProcessingPlugins();
  const tasksCount = tasks.length;

  const {
    data: plugins = [],
    isLoading,
    isError,
    refetch,
  } = usePlugins({
    refetchInterval: tasksCount > 0 ? 2000 : false,
  });

  const [activeTab, setActiveTab] = useState<TabKey>("available");
  const [activeCategoryId, setActiveCategoryId] = useState("all");
  const [search, setSearch] = useState("");
  const [installDevelOpen, setInstallDevelOpen] = useState(false);

  useEffect(() => {
    if (tasksCount === 0) {
      void refetch();
    }
  }, [tasksCount, refetch]);

  useEffect(() => {
    setActiveCategoryId("all");
  }, [activeTab]);

  const installedPlugins = useMemo(() => plugins.filter((p) => p.installed), [plugins]);
  const availablePlugins = useMemo(() => plugins.filter((p) => !p.installed), [plugins]);
  const develPlugins = useMemo(() => plugins.filter((p) => p.devel || p.installMode === "devel"), [plugins]);

  const displayedPlugins = useMemo(() => {
    if (activeTab === "installed") return installedPlugins;
    if (activeTab === "available") return availablePlugins;
    return [];
  }, [activeTab, installedPlugins, availablePlugins]);

  const categoryTabs = useMemo<PluginCategoryTab[]>(() => {
    const byId = new Map<string, PluginCategoryTab>();

    for (const plugin of displayedPlugins) {
      const categories = getPluginCategoryMetadata(plugin as PluginWithCategories);

      for (const category of categories) {
        const current = byId.get(category.id);

        byId.set(category.id, {
          id: category.id,
          title: category.title,
          description: category.description,
          count: (current?.count ?? 0) + 1,
        });
      }
    }

    return Array.from(byId.values()).sort((a, b) => {
      if (a.id === "unclassified") return 1;
      if (b.id === "unclassified") return -1;
      return a.title.localeCompare(b.title);
    });
  }, [displayedPlugins]);

  useEffect(() => {
    if (activeTab === "tasks") return;
    if (activeCategoryId === "all") return;

    const exists = categoryTabs.some((category) => category.id === activeCategoryId);
    if (!exists) setActiveCategoryId("all");
  }, [activeTab, activeCategoryId, categoryTabs]);

  const filteredPlugins = useMemo(() => {
    const term = search.trim().toLowerCase();

    return displayedPlugins.filter((p) => {
      const categoryIds = getPluginCategoryIds(p as PluginWithCategories);
      const categoryText = getPluginCategoryMetadata(p as PluginWithCategories)
        .map((category) => `${category.id} ${category.title} ${category.description ?? ""}`)
        .join(" ")
        .toLowerCase();

      const matchesCategory =
        activeCategoryId === "all" || categoryIds.includes(activeCategoryId);

      if (!matchesCategory) return false;

      if (!term) return true;

      const name = (p.name ?? "").toLowerCase();
      const pipName = (p.pipName ?? "").toLowerCase();
      const localPath = (p.localPath ?? "").toLowerCase();

      return name.includes(term) || pipName.includes(term) || localPath.includes(term) || categoryText.includes(term);
    });
  }, [displayedPlugins, search, activeCategoryId]);

  const filteredTasks = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return tasks;

    return tasks.filter((t) => {
      const a = (t.pluginName ?? "").toLowerCase();
      const b = (t.pipName ?? "").toLowerCase();
      return a.includes(term) || b.includes(term);
    });
  }, [tasks, search]);

  const loading = isLoading && plugins.length === 0;
  const error = isError ? "Failed to load plugins" : null;

  function openTaskPlugin(pipName: string) {
    const plugin = plugins.find((p) => p.pipName === pipName);

    if (plugin) {
      navigate(`/plugins/${pipName}`, { state: { plugin } });
      return;
    }

    navigate(`/plugins/${pipName}`);
  }

  return (
    <>
      <PageMeta title="Scipion | Plugins" description="Plugins page" />

      <InstallDevelPluginDialog
        open={installDevelOpen}
        onClose={() => setInstallDevelOpen(false)}
        onTaskStarted={() => {
          setActiveTab("tasks");
          void refetch();
        }}
      />

      <CardShell
        title="Plugins"
        subtitle="Install, remove, and monitor Scipion plugins and background tasks."
      >
        {loading && (
          <div
            role="status"
            aria-live="polite"
            className="absolute inset-0 z-[80] flex flex-col items-center justify-center rounded-2xl bg-white/75 backdrop-blur-[2px] dark:bg-gray-900/75"
            style={{ pointerEvents: "auto" }}
          >
            <div className="relative">
              <div className="h-8 w-8 rounded-full border-2 border-gray-300 dark:border-gray-700" />
              <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-gray-700 dark:border-t-gray-200" />
            </div>
            <p className="mt-3 text-xs tracking-wide text-gray-700 dark:text-gray-200">
              Loading <span className="font-medium">Plugins</span>…
            </p>
          </div>
        )}

        {!loading && error ? (
          <div className="rounded-xl border border-red-200/70 bg-red-50/80 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </div>
        ) : !loading ? (
          <>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="rounded-xl border border-gray-300/80 bg-white/70 p-1 dark:border-gray-700/80 dark:bg-white/[0.02]">
                  <div className="flex flex-wrap gap-1">
                    <TabButton
                      active={activeTab === "installed"}
                      onClick={() => setActiveTab("installed")}
                    >
                      Installed ({installedPlugins.length})
                    </TabButton>

                    <TabButton
                      active={activeTab === "available"}
                      onClick={() => setActiveTab("available")}
                    >
                      Available ({availablePlugins.length})
                    </TabButton>

                    <TabButton
                      active={activeTab === "tasks"}
                      onClick={() => setActiveTab("tasks")}
                    >
                      Tasks ({tasksCount})
                    </TabButton>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <SecondaryButton
                    onClick={() => setInstallDevelOpen(true)}
                    title="Install a local Scipion plugin in devel mode"
                    className="border-indigo-300/80 text-indigo-700 hover:border-indigo-400 dark:border-indigo-900/60 dark:text-indigo-300 dark:hover:border-indigo-700"
                  >
                    <FolderPlus className="h-4 w-4" />
                    Install local plugin
                  </SecondaryButton>
                  <StatPill label="Installed" value={installedPlugins.length} />
                  <StatPill label="Available" value={availablePlugins.length} />
                  <StatPill label="Devel" value={develPlugins.length} />
                  <StatPill label="Tasks" value={tasksCount} />
                </div>
              </div>

              {activeTab !== "tasks" ? (
                <div className="rounded-xl border border-gray-300/80 bg-white/70 p-1 dark:border-gray-700/80 dark:bg-white/[0.02]">
                  <div className="flex flex-wrap gap-1">
                    <TabButton
                      active={activeCategoryId === "all"}
                      onClick={() => setActiveCategoryId("all")}
                    >
                      All ({displayedPlugins.length})
                    </TabButton>

                    {categoryTabs.map((category) => (
                      <TabButton
                        key={category.id}
                        active={activeCategoryId === category.id}
                        onClick={() => setActiveCategoryId(category.id)}
                      >
                        {category.title} ({category.count})
                      </TabButton>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="relative w-full max-w-[420px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />

                <input
                  type="text"
                  placeholder={activeTab === "tasks" ? "Search task…" : "Search plugin…"}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={classNames(
                    "w-full rounded-xl border py-2 pl-9 pr-10 text-sm font-semibold outline-none transition",
                    "border-gray-200/70 bg-white/70 text-gray-800 placeholder:text-gray-400",
                    "focus:border-indigo-500/40 focus:ring-2 focus:ring-indigo-500/10",
                    "dark:border-gray-800/80 dark:bg-white/[0.02] dark:text-white/90 dark:placeholder:text-gray-500",
                    "dark:focus:border-indigo-400/40 dark:focus:ring-indigo-400/15",
                  )}
                />

                {search ? (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:text-gray-500 dark:hover:bg-white/[0.04] dark:hover:text-gray-200"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </div>

            {activeTab === "tasks" ? (
              <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200/70 bg-white/70 shadow-sm dark:border-gray-800/80 dark:bg-white/[0.01]">
                <div
                  className={classNames(
                    "grid grid-cols-12 gap-3 border-b border-gray-200/70 px-4 py-3 text-xs font-semibold text-gray-600 dark:border-gray-800/70 dark:bg-white/[0.02] dark:text-gray-300",
                    "bg-gray-50/80",
                  )}
                >
                  <div className="col-span-4">Plugin</div>
                  <div className="col-span-3">Operation</div>
                  <div className="col-span-3">Status</div>
                  <div className="col-span-2 text-right">Updated</div>
                </div>

                <div className="divide-y divide-gray-200/70 dark:divide-gray-800/70">
                  {filteredTasks.map((t) => (
                    <button
                      key={t.taskId}
                      type="button"
                      onClick={() => openTaskPlugin(t.pipName)}
                      className={classNames(
                        "grid w-full grid-cols-12 gap-3 px-4 py-3 text-left transition",
                        "cursor-pointer hover:bg-gray-50/80 focus:outline-none focus:ring-2 focus:ring-indigo-500/20",
                        "dark:hover:bg-white/[0.02] dark:focus:ring-indigo-400/20",
                      )}
                      title={`Open ${t.pluginName ?? t.pipName}`}
                      aria-label={`Open ${t.pluginName ?? t.pipName}`}
                    >
                      <div className="col-span-12 min-w-0 md:col-span-4">
                        <div className="truncate text-sm font-semibold text-gray-900 dark:text-white/90">
                          {t.pluginName ?? t.pipName}
                        </div>
                        <div className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
                          {t.pipName}
                        </div>
                      </div>

                      <div className="col-span-6 text-sm text-gray-700 dark:text-gray-300 md:col-span-3">
                        {getTaskOperationLabel(t.operation)}
                      </div>

                      <div className="col-span-6 md:col-span-3">
                        <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-800 dark:bg-white/10 dark:text-gray-200">
                          {(t.status === "PENDING" || t.status === "STARTED") && (
                            <span className="h-3 w-3 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
                          )}
                          {t.status}
                        </span>

                        {t.step ? (
                          <div className="mt-1 break-all text-xs text-gray-600 dark:text-gray-400">
                            {t.step}
                          </div>
                        ) : null}

                        {t.error ? (
                          <div className="mt-1 break-all text-xs text-red-500 dark:text-red-300">
                            {t.error}
                          </div>
                        ) : null}
                      </div>

                      <div className="col-span-12 text-left text-xs text-gray-600 dark:text-gray-400 md:col-span-2 md:text-right">
                        {formatTimeAgo(t.updatedAtMs)}
                      </div>
                    </button>
                  ))}

                  {filteredTasks.length === 0 && (
                    <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                      No active tasks.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-gray-200/70 bg-white/40 p-4 dark:border-gray-800/80 dark:bg-white/[0.01]">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
                  {filteredPlugins.map((plugin) => (
                    <PluginCard
                      key={plugin.pipName}
                      {...plugin}
                      processingState={
                        installing.has(plugin.pipName)
                          ? "installing"
                          : removing.has(plugin.pipName)
                            ? "removing"
                            : null
                      }
                    />
                  ))}

                  {filteredPlugins.length === 0 && (
                    <div className="col-span-full py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                      No plugins found.
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        ) : null}
      </CardShell>
    </>
  );
}
