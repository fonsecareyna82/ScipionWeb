import { useEffect, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { fetchPlugins, Plugin } from "../../api/plugins";
import PluginCard from "../../components/projects/PluginsCard";
import CircularProgress from "@mui/material/CircularProgress"; // ← MUI spinner

export default function Plugins() {
  // State for the list of plugins
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  // Loading flag to show spinner
  const [loading, setLoading] = useState<boolean>(true);
  // Error message state
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);

    fetchPlugins()
      .then((data) => {
        setPlugins(data);
      })
      .catch((err) => {
        console.error(err);
        setError("Failed to load plugins");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  return (
    <>
      <PageMeta title="Plugins" description="Plugins page" />
      <PageBreadcrumb pageTitle="Plugins" />

      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <h3 className="mb-5 text-lg font-semibold text-gray-800 dark:text-white/90 lg:mb-7">
          {loading
            ? "Loading plugins..."
            : error
            ? "Error"
            : ""}
        </h3>

        {loading ? (
          // Display a centered MUI spinner while fetching data
          <div className="flex justify-center items-center py-8">
            <CircularProgress />
          </div>
        ) : error ? (
          // Display error message if fetch failed
          <p className="text-center text-red-500">{error}</p>
        ) : (
          // Render the grid of PluginCard once plugins are loaded
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 ml-1">
            {plugins.map((plugin) => (
              <PluginCard
                key={plugin.name}
                name={plugin.name}
                latestRelease={plugin.latestRelease}
                icon={plugin.icon}
                iconUrl={plugin.fullLogo}
                summary={plugin.summary}
                installed={plugin.installed}
                author={plugin.author}
                binVersions={plugin.binVersions}
                compatibleReleases={plugin.compatibleReleases}
                dirName={plugin.dirName}
                email={plugin.email}
                homePage={plugin.homePage}
                pipName={plugin.pipName}
                pipVersion={plugin.pipVersion}
                pluginEnv={plugin.pluginEnv}
                pluginSourceUrl={plugin.pluginSourceUrl}
                remote={plugin.remote}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
