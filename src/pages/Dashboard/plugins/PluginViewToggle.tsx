import { Grid3X3, List } from "lucide-react";

import { classNames, type PluginViewMode } from "./plugin_helpers";

type PluginViewToggleProps = {
  viewMode: PluginViewMode;
  onViewModeChange: (mode: PluginViewMode) => void;
};

export default function PluginViewToggle({ viewMode, onViewModeChange }: PluginViewToggleProps) {
  return (



    <div className="inline-flex rounded-xl border border-gray-300/80 bg-white/70 p-1 dark:border-gray-700/80 dark:bg-white/[0.02]">
      <div className="mr-2 flex items-center gap-2 px-2  text-xs  text-gray-700 dark:text-gray-200">
        <span className="pp-viewLabel">View modes</span>
        <button
          type="button"
          onClick={() => onViewModeChange("cards")}
          className={classNames(
            "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition",
            viewMode === "cards"
              ? "bg-[#333d49] text-white shadow-sm"
              : "text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/[0.04]",
          )}
        >
          <Grid3X3 className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => onViewModeChange("list")}
          className={classNames(
            "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition",
            viewMode === "list"
              ? "bg-[#333d49] text-white shadow-sm"
              : "text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/[0.04]",
          )}
        >
          <List className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
