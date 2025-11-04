import { useNavigate } from "react-router-dom";
import { Plugin } from "../../api/plugins";
import { motion } from "framer-motion";

import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { UpdateIcon } from "@/icons";

export default function PluginCard(plugin: Plugin) {
  const navigate = useNavigate();

  const handleNavigate = async () => {
    navigate(`/plugins/${plugin.pipName}`, { state: { plugin } });
  };

  return (

    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <Card
        onClick={handleNavigate}
        className={`
    group relative flex flex-col rounded-2xl cursor-pointer w-80
    transition hover:scale-[1.01] hover:shadow-xl
    bg-gradient-to-br from-gray-100 via-gray-200 to-gray-300 dark:from-gray-800 dark:via-gray-700 dark:to-gray-900
    border border-transparent hover:border-blue-400
    ${plugin.installed && plugin.toUpdate ? " border-[#B22222]" : ""}
  `}
      >
        {/* Header */}
        <CardHeader className="flex items-start space-x-4">
          {/* Plugin Icon */}
          <div className="flex-shrink-0">
            <div className="h-10 w-20 flex items-center justify-center rounded-lg bg-white dark:bg-gray-700">
              <img
                src={plugin.fullLogo}
                alt={`${plugin.name} icon`}
                className="h-8 object-contain"
              />
            </div>
          </div>

          {/* Plugin Name and Version */}
          <div className="flex flex-col min-w-0">
            <div className="flex items-center space-x-2">
              <h3
                className="text-lg font-semibold text-gray-800 dark:text-gray-200 truncate"
                title={plugin.name}
              >
                {plugin.name}
              </h3>
            </div>
            <span className="mt-1 text-sm text-gray-500 dark:text-gray-400 ml-1">
              {plugin.installed ? `v${plugin.pipVersion}` : `v${plugin.latestRelease}`}
            </span>
          </div>
        </CardHeader>

        {/* Content */}
        <CardContent className="flex items-center justify-center">
          <span className="text-center text-base text-gray-700 dark:text-gray-300">
            {plugin.pipName}
          </span>
        </CardContent>

        {/* Footer */}
        <CardFooter className="flex justify-center items-center">
          {plugin.installed && plugin.toUpdate && (
            <span className="inline-flex items-center gap-2 rounded-full bg-yellow-500/90 text-black text-xs font-semibold px-3 py-1 shadow-sm">
              <UpdateIcon className="w-4 h-4" />
              v{plugin.latestRelease} Available
            </span>
          )}
        </CardFooter>
      </Card>
    </motion.div>
  );
}
