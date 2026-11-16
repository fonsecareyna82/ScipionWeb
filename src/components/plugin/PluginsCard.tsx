import { useNavigate } from "react-router-dom";
import PluginLogoImage from "@/components/plugin/PluginLogoImage";
import { motion } from "framer-motion";
import { Code2 } from "lucide-react";

import type { Plugin } from "../../api/plugins";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { UpdateIcon, ExecuteIcon } from "@/icons";

type PluginCardProps = Plugin & { processingState?: "installing" | "removing" | null };

function classNames(...xs: Array<string | false | null | undefined>): string {
  return xs.filter(Boolean).join(" ");
}

export default function PluginCard(plugin: PluginCardProps) {
  const navigate = useNavigate();

  const handleNavigate = () => {
    navigate(`/plugins/${plugin.pipName}`, { state: { plugin } });
  };

  const showUpdate = plugin.installed && plugin.toUpdate;
  const showProcessing = plugin.processingState === "installing" || plugin.processingState === "removing";
  const isInstalled = Boolean(plugin.installed);
  const isDevel = Boolean(plugin.devel || plugin.installMode === "devel");

  const tagClass = "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[13.5px] font-medium";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="h-full"
    >
      <Card
        onClick={handleNavigate}
        className={classNames(
          "group relative flex h-full min-h-[188px] cursor-pointer flex-col justify-center overflow-hidden rounded-[10px] border bg-white transition-[border-color,box-shadow] duration-200 dark:bg-gray-900",
          showUpdate
            ? "border-red-300 shadow-[0_1px_3px_rgba(15,23,42,0.08)] hover:border-red-400 hover:shadow-[0_6px_18px_rgba(15,23,42,0.12)] dark:border-red-800/80 dark:hover:border-red-600"
            : "border-gray-300 shadow-[0_1px_3px_rgba(15,23,42,0.08)] hover:border-gray-400 hover:shadow-[0_6px_18px_rgba(15,23,42,0.12)] dark:border-gray-700 dark:hover:border-gray-500",
        )}
      >
        {/* The logo in the top left corner; the texts in the middle of the card, the logo's width kept free on both sides */}
        <div className="absolute left-3 top-3 flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-[12px] border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            <PluginLogoImage
              src={plugin.fullLogo}
              alt={`${plugin.name} icon`}
              className="h-14 w-14 object-contain"
              fallback={(
                <span className="text-[18px] font-bold uppercase text-gray-500 dark:text-gray-300">
                  {(plugin.name ?? plugin.pipName ?? "?").slice(0, 2)}
                </span>
              )}
            />
        </div>

        <CardHeader className="flex flex-1 items-center justify-center gap-0 px-[92px] pb-0 text-center">
          <div className="min-w-0 w-full">
            <h3
              className="truncate text-[17px] font-semibold leading-6 text-gray-900 dark:text-white"
              title={plugin.name}
            >
              {plugin.name}
            </h3>
            <div className="truncate text-[14px] text-gray-500 dark:text-gray-400" title={plugin.pipName}>
              {plugin.pipName}
            </div>

            <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5">
              <span className={classNames(tagClass, "border-gray-300/80 bg-white text-gray-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200")}>
                {isInstalled ? `Installed v${plugin.pipVersion ?? "-"}` : `Latest v${plugin.latestRelease}`}
              </span>

              {showProcessing ? (
                <span className={classNames(tagClass, "border-sky-300/80 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-200")}>
                  <ExecuteIcon className="h-3.5 w-3.5 animate-spin" />
                  {plugin.processingState === "installing" ? "Processing" : "Removing"}
                </span>
              ) : null}

              {isDevel ? (
                <span
                  className={classNames(tagClass, "border-indigo-300/80 bg-indigo-50 text-indigo-800 dark:border-indigo-700/60 dark:bg-indigo-500/10 dark:text-indigo-200")}
                  title={plugin.localPath || "Local devel plugin"}
                >
                  <Code2 className="h-3.5 w-3.5" />
                  Devel
                </span>
              ) : null}

              {showUpdate ? (
                <span className={classNames(tagClass, "border-red-300/80 bg-red-50 text-red-700 dark:border-red-800/60 dark:bg-red-500/10 dark:text-red-200")}>
                  <UpdateIcon className="h-3.5 w-3.5" />
                  Update
                </span>
              ) : null}
            </div>
          </div>
        </CardHeader>

        {/* At the foot, out of the flow: the logo and the texts stay in the middle of the card */}
        <CardFooter className="absolute inset-x-0 bottom-3 flex items-center justify-center pt-0">
          {showUpdate ? (
            <span className="inline-flex items-center gap-1.5 text-[14px] font-medium text-red-700 dark:text-red-300">
              <UpdateIcon className="h-4 w-4" />
              v{plugin.latestRelease} available
            </span>
          ) : null}
        </CardFooter>
      </Card>
    </motion.div>
  );
}
