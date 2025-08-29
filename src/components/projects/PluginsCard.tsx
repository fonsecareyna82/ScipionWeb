import { useNavigate } from "react-router-dom";
import { Plugin } from "../../api/plugins";

import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { RefreshIcon, UpdateIcon } from "@/icons";

export default function PluginCard(plugin: Plugin) {
  const navigate = useNavigate();

  // Handle navigation to plugin detail page
  const handleNavigate = async () => {
    navigate(`/plugins/${plugin.pipName}`, { state: { plugin } });
  };

  return (
    <Card
      onClick={handleNavigate}
      className="
        group relative flex flex-col
        rounded-2xl cursor-pointer
        w-80
        bg-gray-100
        transition hover:-translate-y-1 hover:shadow-xl
        bg-gray-200 dark:bg-gray-800
      "
    >
      {/* Card Header */}
      <CardHeader className="flex items-start space-x-4">
        {/* Plugin Icon */}
        <div className="flex-shrink-0">
          <img
            src={plugin.fullLogo}
            alt={`${plugin.name} icon`}
            className="w-20 h-10 object-contain bg-gray-200 dark:bg-gray-800"
          />
        </div>

        {/* Plugin Name and Version */}
        <div className="flex flex-col">
          <div className="flex items-center space-x-2">
            <h3 className="text-2xl font-semibold text-gray-800 dark:text-gray-200">
              {plugin.name}
            </h3>

          </div>
          <span className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {plugin.installed && (
            <span>  
                v{plugin.pipVersion}
            </span>
          )}
          {!plugin.installed && (
            <span>  
                v{plugin.latestRelease}
            </span>
          )}
            
          </span>
        </div>
      </CardHeader>

      {/* Card Content */}
      <CardContent className="flex items-center justify-center">
        <span className="text-center text-xl">
          {plugin.pipName}
        </span>
      </CardContent>

      {/* Card Footer */}
      <CardFooter className="flex justify-center items-center">
        {/* Show label if plugin is installed and a newer release is available */}
        {plugin.installed && plugin.pipVersion !== plugin.latestRelease && (
          <span
            className="inline-flex items-center justify-center rounded-full bg-yellow-500 text-black text-sm font-bold px-2 py-1"
          >
           <UpdateIcon className="mr-1"/> v{plugin.latestRelease} Available
          </span>
        )}
      </CardFooter>
    </Card>
  );
}
