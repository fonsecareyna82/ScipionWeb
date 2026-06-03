import { useNavigate } from "react-router-dom";
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="h-full"
    >
      <Card
        onClick={handleNavigate}
        className={classNames(
          "group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl border shadow-sm backdrop-blur transition duration-200",
          showUpdate
            ? "border-red-500/80 bg-gradient-to-br from-red-50 via-white to-rose-50 hover:-translate-y-0.5 hover:border-red-600 hover:shadow-md hover:ring-2 hover:ring-red-200/70 dark:border-red-700/70 dark:bg-gradient-to-br dark:from-red-950/25 dark:via-slate-900 dark:to-rose-950/20 dark:hover:border-red-500 dark:hover:ring-red-500/10"
            : isDevel
              ? "border-indigo-400/80 bg-gradient-to-br from-indigo-50 via-white to-cyan-50 hover:-translate-y-0.5 hover:border-indigo-500 hover:shadow-md hover:ring-2 hover:ring-indigo-200/70 dark:border-indigo-700/70 dark:bg-gradient-to-br dark:from-indigo-950/25 dark:via-slate-900 dark:to-cyan-950/20 dark:hover:border-indigo-500 dark:hover:ring-indigo-500/10"
              : "border-slate-200/80 bg-gradient-to-br from-white via-slate-50 to-slate-100 hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-md hover:ring-2 hover:ring-slate-200/70 dark:border-slate-800/80 dark:bg-gradient-to-br dark:from-slate-900 dark:via-slate-950 dark:to-black dark:hover:border-slate-600 dark:hover:ring-white/[0.06]",
        )}
      >
        <div className="absolute right-3 top-3 z-10 flex flex-wrap items-center justify-end gap-2">
          {showProcessing ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-gray-200/70 bg-white/90 px-3 py-1 text-[11px] font-semibold text-gray-800 shadow-sm dark:border-gray-700/70 dark:bg-white/[0.08] dark:text-gray-200">
              <ExecuteIcon className="h-3.5 w-3.5 animate-spin" />
              {plugin.processingState === "installing" ? "Processing" : "Removing"}
            </span>
          ) : null}

          {isDevel ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-300/80 bg-indigo-50 px-3 py-1 text-[11px] font-semibold text-indigo-800 shadow-sm dark:border-indigo-700/60 dark:bg-indigo-500/10 dark:text-indigo-200">
              <Code2 className="h-3.5 w-3.5" />
              Devel
            </span>
          ) : null}

          {showUpdate ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-red-300/80 bg-red-50 px-3 py-1 text-[11px] font-semibold text-red-800 shadow-sm dark:border-red-700/60 dark:bg-red-500/10 dark:text-red-200">
              <UpdateIcon className="h-3.5 w-3.5" />
              Update
            </span>
          ) : null}
        </div>

        <CardHeader className="flex items-start gap-4 pb-3 pr-24">
          <div className="shrink-0">
            <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border border-gray-200/70 bg-white shadow-sm dark:border-gray-800/80 dark:bg-white/[0.04]">
              {plugin.fullLogo ? (
                <img
                  src={plugin.fullLogo}
                  alt={`${plugin.name} icon`}
                  className="h-10 w-10 object-contain"
                />
              ) : (
                <span className="text-sm font-bold uppercase text-gray-500 dark:text-gray-300">
                  {(plugin.name ?? plugin.pipName ?? "?").slice(0, 2)}
                </span>
              )}
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <h3
              className="truncate text-base font-semibold text-gray-900 dark:text-white/90"
              title={plugin.name}
            >
              {plugin.name}
            </h3>

            <div
              className="mt-1 truncate text-xs font-medium text-gray-500 dark:text-gray-400"
              title={plugin.pipName}
            >
              {plugin.pipName}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-gray-200/70 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-gray-700 dark:border-gray-800/80 dark:bg-white/[0.03] dark:text-gray-200">
                {isInstalled ? `Installed v${plugin.pipVersion ?? "-"}` : `Latest v${plugin.latestRelease}`}
              </span>

              {isDevel ? (
                <span
                  className="inline-flex max-w-full items-center rounded-full border border-indigo-200/80 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-800 dark:border-indigo-800/60 dark:bg-indigo-500/10 dark:text-indigo-200"
                  title={plugin.localPath || "Local devel plugin"}
                >
                  Local source
                </span>
              ) : null}
            </div>
          </div>
        </CardHeader>

        <CardFooter className="mt-auto flex items-center justify-center pt-0">
          {showUpdate ? (
            <span className="inline-flex items-center gap-2 rounded-xl border border-red-300/80 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800 dark:border-red-700/60 dark:bg-red-500/10 dark:text-red-200">
              <UpdateIcon className="h-4 w-4" />
              v{plugin.latestRelease} available
            </span>
          ) : (
            <span className="inline-flex items-center rounded-xl border border-gray-200/70 bg-white/70 px-3 py-2 text-xs font-semibold text-gray-700 dark:border-gray-800/80 dark:bg-white/[0.02] dark:text-gray-200">
              View details
            </span>
          )}
        </CardFooter>
      </Card>
    </motion.div>
  );
}
