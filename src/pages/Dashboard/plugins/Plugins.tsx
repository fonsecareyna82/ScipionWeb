// src/pages/Dashboard/plugins/Plugins.tsx
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePermissions } from "@/hooks/usePermissions";
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
import PluginTaskCenter from "./PluginTaskCenter";
import {
  canBatchInstallPlugin,
  classNames,
  getPluginCategoryIds,
  getPluginCategoryMetadata,
  type PluginCategoryTab,
  type PluginProcessingState,
  type PluginViewMode,
  type PluginWithCategories,
  type TabKey,
} from "./plugin_helpers";

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

/** One of the page's main sections (installed, available, tasks): an underlined tab. */
function SectionTab(props: { active: boolean; onClick: () => void; label: string; count: number; busy?: boolean }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={props.active}
      onClick={props.onClick}
      className={classNames(
        "relative inline-flex h-11 items-center gap-2 px-1 text-[14.5px] font-medium transition",
        props.active
          ? "text-gray-900 after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-brand-500 dark:text-white"
          : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200",
      )}
    >
      {props.label}
      <span
        className={classNames(
          "rounded-full px-2 py-0.5 text-[13px] font-semibold tabular-nums",
          props.busy
            ? "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"
            : props.active
              ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
              : "bg-gray-200/80 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
        )}
      >
        {props.count}
      </span>
    </button>
  );
}

/** A category to narrow the plugins shown. */
function CategoryChip(props: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      aria-pressed={props.active}
      onClick={props.onClick}
      className={classNames(
        "inline-flex h-8 items-center gap-1.5 rounded-[10px] border px-3 text-[13.5px] font-medium transition",
        props.active
          ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
          : "border-gray-300 bg-white text-gray-700 hover:border-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-gray-500",
      )}
    >
      {props.label}
      <span className={classNames("tabular-nums", props.active ? "text-white/70 dark:text-gray-900/60" : "text-gray-400 dark:text-gray-500")}>
        {props.count}
      </span>
    </button>
  );
}

export default function Plugins() {
  const navigate = useNavigate();
  // Installing and updating are for whoever holds plugins.manage; the others only read
  const { can } = usePermissions();
  const canManagePlugins = can("plugins.manage");
  const {
    tasks,
    installing,
    removing,
    registerTask,
    refreshTasks,
  } = useProcessingPlugins();


  const activeTasksCount = useMemo(
    () =>
      tasks.filter(
        (task) =>
          !["SUCCESS", "FAILURE", "CANCELLED"].includes(
            String(task.status).toUpperCase(),
          ),
      ).length,
    [tasks],
  );


  const {
    data: plugins = [],
    isLoading,
    isError,
    refetch,
  } = usePlugins({
    refetchInterval: activeTasksCount > 0 ? 2000 : false,
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
    if (activeTasksCount === 0) {
      void refetch();
    }
  }, [activeTasksCount, refetch]);

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

      <div className="h-[calc(100dvh-88px)] min-h-0 overflow-hidden">
        <section className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-[10px] border border-gray-300/85 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)] dark:border-gray-700 dark:bg-gray-900">
          <div className="shrink-0 border-b border-gray-200/90 px-5 pt-4 dark:border-gray-700 lg:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <h1 className="text-[19px] font-semibold text-gray-900 dark:text-white">Plugins</h1>
                  <span className="rounded-full bg-gray-200/80 px-2.5 py-0.5 text-[13px] font-semibold tabular-nums text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                    {installedPlugins.length + availablePlugins.length}
                  </span>
                </div>
                <p className="mt-0.5 text-[13.5px] text-gray-500 dark:text-gray-400">
                  Install, update and remove plugins, and follow their tasks.
                </p>
              </div>
              {canManagePlugins ? (
                <SecondaryButton
                  onClick={() => setInstallDevelOpen(true)}
                  title="Install a local Scipion plugin in devel mode"
                >
                  <FolderPlus className="h-4 w-4" />
                  Install local plugin
                </SecondaryButton>
              ) : null}
            </div>

            <div role="tablist" aria-label="Plugins sections" className="mt-2 flex items-center gap-6">
              <SectionTab active={activeTab === "installed"} onClick={() => setActiveTab("installed")}
                          label="Installed" count={installedPlugins.length} />
              <SectionTab active={activeTab === "available"} onClick={() => setActiveTab("available")}
                          label="Available" count={availablePlugins.length} />
              <SectionTab active={activeTab === "tasks"} onClick={() => setActiveTab("tasks")}
                          label="Tasks" count={activeTasksCount} busy={activeTasksCount > 0} />
            </div>
          </div>

          {loading && (
            <div
              role="status"
              aria-live="polite"
              className="absolute inset-0 z-[80] flex flex-col items-center justify-center rounded-[10px] bg-white/75 backdrop-blur-[2px] dark:bg-gray-900/75"
              style={{ pointerEvents: "auto" }}
            >
              <div className="relative">
                <div className="h-8 w-8 rounded-full border-2 border-gray-300 dark:border-gray-700" />
                <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-gray-700 dark:border-t-gray-200" />
              </div>
              <p className="mt-3 text-[14px] text-gray-700 dark:text-gray-200">
                Loading <span className="font-medium">Plugins</span>…
              </p>
            </div>
          )}

          <div className="flex min-h-0 flex-1 flex-col bg-gray-100 dark:bg-gray-950">
            {!loading && error ? (
              <div className="m-5 rounded-[10px] border border-red-200/70 bg-red-50 p-4 text-[14px] text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
                {error}
              </div>
            ) : !loading ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="shrink-0 space-y-3 px-5 pt-4 pb-4 lg:px-6">

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="relative min-w-[220px] flex-1 sm:max-w-md">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        aria-label={activeTab === "tasks" ? "Search tasks" : "Search plugins"}
                        placeholder={activeTab === "tasks" ? "Search task…" : "Search plugin…"}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className={classNames(
                          "h-10 w-full rounded-[10px] border pl-9 pr-10 text-[14.5px] outline-none transition",
                          "border-gray-300 bg-white text-gray-900 placeholder:text-gray-400",
                          "focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10",
                          "dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:placeholder:text-gray-500",
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
                      <div className="ml-auto">
                        <PluginViewToggle viewMode={viewMode} onViewModeChange={setViewMode} />
                      </div>
                    ) : null}
                  </div>

                  {activeTab !== "tasks" ? (
                    <div role="group" aria-label="Plugin categories" className="flex flex-wrap items-center gap-1.5">
                      <CategoryChip active={activeCategoryId === "all"} onClick={() => setActiveCategoryId("all")}
                                    label="All" count={displayedPlugins.length} />
                      {categoryTabs.map((category) => (
                        <CategoryChip
                          key={category.id}
                          active={activeCategoryId === category.id}
                          onClick={() => setActiveCategoryId(category.id)}
                          label={category.title}
                          count={category.count}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>

                {activeTab === "tasks" ? (
                  <div className="min-h-0 flex-1 overflow-hidden px-5 pb-5 lg:px-6">
                    <PluginTaskCenter
                      tasks={tasks}
                      search={search}
                      onOpenPlugin={openTaskPlugin}
                      onTasksChanged={refreshTasks}
                    />
                  </div>
                ) : viewMode === "cards" ? (
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 lg:px-6">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
                      {filteredPlugins.map((plugin) => (
                        <PluginCard
                          key={plugin.pipName}
                          {...plugin}
                          processingState={processingByPipName.get(plugin.pipName) ?? null}
                        />
                      ))}

                      {filteredPlugins.length === 0 && (
                        <div className="col-span-full rounded-[10px] border border-dashed border-gray-300 bg-white/60 py-12 text-center text-[15px] text-gray-500 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-400">
                          No plugins found.
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden px-5 pb-5 lg:px-6 2xl:grid-cols-[minmax(0,1fr)_360px]">
                    <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
                      {canManagePlugins && <div className="z-30 mb-3 shrink-0">
                        <PluginSelectionBar
                          selectedCount={selectedPlugins.length}
                          actionableCount={actionableSelectedPlugins.length}
                          busy={batchBusy}
                          optionChecked={batchSkipBinaries}
                          optionLabel="Skip binaries"
                          primaryLabel={selectionPrimaryLabel}
                          busyLabel={selectionBusyLabel}
                          onOptionChange={setBatchSkipBinaries}
                          onPrimaryAction={installSelectedPlugins}
                          onClearSelection={() => setSelectedPipNames(new Set())}
                        />
                      </div>}

                      <div className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-[10px]">
                        <PluginListTable
                          plugins={filteredPlugins}
                          selectedPipNames={selectedPipNames}
                          processingByPipName={processingByPipName}
                          activePluginPipName={activeListPluginPipName}
                          maxHeightClassName="max-h-none"
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
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </>
  );
}
