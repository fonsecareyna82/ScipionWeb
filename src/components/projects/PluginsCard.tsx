import { useNavigate } from "react-router-dom";
import { GridIcon, HorizontaLDots } from "../../icons";
import { installPlugin, Plugin, uninstallPlugin } from "../../api/plugins";
import { CardContent, CardHeader } from "@mui/material";

import { Card, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function PluginCard(plugin: Plugin) {
  const navigate = useNavigate();


  const handleNavigate = () => {
    navigate(`/plugin/${plugin.id}`);
  };

  const handleInstall = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await installPlugin(plugin.id);
  };

  const handleUninstall = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await uninstallPlugin(plugin.id);
  };

  return (
    <Card
      onClick={handleNavigate}
      className="
        group relative flex flex-col
        rounded-2xl cursor-pointer
        transition hover:-translate-y-1 hover:shadow-xl
      "
    >
      {/* Header */}
      <CardHeader className="flex flex-row items-center space-x-4">
        <div className="w-16 h-16 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 overflow-hidden">
          <img
            src={plugin.iconUrl}
            alt={`${plugin.name} icon`}
            onError={(e) => {
              (e.target as HTMLImageElement).src = "/icons/alert.svg"; // icono local de fallback
            }}
            className="w-full h-full object-contain rounded-xl"
          />
        </div>
        <div>
          <h3 className="text-lg md:text-xl font-semibold text-gray-800 dark:text-gray-200">
            {plugin.name}
          </h3>
          <span className="text-xs md:text-sm text-gray-500 dark:text-gray-400">
            v{plugin.version}
          </span>
        </div>
      </CardHeader>

      {/* Content */}
      <CardContent className="flex-1">
        <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
          {plugin.shortDescription}
        </p>
      </CardContent>

      {/* Footer */}
      <CardFooter className="flex items-center justify-between">
        {plugin.installed ? (
          <Button
            variant="destructive"
            size="sm"
            onClick={handleUninstall}
            className="rounded-xl"
          >
            Uninstall
          </Button>
        ) : (
          <Button
            variant="default"
            size="sm"
            onClick={handleInstall}
            className="bg-green-500 hover:bg-green-600 rounded-xl"
          >
            Install
          </Button>
        )}

        {/* Hover icons */}
        <div
          className="
            flex space-x-2
            opacity-0 group-hover:opacity-100
            transition absolute top-4 right-4
          "
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => { e.stopPropagation(); }}
            className="rounded-full"
          >
            <GridIcon className="w-4 h-4 text-gray-600 dark:text-gray-300" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => { e.stopPropagation(); }}
            className="rounded-full"
          >
            <HorizontaLDots className="w-4 h-4 text-gray-600 dark:text-gray-300" />
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
