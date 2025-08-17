import { useEffect, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { fetchPlugins, Plugin } from "../../api/plugins";
import PluginCard from "../../components/projects/PluginsCard";

export default function Plugins() {

  const [plugins, setPlugins] = useState<Plugin[]>([]);
  
    useEffect(() => {
      fetchPlugins()
        .then(setPlugins)
        .catch(err => console.error(err));
    }, []);
  
    return (
      <>
        <PageMeta
          title="Plugins"
          description="Plugins page"
        />
        <PageBreadcrumb pageTitle="Plugins" />
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
          <h3 className="mb-5 text-lg font-semibold text-gray-800 dark:text-white/90 lg:mb-7">
            
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                    {plugins.map(plugin => (
                      <PluginCard
                        key={plugin.id}
                        id={plugin.id}
                        name={plugin.name}
                        version={plugin.version}
                        icon={plugin.icon}
                        iconUrl={plugin.icon}
                        shortDescription={plugin.shortDescription}
                        installed={plugin.installed}
                      />
                    ))}
                  </div>
          
        </div>
      </>
    );
  }