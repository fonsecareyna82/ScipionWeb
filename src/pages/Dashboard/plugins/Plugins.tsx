// src/pages/projects/Plugins.tsx

import { useEffect, useState } from "react";
import PageBreadcrumb from "../../../components/common/PageBreadCrumb";
import PageMeta from "../../../components/common/PageMeta";
import { fetchPlugins, Plugin } from "../../../api/plugins";
import PluginCard from "../../../components/plugin/PluginsCard";
import CircularProgress from "@mui/material/CircularProgress";

export default function Plugins() {
  // estados
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"installed" | "available">(
    "available"
  );
  const [search, setSearch] = useState("");

  // fetch inicial
  useEffect(() => {
    setLoading(true);
    fetchPlugins()
      .then((data) => setPlugins(data))
      .catch((err) => {
        console.error(err);
        setError("Failed to load plugins");
      })
      .finally(() => setLoading(false));
  }, []);

  // filtrado por pestaña
  const installedPlugins = plugins.filter((p) => p.installed);
  const availablePlugins = plugins.filter((p) => !p.installed);
  const displayedPlugins =
    activeTab === "installed" ? installedPlugins : availablePlugins;

  // filtrado por búsqueda (name o pipName)
  const filteredPlugins = displayedPlugins.filter((p) => {
    const term = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(term) ||
      p.pipName.toLowerCase().includes(term)
    );
  });

  return (
    <>
      <PageMeta title="Scipion | Plugins" description="Plugins page" />
      <PageBreadcrumb pageTitle="Plugins" />

      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        {/* Dinamyc title */}
        <h3 className="mb-5 text-lg font-semibold text-gray-800 dark:text-white/90 lg:mb-7">
          {loading ? "Loading plugins..." : error ? "Error" : ""}
        </h3>

        {loading ? (
          <div className="flex justify-center items-center py-8">
            <CircularProgress />
          </div>
        ) : error ? (
          <p className="text-center text-red-500">{error}</p>
        ) : (
          <>
            {/* tabs */}
            <div className="flex space-x-2 mb-4">
              <button
                onClick={() => setActiveTab("installed")}
                className={`px-4 py-2 rounded ${activeTab === "installed"
                    ? "bg-blue-500 text-white"
                    : "bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
                  }`}
              >
                Installed ({installedPlugins.length})
              </button>
              <button
                onClick={() => setActiveTab("available")}
                className={`px-4 py-2 rounded ${activeTab === "available"
                    ? "bg-blue-500 text-white"
                    : "bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
                  }`}
              >
                Available ({availablePlugins.length})
              </button>
            </div>

            {/* Search field */}
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
                placeholder="Search plugin..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-3 py-2 pl-10 pr-3 border border-gray-300 rounded-md 
                           focus:outline-none focus:ring-2 focus:ring-blue-500 
                           dark:bg-gray-800 dark:border-gray-700 dark:text-white"
              />
            </div>

            {/* cards grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
              {filteredPlugins.map((plugin) => (
                <PluginCard key={plugin.name} {...plugin} />
              ))}
              {filteredPlugins.length === 0 && (
                <p className="col-span-full text-center text-gray-500">
                  No plugins found.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
