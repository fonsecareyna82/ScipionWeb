import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

import type { Plugin } from "../../api/plugins";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { UpdateIcon } from "@/icons";

type PluginCardProps = Plugin & { processingState?: "installing" | "removing" | null };

export default function PluginCard(plugin: PluginCardProps) {
  const navigate = useNavigate();

  const handleNavigate = () => {
    navigate(`/plugins/${plugin.pipName}`, { state: { plugin } });
  };

  const showUpdate = plugin.installed && plugin.toUpdate;
  const showProcessing = plugin.processingState === "installing" || plugin.processingState === "removing";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="h-full"
    >
      <Card
        onClick={handleNavigate}
        className={`
          group relative flex flex-col rounded-2xl cursor-pointer
          transition hover:scale-[1.01] hover:shadow-xl
          bg-gradient-to-br from-gray-100 via-gray-200 to-gray-300 dark:from-gray-800 dark:via-gray-700 dark:to-gray-900
          border border-transparent hover:border-blue-400
          ${showUpdate ? " border-[#B22222]" : ""}
        `}
      >
        {showProcessing && (
          <div className="absolute top-3 right-3 z-10">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/80 dark:bg-white/10 px-3 py-1 text-xs font-semibold text-gray-800 dark:text-gray-200 shadow-sm">
              <span className="h-3 w-3 rounded-full border-2 border-gray-400 border-t-transparent animate-spin" />
              {plugin.processingState === "installing" ? "Processing" : "Removing"}
            </span>
          </div>
        )}

        <CardHeader className="flex items-start space-x-4">
          <div className="flex-shrink-0">
            <div className="h-10 w-20 flex items-center justify-center rounded-lg bg-white dark:bg-gray-700">
              <img src={plugin.fullLogo} alt={`${plugin.name} icon`} className="h-8 object-contain" />
            </div>
          </div>

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

        <CardContent className="flex items-center justify-center">
          <span className="text-center text-base text-gray-700 dark:text-gray-300">{plugin.pipName}</span>
        </CardContent>

        <CardFooter className="flex justify-center items-center">
          {showUpdate && (
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