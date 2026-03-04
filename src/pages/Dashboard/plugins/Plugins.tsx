// src/pages/projects/Plugins.tsx
import { useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "../../../components/common/PageBreadCrumb";
import PageMeta from "../../../components/common/PageMeta";
import PluginCard from "../../../components/plugin/PluginsCard";
import { usePlugins } from "@/hooks/usePlugins";
import { useProcessingPlugins } from "@/hooks/useProcessingPlugins";

type TabKey = "installed" | "available" | "tasks";

function formatTimeAgo(ms: number) {
  const diffMs = Date.now() - ms;
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

export default function Plugins() {
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
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (tasksCount === 0) {
      void refetch();
    }
  }, [tasksCount, refetch]);

  const installedPlugins = useMemo(() => plugins.filter((p) => p.installed), [plugins]);
  const availablePlugins = useMemo(() => plugins.filter((p) => !p.installed), [plugins]);

  const displayedPlugins = useMemo(() => {
    if (activeTab === "installed") return installedPlugins;
    if (activeTab === "available") return availablePlugins;
    return [];
  }, [activeTab, installedPlugins, availablePlugins]);

  const filteredPlugins = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return displayedPlugins;

    return displayedPlugins.filter((p) => {
      const name = (p.name ?? "").toLowerCase();
      const pipName = (p.pipName ?? "").toLowerCase();
      return name.includes(term) || pipName.includes(term);
    });
  }, [displayedPlugins, search]);

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

  return (
    <>
      <PageMeta title="Scipion | Plugins" description="Plugins page" />
      <PageBreadcrumb pageTitle="Plugins" />

      <div className="relative rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <h3 className="mb-5 text-lg font-semibold text-gray-800 dark:text-white/90 lg:mb-7">
          {loading ? "" : error ? "Error" : ""}
        </h3>

        {loading && (
          <div
            role="status"
            aria-live="polite"
            className="absolute inset-0 z-[80] flex flex-col items-center justify-center bg-white/75 dark:bg-gray-900/75 backdrop-blur-[2px]"
            style={{ pointerEvents: "auto" }}
          >
            <div className="relative">
              <div className="w-8 h-8 rounded-full border-2 border-gray-300" />
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-gray-700 animate-spin" />
            </div>
            <p className="mt-3 text-xs tracking-wide text-gray-700 dark:text-gray-200">
              Loading <span className="font-medium">Plugins</span>…
            </p>
          </div>
        )}

        {!loading && (
          <>
            {error ? (
              <p className="text-center text-red-500">{error}</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <button
                    onClick={() => setActiveTab("installed")}
                    className={[
                      "px-4 py-2 rounded",
                      activeTab === "installed"
                        ? "bg-blue-500 text-white"
                        : "bg-gray-200 dark:bg-gray-700 dark:text-gray-300",
                    ].join(" ")}
                  >
                    Installed ({installedPlugins.length})
                  </button>

                  <button
                    onClick={() => setActiveTab("available")}
                    className={[
                      "px-4 py-2 rounded",
                      activeTab === "available"
                        ? "bg-blue-500 text-white"
                        : "bg-gray-200 dark:bg-gray-700 dark:text-gray-300",
                    ].join(" ")}
                  >
                    Available ({availablePlugins.length})
                  </button>

                  <button
                    onClick={() => setActiveTab("tasks")}
                    className={[
                      "px-4 py-2 rounded",
                      activeTab === "tasks"
                        ? "bg-blue-500 text-white"
                        : "bg-gray-200 dark:bg-gray-700 dark:text-gray-300",
                    ].join(" ")}
                  >
                    Tasks ({tasksCount})
                  </button>
                </div>

                <div className="relative mb-6 w-full max-w-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 text-gray-400 dark:text-gray-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  </div>
                  <input
                    type="text"
                    placeholder={activeTab === "tasks" ? "Search task..." : "Search plugin..."}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full px-3 py-2 pl-10 pr-3 border border-gray-300 rounded-md
                               focus:outline-none focus:ring-2 focus:ring-blue-500
                               dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                  />
                </div>

                {activeTab === "tasks" ? (
                  <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-white/[0.04]">
                        <tr>
                          <th className="text-left px-4 py-3 font-semibold text-gray-700 dark:text-gray-200">
                            Plugin
                          </th>
                          <th className="text-left px-4 py-3 font-semibold text-gray-700 dark:text-gray-200">
                            Operation
                          </th>
                          <th className="text-left px-4 py-3 font-semibold text-gray-700 dark:text-gray-200">
                            Status
                          </th>
                          <th className="text-left px-4 py-3 font-semibold text-gray-700 dark:text-gray-200">
                            Updated
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTasks.map((t) => (
                          <tr key={t.taskId} className="border-t border-gray-200 dark:border-gray-800">
                            <td className="px-4 py-3 text-gray-800 dark:text-gray-200">
                              <div className="font-medium">{t.pluginName ?? t.pipName}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">{t.pipName}</div>
                            </td>

                            <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                              {t.operation === "install" ? "Install/Update" : "Uninstall"}
                            </td>

                            <td className="px-4 py-3">
                              <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold bg-gray-100 text-gray-800 dark:bg-white/10 dark:text-gray-200">
                                {(t.status === "PENDING" || t.status === "STARTED") && (
                                  <span className="h-3 w-3 rounded-full border-2 border-gray-400 border-t-transparent animate-spin" />
                                )}
                                {t.status}
                              </span>

                              {t.step ? (
                                <div className="mt-1 text-xs text-gray-600 dark:text-gray-400 break-all">
                                  {t.step}
                                </div>
                              ) : null}

                              {t.error ? (
                                <div className="mt-1 text-xs text-red-500 break-all">{t.error}</div>
                              ) : null}
                            </td>

                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                              {formatTimeAgo(t.updatedAtMs)}
                            </td>
                          </tr>
                        ))}

                        {filteredTasks.length === 0 && (
                          <tr>
                            <td className="px-4 py-8 text-center text-gray-500 dark:text-gray-400" colSpan={4}>
                              No active tasks.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-5 gap-4">
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
                      <p className="col-span-full text-center text-gray-500">No plugins found.</p>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}