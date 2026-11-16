import { Grid3X3, List } from "lucide-react";

import { classNames, type PluginViewMode } from "./plugin_helpers";

type PluginViewToggleProps = {
  viewMode: PluginViewMode;
  onViewModeChange: (mode: PluginViewMode) => void;
};

export default function PluginViewToggle({ viewMode, onViewModeChange }: PluginViewToggleProps) {
  return (
    <div
      role="group"
      aria-label="Plugins view mode"
      className="inline-flex shrink-0 rounded-[10px] border border-gray-300/85 bg-gray-50 p-0.5 dark:border-gray-700 dark:bg-gray-800/60"
    >
      {([
        ["cards", Grid3X3, "Cards"],
        ["list", List, "List"],
      ] as const).map(([mode, Icon, title]) => (
        <button
          key={mode}
          type="button"
          title={title}
          aria-label={`${title} view`}
          aria-pressed={viewMode === mode}
          onClick={() => onViewModeChange(mode)}
          className={classNames(
            "inline-flex h-9 w-10 items-center justify-center rounded-lg transition",
            viewMode === mode
              ? "bg-white text-gray-900 shadow-sm ring-1 ring-gray-300/80 dark:bg-gray-700 dark:text-white dark:ring-gray-600"
              : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200",
          )}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}
