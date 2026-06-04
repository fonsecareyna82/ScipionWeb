// src/pages/Dashboard/plugins/Plugins.tsx
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FolderPlus, Search, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

import PageMeta from "../../../components/common/PageMeta";
import PluginCard from "../../../components/plugin/PluginsCard";
import { installPlugin, type Plugin } from "@/api/plugins";
import { usePlugins } from "@/hooks/usePlugins";
import { useProcessingPlugins } from "@/hooks/useProcessingPlugins";
import InstallDevelPluginDialog from "./InstallDevelPluginDialog";
import PluginListTable from "./PluginListTable";
import PluginQuickDetailsPanel from "./PluginQuickDetailsPanel";
import PluginSelectionBar from "./PluginSelectionBar";
import PluginViewToggle from "./PluginViewToggle";
import {
  canBatchInstallPlugin,
  classNames,
  formatTimeAgo,
  getPluginCategoryIds,
  getPluginCategoryMetadata,
  getTaskOperationLabel,
  type PluginCategoryTab,
  type PluginProcessingState,
  type PluginViewMode,
  type PluginWithCategories,
  type TabKey,
} from "./plugin_helpers";

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
  const { tasks, installing, removing, registerTask } = useProcessingPlugins();
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
  const [viewMode, setViewMode] = useState<PluginViewMode>("cards");
  const [selectedPipNames, setSelectedPipNames] = useState<Set<string>>(new Set());
  const [activeListPluginPipName, setActiveListPluginPipName] = useState<string | null>(null);
  const [batchSkipBinaries, setBatchSkipBinaries] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);

  useEffect(() => {
    if (tasksCount === 0) {
      void refetch();
    }
  }, [tasksCount, refetch]);

  useEffect(() => {
    setActiveCategoryId("all");
    setSelectedPipNames(new Set());
    setActiveListPluginPipName(null);
  }, [activeTab]);

  useEffect(() => {
    setSelectedPipNames(new Set());
    setActiveListPluginPipName(null);
  }, [activeCategoryId, search]);

  const installedPlugins = useMemo(() => plugins.filter((p) => p.installed), [plugins]);
  const availablePlugins = useMemo(() => plugins.filter((p) => !p.installed), [plugins]);
  const develPlugins = useMemo(() => plugins.filter((p) => p.devel || p.installMode === "devel"), [plugins]);

  const processingByPipName = useMemo(() => {
    const map = new Map<string, PluginProcessingState>();
    installing.forEach((pipName) => map.set(pipName, "installing"));
    removing.forEach((pipName) => map.set(pipName, "removing"));
    return map;
  }, [installing, removing]);

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
      const c = (t.pipNames ?? []).join(" ").toLowerCase();
      return a.includes(term) || b.includes(term) || c.includes(term);
    });
  }, [tasks, search]);

  const activeListPlugin = useMemo(() => {
    if (!activeListPluginPipName) return null;
    return filteredPlugins.find((plugin) => plugin.pipName === activeListPluginPipName) ?? null;
  }, [activeListPluginPipName, filteredPlugins]);

  const selectedPlugins = useMemo(() => {
    const byPipName = new Map(filteredPlugins.map((plugin) => [plugin.pipName, plugin]));
    return Array.from(selectedPipNames)
      .map((pipName) => byPipName.get(pipName))
      .filter(Boolean) as Plugin[];
  }, [filteredPlugins, selectedPipNames]);

  const actionableSelectedPlugins = useMemo(() => {
    return selectedPlugins.filter((plugin) =>
      canBatchInstallPlugin(plugin, processingByPipName.get(plugin.pipName) ?? null),
    );
  }, [processingByPipName, selectedPlugins]);

  const selectionPrimaryLabel = activeTab === "installed" ? "Update selected" : "Install selected";
  const selectionBusyLabel = activeTab === "installed" ? "Submitting updates..." : "Submitting selected...";

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

  function openPluginDetails(plugin: Plugin) {
    navigate(`/plugins/${plugin.pipName}`, { state: { plugin } });
  }

  function togglePluginSelection(plugin: Plugin) {
    const processingState = processingByPipName.get(plugin.pipName) ?? null;
    if (!canBatchInstallPlugin(plugin, processingState)) return;

    setSelectedPipNames((current) => {
      const next = new Set(current);
      if (next.has(plugin.pipName)) next.delete(plugin.pipName);
      else next.add(plugin.pipName);
      return next;
    });
  }

  function toggleAllVisiblePlugins() {
    const selectable = filteredPlugins.filter((plugin) =>
      canBatchInstallPlugin(plugin, processingByPipName.get(plugin.pipName) ?? null),
    );
    const allSelected = selectable.length > 0 && selectable.every((plugin) => selectedPipNames.has(plugin.pipName));

    setSelectedPipNames((current) => {
      const next = new Set(current);
      if (allSelected) {
        selectable.forEach((plugin) => next.delete(plugin.pipName));
      } else {
        selectable.forEach((plugin) => next.add(plugin.pipName));
      }
      return next;
    });
  }

  async function installSelectedPlugins() {
    if (batchBusy) return;
    const queue = [...actionableSelectedPlugins];
    if (queue.length === 0) return;

    setBatchBusy(true);

    try {
      const results = await Promise.allSettled(
        queue.map(async (plugin) => {
          const started = await installPlugin(plugin.pipName, { skipBinaries: batchSkipBinaries });

          registerTask({
            taskId: started.taskId,
            pipName: plugin.pipName,
            pluginName: plugin.name,
            operation: "install",
            initialStatus: started.status,
          });

          return started;
        }),
      );

      const hasStartedTasks = results.some((result) => result.status === "fulfilled");
      if (hasStartedTasks) {
        setSelectedPipNames(new Set());
        setActiveTab("tasks");
        void refetch();
      }
    } finally {
      setBatchBusy(false);
    }
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
                    className="!border-[#333d49] !bg-[#333d49] !text-white shadow-sm shadow-slate-900/10 hover:!border-[#2b3440] hover:!bg-[#2b3440] hover:!text-white hover:shadow-md dark:!border-slate-600 dark:!bg-[#333d49] dark:!text-white dark:hover:!border-slate-500 dark:hover:!bg-[#2b3440]"
                  >
                    <FolderPlus className="h-4 w-4 text-white" />
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

              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
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

                {activeTab !== "tasks" ? (
                  <PluginViewToggle viewMode={viewMode} onViewModeChange={setViewMode} />
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
                        {t.pipNames && t.pipNames.length > 0 ? (
                          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {t.pipNames.length} selected plugin{t.pipNames.length === 1 ? "" : "s"}
                          </div>
                        ) : null}
                      </div>

                      <div className="col-span-6 text-sm text-gray-700 dark:text-gray-300 md:col-span-3">
                        {getTaskOperationLabel(t.operation)}
                      </div>

                      <div className="col-span-6 md:col-span-3">
                        <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-800 dark:bg-white/10 dark:text-gray-200">
                          {(t.status === "PENDING" || t.status === "STARTED" || t.status === "PROGRESS") && (
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
            ) : viewMode === "cards" ? (
              <div className="mt-4 rounded-2xl border border-gray-200/70 bg-white/40 p-4 dark:border-gray-800/80 dark:bg-white/[0.01]">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
                  {filteredPlugins.map((plugin) => (
                    <PluginCard
                      key={plugin.pipName}
                      {...plugin}
                      processingState={processingByPipName.get(plugin.pipName) ?? null}
                    />
                  ))}

                  {filteredPlugins.length === 0 && (
                    <div className="col-span-full py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                      No plugins found.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="min-w-0">
                  <div className="sticky top-4 z-30 mb-3 rounded-2xl bg-white/90 pb-1 backdrop-blur dark:bg-slate-950/90">
                    <PluginSelectionBar
                      selectedCount={selectedPlugins.length}
                      actionableCount={actionableSelectedPlugins.length}
                      busy={batchBusy}
                      optionChecked={batchSkipBinaries}
                      optionLabel="Skip binaries"
                      primaryLabel={selectionPrimaryLabel}
                      busyLabel={selectionBusyLabel}
                      className="shadow-sm shadow-slate-900/10"
                      onOptionChange={setBatchSkipBinaries}
                      onPrimaryAction={installSelectedPlugins}
                      onClearSelection={() => setSelectedPipNames(new Set())}
                    />
                  </div>

                  <div className="min-w-0 overflow-x-auto rounded-2xl">
                    <PluginListTable
                      plugins={filteredPlugins}
                      selectedPipNames={selectedPipNames}
                      processingByPipName={processingByPipName}
                      activePluginPipName={activeListPluginPipName}
                      maxHeightClassName="max-h-[calc(100vh-430px)]"
                      onTogglePlugin={togglePluginSelection}
                      onToggleAllVisible={toggleAllVisiblePlugins}
                      onSelectPlugin={(plugin) => setActiveListPluginPipName(plugin.pipName)}
                      onOpenDetails={openPluginDetails}
                    />
                  </div>
                </div>

                <div className="2xl:sticky 2xl:top-4 2xl:self-start">
                  <PluginQuickDetailsPanel
                    plugin={activeListPlugin}
                    processingState={activeListPlugin ? processingByPipName.get(activeListPlugin.pipName) ?? null : null}
                    onClose={() => setActiveListPluginPipName(null)}
                    onOpenDetails={openPluginDetails}
                  />
                </div>
              </div>
            )}
          </>
        ) : null}
      </CardShell>
    </>
  );
}
