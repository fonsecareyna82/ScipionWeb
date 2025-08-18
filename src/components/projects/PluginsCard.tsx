import { useNavigate } from "react-router-dom";
import { Plugin } from "../../api/plugins";

import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";

export default function PluginCard(plugin: Plugin) {
  const navigate = useNavigate();


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
      {/* Header */}
      <CardHeader className="flex items-start space-x-4">
        {/* Icono a la izquierda */}
        <div className="flex-shrink-0">
          <img
            src={plugin.iconUrl}
            alt={`${plugin.name} icon`}
            className="w-20 h-10 object-contain bg-gray-100 dark:bg-gray-800"
          />
        </div>

        {/* Nombre arriba, versión abajo */}
        <div className="flex flex-col">
          <h3 className="text-2xl font-semibold text-gray-800 dark:text-gray-200">
            {plugin.name}
          </h3>
          <span className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            v{plugin.latestRelease}
          </span>
        </div>
      </CardHeader>

      {/* Content */}
      <CardContent className="flex items-center justify-center">
        <span className="text-center text-xl">
          {plugin.pipName}
        </span>
      </CardContent>

      {/* Footer */}
      <CardFooter>

      </CardFooter>
    </Card>
  );
}
