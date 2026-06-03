import type { Plugin } from "@/api/plugins";

export type TabKey = "installed" | "available" | "tasks";
export type PluginViewMode = "cards" | "list";
export type PluginProcessingState = "installing" | "removing" | null;

export type PluginCategoryTab = {
  id: string;
  title: string;
  description?: string;
  count: number;
};

export type PluginWithCategories = {
  category?: unknown;
  categories?: unknown;
  categoryIds?: unknown;
  categoryData?: unknown;
};

export const fallbackCategoryById: Record<string, { title: string; description: string }> = {
  single_particle: {
    title: "SPA",
    description: "SPA processing, classification, refinement and reconstruction",
  },
  tomography: {
    title: "Tomography",
    description: "Tomograms, tilt series and subtomogram workflows",
  },
  modelling: {
    title: "Modelling",
    description: "Model building, fitting, validation and visualization",
  },
  flexibility: {
    title: "Flexibility",
    description: "Visualization and manipulation of flexibility data",
  },
  chem: {
    title: "CHEM",
    description: "CHEMoinformatics and virtual drug screening",
  },
  unclassified: {
    title: "Unclassified",
    description: "Unclassified plugins",
  },
};

export function classNames(...xs: Array<string | false | null | undefined>): string {
  return xs.filter(Boolean).join(" ");
}

export function formatTimeAgo(ms: number) {
  const diffMs = Date.now() - ms;
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 60) return `${sec} seg ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  return `${hr} hours ago`;
}

export function humanizeCategoryId(id: string): string {
  const fallback = fallbackCategoryById[id];
  if (fallback) return fallback.title;

  return id
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getFallbackCategoryDescription(id: string): string {
  return fallbackCategoryById[id]?.description ?? "";
}

export function normalizeCategoryId(raw: unknown): string {
  return String(raw ?? "").trim();
}

export function readCategoryMetaFromRaw(raw: unknown): Array<Omit<PluginCategoryTab, "count">> {
  if (!raw) return [];

  const items = Array.isArray(raw) ? raw : [raw];

  return items
    .map((item) => {
      if (typeof item === "string") {
        const id = normalizeCategoryId(item);
        if (!id) return null;

        return {
          id,
          title: humanizeCategoryId(id),
          description: getFallbackCategoryDescription(id),
        };
      }

      if (!item || typeof item !== "object") return null;

      const obj = item as Record<string, unknown>;
      const id = normalizeCategoryId(
        obj.id ?? obj.categoryId ?? obj.key ?? obj.value ?? obj.name,
      );

      if (!id) return null;

      return {
        id,
        title: String(obj.title ?? obj.label ?? obj.name ?? humanizeCategoryId(id)),
        description: String(obj.description ?? getFallbackCategoryDescription(id)),
      };
    })
    .filter(Boolean) as Array<Omit<PluginCategoryTab, "count">>;
}

export function getPluginCategoryMetadata(plugin: PluginWithCategories): Array<Omit<PluginCategoryTab, "count">> {
  const rawMetas = [
    ...readCategoryMetaFromRaw(plugin.categoryData),
    ...readCategoryMetaFromRaw(plugin.categories),
    ...readCategoryMetaFromRaw(plugin.categoryIds),
    ...readCategoryMetaFromRaw(plugin.category),
  ];

  const byId = new Map<string, Omit<PluginCategoryTab, "count">>();

  for (const meta of rawMetas) {
    if (!meta.id) continue;

    const current = byId.get(meta.id);
    byId.set(meta.id, {
      id: meta.id,
      title: meta.title || current?.title || humanizeCategoryId(meta.id),
      description: meta.description || current?.description || getFallbackCategoryDescription(meta.id),
    });
  }

  if (byId.size === 0) {
    byId.set("unclassified", {
      id: "unclassified",
      title: fallbackCategoryById.unclassified.title,
      description: fallbackCategoryById.unclassified.description,
    });
  }

  return Array.from(byId.values());
}

export function getPluginCategoryIds(plugin: PluginWithCategories): string[] {
  return getPluginCategoryMetadata(plugin).map((category) => category.id);
}

export function getTaskOperationLabel(operation: string): string {
  if (operation === "install-devel") return "Install devel";
  if (operation === "install") return "Install/Update";
  if (operation === "uninstall") return "Uninstall";
  return operation;
}

export function isDevelPlugin(plugin: Pick<Plugin, "devel" | "installMode">): boolean {
  return Boolean(plugin.devel || plugin.installMode === "devel");
}

export function isPluginProcessing(processingState: PluginProcessingState): boolean {
  return processingState === "installing" || processingState === "removing";
}

export function canBatchInstallPlugin(plugin: Plugin, processingState: PluginProcessingState): boolean {
  if (isPluginProcessing(processingState)) return false;
  if (isDevelPlugin(plugin)) return false;
  return !plugin.installed || Boolean(plugin.installed && plugin.toUpdate);
}

export function getPluginVersionLabel(plugin: Plugin): string {
  if (plugin.installed) return `Installed v${plugin.pipVersion ?? "-"}`;
  return `Latest v${plugin.latestRelease ?? "-"}`;
}

export function getPluginStatusLabel(plugin: Plugin, processingState: PluginProcessingState): string {
  if (processingState === "installing") return "Processing";
  if (processingState === "removing") return "Removing";
  if (plugin.installed && plugin.toUpdate) return "Update available";
  if (plugin.installed) return "Installed";
  return "Available";
}
