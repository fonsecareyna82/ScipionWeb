import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckSquare2,
  Columns3,
  Copy,
  CopyPlus,
  FolderOpen,
  Layers3,
  MoreHorizontal,
  Pencil,
  Play,
  RefreshCw,
  RotateCcw,
  Rows3,
  Scan,
  Square,
  Tags,
  Trash2,
  X,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { ProtocolTag } from "@/components/tags/tagTypes";
import type { NodeMenuVisibility } from "@/types/protocol-node-menu-items";

import "./ProjectProtocolTable.css";

export type ProjectProtocolTableRow = {
  id: string;

  label?: string;
  title?: string;
  runName?: string;
  comment?: string;
  status?: string;

  parents?: string[];
  children?: string[];

  inputs?: unknown[];
  outputs?: unknown[];

  tagIds?: unknown;
  tags?: unknown;

  cpuTime?: string;
  elapsedTime?: string | number;
  tick?: number;

  stepsDone?: number;
  numberOfSteps?: number;
};

export type ProjectProtocolTableHandle = {
  scrollToProtocol: (
    protocolId: string,
  ) => boolean;

  scrollToFirstVisible: () => boolean;
};

type ColumnId =
  | "id"
  | "protocol"
  | "state"
  | "tags"
  | "elapsed"
  | "inputs"
  | "outputs"
  | "dependent"
  | "actions";

type SortableColumnId =
  Exclude<
    ColumnId,
    "actions"
  >;

type SortDirection =
  | "asc"
  | "desc";

type SortRule = {
  key: SortableColumnId;
  direction: SortDirection;
};

type TableDensity =
  | "comfortable"
  | "compact";

type TableGroupBy =
  | "none"
  | "state"
  | "tag";

type TableSettings = {
  version: 1;

  visible: Record<
    ColumnId,
    boolean
  >;

  widths: Record<
    ColumnId,
    number
  >;

  sorts: SortRule[];

  density: TableDensity;

  groupBy: TableGroupBy;

  stateFilter: string;
};

type ColumnDefinition = {
  id: ColumnId;
  label: string;
  sortable: boolean;
  mandatory?: boolean;
  defaultVisible: boolean;
  defaultWidth: number;
  minWidth: number;
};

type Props = {
  projectStorageKey: string;

  rows: ProjectProtocolTableRow[];

  allTags: ProtocolTag[];

  tagAssignments: Record<
    string,
    string[]
  >;

  externalTagFilterIds: string[];

  searchQuery: string;

  highlightedId:
    | string
    | null;

  selectedIds: string[];

  isRefreshing: boolean;

  contextMenuVisibility?: NodeMenuVisibility;

  onRefresh: () => void;

  onActivate: (
    protocolId: string,
  ) => void;

  onOpen: (
    protocolId: string,
  ) => void;

  onBrowse: (
    protocolId: string,
    protocolLabel: string,
  ) => void;

  onAnnotate: (
    protocolId: string,
  ) => void;

  onDuplicate: (
    protocolIds: string[],
  ) => void;

  onCopyWorkflow: (
    protocolIds: string[],
  ) => void;

  onDelete: (
    protocolIds: string[],
  ) => void;

  onRestartAll: (
    protocolId: string,
  ) => void;

  onContinueAll: (
    protocolId: string,
  ) => void;

  onResetFrom: (
    protocolId: string,
  ) => void;

  onStop: (
    protocolIds: string[],
  ) => void;

  onSelectFrom: (
    protocolId: string,
  ) => void;

  onSelectTo: (
    protocolId: string,
  ) => void;

  onSelectionChange: (
    protocolIds: string[],
  ) => void;

  onToggleTag: (
    protocolIds: string[],
    tagId: string,
    enabled: boolean,
  ) => void | Promise<void>;

  onManageTags: () => void;
};

const SELECT_COLUMN_WIDTH = 44;

const HEADER_HEIGHT = 42;

const VIRTUALIZE_AFTER_ROWS = 250;

const VIRTUAL_OVERSCAN = 12;

const STATUS_PRIORITY = [
  "running",
  "failed",
  "aborted",
  "scheduled",
  "launched",
  "saved",
  "finished",
  "new",
];

const LIVE_STATUSES =
  new Set([
    "running",
    "launched",
    "scheduled",
  ]);

const COLUMN_DEFINITIONS: ColumnDefinition[] = [
  {
    id: "id",
    label: "Id",
    sortable: true,
    mandatory: true,
    defaultVisible: true,
    defaultWidth: 86,
    minWidth: 70,
  },
  {
    id: "protocol",
    label: "Protocol",
    sortable: true,
    mandatory: true,
    defaultVisible: true,
    defaultWidth: 300,
    minWidth: 180,
  },
  {
    id: "state",
    label: "State",
    sortable: true,
    defaultVisible: true,
    defaultWidth: 210,
    minWidth: 155,
  },
  {
    id: "tags",
    label: "Tags",
    sortable: true,
    defaultVisible: true,
    defaultWidth: 220,
    minWidth: 130,
  },
  {
    id: "elapsed",
    label: "Elapsed",
    sortable: true,
    defaultVisible: true,
    defaultWidth: 140,
    minWidth: 105,
  },
  {
    id: "inputs",
    label: "Inputs",
    sortable: true,
    defaultVisible: true,
    defaultWidth: 150,
    minWidth: 100,
  },
  {
    id: "outputs",
    label: "Outputs",
    sortable: true,
    defaultVisible: true,
    defaultWidth: 160,
    minWidth: 100,
  },
  {
    id: "dependent",
    label: "Dependent",
    sortable: true,
    defaultVisible: true,
    defaultWidth: 170,
    minWidth: 110,
  },
  {
    id: "actions",
    label: "",
    sortable: false,
    defaultVisible: true,
    defaultWidth: 62,
    minWidth: 52,
  },
];

function createDefaultSettings(): TableSettings {
  const visible =
    {} as Record<
      ColumnId,
      boolean
    >;

  const widths =
    {} as Record<
      ColumnId,
      number
    >;

  for (
    const column
    of COLUMN_DEFINITIONS
  ) {
    visible[column.id] =
      column.defaultVisible;

    widths[column.id] =
      column.defaultWidth;
  }

  return {
    version: 1,
    visible,
    widths,
    sorts: [
      {
        key: "id",
        direction: "desc",
      },
    ],
    density: "comfortable",
    groupBy: "none",
    stateFilter: "all",
  };
}

function readSettings(
  storageKey: string,
): TableSettings {
  const defaults =
    createDefaultSettings();

  if (
    typeof window ===
    "undefined"
  ) {
    return defaults;
  }

  try {
    const raw =
      window.localStorage.getItem(
        storageKey,
      );

    if (!raw) {
      return defaults;
    }

    const parsed =
      JSON.parse(raw);

    if (
      !parsed ||
      parsed.version !== 1
    ) {
      return defaults;
    }

    const validSortableIds =
      new Set(
        COLUMN_DEFINITIONS
          .filter(
            (column) =>
              column.sortable,
          )
          .map(
            (column) =>
              column.id,
          ),
      );

    const sorts =
      Array.isArray(
        parsed.sorts,
      )
        ? parsed.sorts
          .filter(
            (rule: any) =>
              validSortableIds.has(
                rule?.key,
              ) &&
              (
                rule?.direction ===
                "asc" ||
                rule?.direction ===
                "desc"
              ),
          )
          .map(
            (rule: any) => ({
              key:
                rule.key as
                SortableColumnId,

              direction:
                rule.direction as
                SortDirection,
            }),
          )
        : defaults.sorts;

    return {
      ...defaults,

      visible: {
        ...defaults.visible,
        ...(parsed.visible ?? {}),
      },

      widths: {
        ...defaults.widths,
        ...(parsed.widths ?? {}),
      },

      sorts:
        sorts.length
          ? sorts
          : defaults.sorts,

      density:
        parsed.density ===
        "compact"
          ? "compact"
          : "comfortable",

      groupBy:
        parsed.groupBy ===
          "state" ||
        parsed.groupBy ===
          "tag"
          ? parsed.groupBy
          : "none",

      stateFilter:
        typeof parsed.stateFilter ===
        "string"
          ? parsed.stateFilter
          : "all",
    };
  } catch {
    return defaults;
  }
}

function normalizeIds(
  raw: unknown,
): string[] {
  if (!raw) {
    return [];
  }

  const values =
    Array.isArray(raw)
      ? raw
      : [raw];

  const ids =
    values
      .map((value) => {
        if (
          typeof value ===
          "string"
        ) {
          return value;
        }

        if (
          value &&
          typeof value ===
          "object"
        ) {
          const id =
            (
              value as
              Record<
                string,
                unknown
              >
            ).id;

          if (
            typeof id ===
            "string"
          ) {
            return id;
          }
        }

        return "";
      })
      .map(
        (value) =>
          value.trim(),
      )
      .filter(Boolean);

  return Array.from(
    new Set(ids),
  );
}

function getProtocolDisplayName(
  row: ProjectProtocolTableRow,
): string {
  const runName =
    String(
      row.runName ?? "",
    ).trim();

  if (runName) {
    return runName;
  }

  const label =
    String(
      row.label ?? "",
    ).trim();

  if (label) {
    return label;
  }

  return String(
    row.id ?? "",
  );
}

function normalizeStatus(
  status: unknown,
): string {
  return String(
    status ?? "",
  )
    .trim()
    .toLowerCase();
}

function getStatusLabel(
  status: unknown,
): string {
  const value =
    normalizeStatus(status);

  if (!value) {
    return "Unknown";
  }

  return (
    value.charAt(0).toUpperCase() +
    value.slice(1)
  );
}

function getStatusBackground(
  status: unknown,
): string {
  const colors:
    Record<string, string> = {
      running: "#FCCE62",
      saved: "#D9F1FA",
      launched: "#D9F1FA",
      finished: "#D2F5CB",
      failed: "#F5CCCB",
      aborted: "#F5CCCB",
      interactive: "#f7f3bf",
      scheduled: "#f7f3bf",
      new: "#1E90FF",
    };

  return (
    colors[
    normalizeStatus(status)
    ] ??
    "#e5e7eb"
  );
}

function formatElapsed(
  secondsValue: unknown,
): string {
  const seconds =
    Number(secondsValue);

  const safeSeconds =
    Number.isFinite(seconds)
      ? Math.max(
        0,
        seconds,
      )
      : 0;

  const hours =
    Math.floor(
      safeSeconds / 3600,
    );

  const minutes =
    Math.floor(
      (
        safeSeconds % 3600
      ) / 60,
    );

  const secondsPart =
    Math.floor(
      safeSeconds % 60,
    );

  const pad =
    (value: number) =>
      value
        .toString()
        .padStart(
          2,
          "0",
        );

  return (
    `${pad(hours)}h:` +
    `${pad(minutes)}m:` +
    `${pad(secondsPart)}s`
  );
}

function compareText(
  left: unknown,
  right: unknown,
): number {
  return String(
    left ?? "",
  ).localeCompare(
    String(
      right ?? "",
    ),
    undefined,
    {
      numeric: true,
      sensitivity: "base",
    },
  );
}

function getIoRecord(
  raw: unknown,
):
  | Record<string, unknown>
  | null {
  if (
    !raw ||
    typeof raw !==
    "object"
  ) {
    return null;
  }

  const record =
    raw as Record<
      string,
      unknown
    >;

  if (
    "name" in record ||
    "outputName" in record ||
    "pointerClass" in record ||
    "paramClass" in record
  ) {
    return record;
  }

  const entries =
    Object.entries(record);

  if (
    entries.length === 1 &&
    entries[0][1] &&
    typeof entries[0][1] ===
    "object"
  ) {
    return {
      name: entries[0][0],
      ...(
        entries[0][1] as
        Record<
          string,
          unknown
        >
      ),
    };
  }

  return record;
}

function getIoName(
  raw: unknown,
): string {
  const record =
    getIoRecord(raw);

  if (!record) {
    return "";
  }

  return String(
    record.outputName ??
    record.name ??
    "",
  ).trim();
}

function getIoClass(
  raw: unknown,
): string {
  const record =
    getIoRecord(raw);

  if (!record) {
    return "";
  }

  return String(
    record.pointerClass ??
    record.className ??
    record._class ??
    "",
  ).trim();
}

function getIoInfo(
  raw: unknown,
): string {
  const record =
    getIoRecord(raw);

  if (!record) {
    return "";
  }

  return String(
    record.info ??
    "",
  ).trim();
}

function getIoTooltip(
  items: unknown[],
): string {
  if (!items.length) {
    return "No items";
  }

  return items
    .map((item) => {
      const name =
        getIoName(item);

      const className =
        getIoClass(item);

      const info =
        getIoInfo(item);

      return [
        name || "Unnamed",
        className
          ? `(${className})`
          : "",
        info
          ? `— ${info}`
          : "",
      ]
        .filter(Boolean)
        .join(" ");
    })
    .join("\n");
}

function getIoSearchText(
  items: unknown[],
): string {
  return items
    .map((item) =>
      [
        getIoName(item),
        getIoClass(item),
        getIoInfo(item),
      ]
        .filter(Boolean)
        .join(" "),
    )
    .join(" ");
}

function normalizeTagColor(
  raw: unknown,
): string {
  const value =
    String(
      raw ?? "",
    ).trim();

  if (
    /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/
      .test(value)
  ) {
    return value;
  }

  return "#9ca3af";
}

function getReadableTextColor(
  hexColor: string,
): string {
  const match =
    /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/
      .exec(hexColor);

  if (!match) {
    return "#111827";
  }

  const raw =
    match[1];

  const full =
    raw.length === 3
      ? raw
        .split("")
        .map(
          (character) =>
            character +
            character,
        )
        .join("")
      : raw;

  const red =
    Number.parseInt(
      full.slice(0, 2),
      16,
    );

  const green =
    Number.parseInt(
      full.slice(2, 4),
      16,
    );

  const blue =
    Number.parseInt(
      full.slice(4, 6),
      16,
    );

  const luminance =
    (
      0.2126 * red +
      0.7152 * green +
      0.0722 * blue
    ) / 255;

  return luminance >
    0.62
    ? "#111827"
    : "#f9fafb";
}

function getRowElapsed(
  row: ProjectProtocolTableRow,
): number {
  const value =
    Number(
      row.tick ??
      row.elapsedTime ??
      0,
    );

  return Number.isFinite(value)
    ? value
    : 0;
}

function getRowSteps(
  row: ProjectProtocolTableRow,
) {
  const total =
    Number(
      row.numberOfSteps ??
      0,
    );

  const done =
    Number(
      row.stepsDone ??
      0,
    );

  const safeTotal =
    Number.isFinite(total)
      ? Math.max(
        0,
        total,
      )
      : 0;

  const safeDone =
    Number.isFinite(done)
      ? Math.max(
        0,
        done,
      )
      : 0;

  const percentage =
    safeTotal > 0
      ? Math.min(
        100,
        Math.max(
          0,
          (
            safeDone /
            safeTotal
          ) * 100,
        ),
      )
      : 0;

  return {
    total: safeTotal,
    done: safeDone,
    percentage,
  };
}

function SelectionCheckbox({
  checked,
  indeterminate = false,
  ariaLabel,
  onClick,
}: {
  checked: boolean;
  indeterminate?: boolean;
  ariaLabel: string;
  onClick: (
    event:
      React.MouseEvent<
        HTMLInputElement
      >,
  ) => void;
}) {
  const ref =
    useRef<
      HTMLInputElement
      | null
    >(null);

  useEffect(() => {
    if (
      ref.current
    ) {
      ref.current.indeterminate =
        indeterminate;
    }
  }, [
    indeterminate,
  ]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      readOnly
      aria-label={ariaLabel}
      className="ppt-checkbox"
      onClick={onClick}
    />
  );
}

const ProjectProtocolTable =
  forwardRef<
    ProjectProtocolTableHandle,
    Props
  >(
    (
      {
        projectStorageKey,

        rows,

        allTags,

        tagAssignments,

        externalTagFilterIds,

        searchQuery,

        highlightedId,

        selectedIds,

        isRefreshing,

        contextMenuVisibility,

        onRefresh,

        onActivate,

        onOpen,

        onBrowse,

        onAnnotate,

        onDuplicate,

        onCopyWorkflow,

        onDelete,

        onRestartAll,

        onContinueAll,

        onResetFrom,

        onStop,

        onSelectFrom,

        onSelectTo,

        onSelectionChange,

        onToggleTag,

        onManageTags,
      },
      ref,
    ) => {
      const storageKey =
        `scipion-project-table:${projectStorageKey}`;

      const [
        settings,
        setSettings,
      ] =
        useState<TableSettings>(
          () =>
            readSettings(
              storageKey,
            ),
        );

      const [
        collapsedGroups,
        setCollapsedGroups,
      ] =
        useState<
          Set<string>
        >(
          () =>
            new Set(),
        );

      const [
        scrollTop,
        setScrollTop,
      ] =
        useState(0);

      const [
        viewportHeight,
        setViewportHeight,
      ] =
        useState(0);

      const containerRef =
        useRef<
          HTMLDivElement
          | null
        >(null);

      const rootRef =
        useRef<
          HTMLDivElement
          | null
        >(null);

      const rowRefs =
        useRef<
          Record<
            string,
            HTMLTableRowElement
            | null
          >
        >({});

      const lastSelectionAnchorRef =
        useRef<
          string
          | null
        >(null);

      useEffect(() => {
        if (
          typeof window ===
          "undefined"
        ) {
          return;
        }

        try {
          window.localStorage
            .setItem(
              storageKey,
              JSON.stringify(
                settings,
              ),
            );
        } catch {
          // noOp
        }
      }, [
        storageKey,
        settings,
      ]);

      useEffect(() => {
        setCollapsedGroups(
          new Set(),
        );
      }, [
        settings.groupBy,
      ]);

      useEffect(() => {
        const container =
          containerRef.current;

        if (!container) {
          return;
        }

        const updateHeight =
          () => {
            setViewportHeight(
              container.clientHeight,
            );
          };

        updateHeight();

        if (
          typeof ResizeObserver ===
          "undefined"
        ) {
          return;
        }

        const observer =
          new ResizeObserver(
            updateHeight,
          );

        observer.observe(
          container,
        );

        return () =>
          observer.disconnect();
      }, []);

      const tagById =
        useMemo(
          () =>
            new Map(
              allTags.map(
                (tag) => [
                  String(tag.id),
                  tag,
                ],
              ),
            ),
          [
            allTags,
          ],
        );

      const getAssignedTagIds =
        useCallback(
          (
            row:
              ProjectProtocolTableRow,
          ): string[] => {
            const protocolId =
              String(row.id);

            const assigned =
              normalizeIds(
                tagAssignments[
                protocolId
                ],
              );

            if (
              assigned.length
            ) {
              return assigned;
            }

            return normalizeIds(
              row.tagIds ??
              row.tags,
            );
          },
          [
            tagAssignments,
          ],
        );

      const getTagsText =
        useCallback(
          (
            row:
              ProjectProtocolTableRow,
          ): string =>
            getAssignedTagIds(
              row,
            )
              .map(
                (tagId) =>
                  String(
                    tagById.get(
                      tagId,
                    )?.title ??
                    tagId,
                  ),
              )
              .sort(
                compareText,
              )
              .join(" "),
          [
            getAssignedTagIds,
            tagById,
          ],
        );

      const baseFilteredRows =
        useMemo(() => {
          const externalTagSet =
            new Set(
              externalTagFilterIds
                .map(String),
            );

          const query =
            searchQuery
              .trim()
              .toLowerCase();

          return rows.filter(
            (row) => {
              if (
                externalTagSet.size
              ) {
                const rowTagIds =
                  getAssignedTagIds(
                    row,
                  );

                if (
                  !rowTagIds.some(
                    (tagId) =>
                      externalTagSet.has(
                        tagId,
                      ),
                  )
                ) {
                  return false;
                }
              }

              if (!query) {
                return true;
              }

              const searchableText =
                [
                  row.id,

                  getProtocolDisplayName(
                    row,
                  ),

                  row.label,
                  row.title,
                  row.comment,
                  row.status,

                  getTagsText(
                    row,
                  ),

                  getIoSearchText(
                    Array.isArray(
                      row.inputs,
                    )
                      ? row.inputs
                      : [],
                  ),

                  getIoSearchText(
                    Array.isArray(
                      row.outputs,
                    )
                      ? row.outputs
                      : [],
                  ),
                ]
                  .filter(Boolean)
                  .join(" ")
                  .toLowerCase();

              return searchableText
                .includes(
                  query,
                );
            },
          );
        }, [
          rows,
          externalTagFilterIds,
          searchQuery,
          getAssignedTagIds,
          getTagsText,
        ]);

      const stateCounts =
        useMemo(() => {
          const counts =
            new Map<
              string,
              number
            >();

          for (
            const row
            of baseFilteredRows
          ) {
            const status =
              normalizeStatus(
                row.status,
              ) ||
              "unknown";

            counts.set(
              status,
              (
                counts.get(
                  status,
                ) ??
                0
              ) + 1,
            );
          }

          return counts;
        }, [
          baseFilteredRows,
        ]);

      const availableStatuses =
        useMemo(() => {
          const statuses =
            Array.from(
              stateCounts.keys(),
            );

          return statuses.sort(
            (
              left,
              right,
            ) => {
              const leftIndex =
                STATUS_PRIORITY
                  .indexOf(
                    left,
                  );

              const rightIndex =
                STATUS_PRIORITY
                  .indexOf(
                    right,
                  );

              const normalizedLeft =
                leftIndex < 0
                  ? 999
                  : leftIndex;

              const normalizedRight =
                rightIndex < 0
                  ? 999
                  : rightIndex;

              if (
                normalizedLeft !==
                normalizedRight
              ) {
                return (
                  normalizedLeft -
                  normalizedRight
                );
              }

              return compareText(
                left,
                right,
              );
            },
          );
        }, [
          stateCounts,
        ]);

      const stateFilteredRows =
        useMemo(() => {
          if (
            settings.stateFilter ===
            "all"
          ) {
            return baseFilteredRows;
          }

          return baseFilteredRows
            .filter(
              (row) =>
                (
                  normalizeStatus(
                    row.status,
                  ) ||
                  "unknown"
                ) ===
                settings.stateFilter,
            );
        }, [
          baseFilteredRows,
          settings.stateFilter,
        ]);

      const compareRowsByKey =
        useCallback(
          (
            left:
              ProjectProtocolTableRow,
            right:
              ProjectProtocolTableRow,
            key:
              SortableColumnId,
          ): number => {
            switch (key) {
              case "id":
                return compareText(
                  left.id,
                  right.id,
                );

              case "protocol":
                return compareText(
                  getProtocolDisplayName(
                    left,
                  ),
                  getProtocolDisplayName(
                    right,
                  ),
                );

              case "state":
                return compareText(
                  normalizeStatus(
                    left.status,
                  ),
                  normalizeStatus(
                    right.status,
                  ),
                );

              case "tags":
                return compareText(
                  getTagsText(
                    left,
                  ),
                  getTagsText(
                    right,
                  ),
                );

              case "elapsed":
                return (
                  getRowElapsed(
                    left,
                  ) -
                  getRowElapsed(
                    right,
                  )
                );

              case "inputs":
                return (
                  (
                    left.inputs?.length ??
                    0
                  ) -
                  (
                    right.inputs?.length ??
                    0
                  )
                );

              case "outputs":
                return (
                  (
                    left.outputs?.length ??
                    0
                  ) -
                  (
                    right.outputs?.length ??
                    0
                  )
                );

              case "dependent":
                return (
                  (
                    left.children?.length ??
                    0
                  ) -
                  (
                    right.children?.length ??
                    0
                  )
                );

              default:
                return 0;
            }
          },
          [
            getTagsText,
          ],
        );

      const sortedRows =
        useMemo(() => {
          const next =
            [
              ...stateFilteredRows,
            ];

          next.sort(
            (
              left,
              right,
            ) => {
              for (
                const rule
                of settings.sorts
              ) {
                const result =
                  compareRowsByKey(
                    left,
                    right,
                    rule.key,
                  );

                if (
                  result !== 0
                ) {
                  return (
                    result *
                    (
                      rule.direction ===
                        "asc"
                        ? 1
                        : -1
                    )
                  );
                }
              }

              return compareText(
                left.id,
                right.id,
              );
            },
          );

          return next;
        }, [
          stateFilteredRows,
          settings.sorts,
          compareRowsByKey,
        ]);

      const groupedRows =
        useMemo(() => {
          if (
            settings.groupBy ===
            "none"
          ) {
            return [];
          }

          const groups =
            new Map<
              string,
              {
                key: string;
                label: string;
                rows:
                  ProjectProtocolTableRow[];
              }
            >();

          for (
            const row
            of sortedRows
          ) {
            let key = "";
            let label = "";

            if (
              settings.groupBy ===
              "state"
            ) {
              key =
                normalizeStatus(
                  row.status,
                ) ||
                "unknown";

              label =
                getStatusLabel(
                  key,
                );
            } else {
              const firstTagId =
                getAssignedTagIds(
                  row,
                )[0];

              if (
                firstTagId
              ) {
                key =
                  `tag:${firstTagId}`;

                label =
                  String(
                    tagById.get(
                      firstTagId,
                    )?.title ??
                    firstTagId,
                  );
              } else {
                key =
                  "tag:none";

                label =
                  "No tag";
              }
            }

            const existing =
              groups.get(
                key,
              );

            if (
              existing
            ) {
              existing.rows.push(
                row,
              );
            } else {
              groups.set(
                key,
                {
                  key,
                  label,
                  rows: [row],
                },
              );
            }
          }

          return Array.from(
            groups.values(),
          );
        }, [
          settings.groupBy,
          sortedRows,
          getAssignedTagIds,
          tagById,
        ]);

      const selectedSet =
        useMemo(
          () =>
            new Set(
              selectedIds
                .map(String),
            ),
          [
            selectedIds,
          ],
        );

      const visibleColumns =
        useMemo(
          () =>
            COLUMN_DEFINITIONS
              .filter(
                (column) =>
                  settings.visible[
                  column.id
                  ],
              ),
          [
            settings.visible,
          ],
        );

      const totalColSpan =
        1 +
        visibleColumns.length;

      const totalWidth =
        SELECT_COLUMN_WIDTH +
        visibleColumns
          .reduce(
            (
              total,
              column,
            ) =>
              total +
              (
                settings.widths[
                column.id
                ] ??
                column.defaultWidth
              ),
            0,
          );

      const rowHeight =
        settings.density ===
          "compact"
          ? 44
          : 60;

      const virtualizationEnabled =
        settings.groupBy ===
          "none" &&
        sortedRows.length >
        VIRTUALIZE_AFTER_ROWS;

      const virtualRange =
        useMemo(() => {
          if (
            !virtualizationEnabled
          ) {
            return {
              start: 0,
              end:
                sortedRows.length,
            };
          }

          const bodyScrollTop =
            Math.max(
              0,
              scrollTop -
              HEADER_HEIGHT,
            );

          const start =
            Math.max(
              0,
              Math.floor(
                bodyScrollTop /
                rowHeight,
              ) -
              VIRTUAL_OVERSCAN,
            );

          const viewportRows =
            Math.ceil(
              (
                viewportHeight ||
                500
              ) /
              rowHeight,
            );

          const end =
            Math.min(
              sortedRows.length,
              start +
              viewportRows +
              (
                VIRTUAL_OVERSCAN *
                2
              ),
            );

          return {
            start,
            end,
          };
        }, [
          virtualizationEnabled,
          sortedRows.length,
          scrollTop,
          viewportHeight,
          rowHeight,
        ]);

      const virtualRows =
        virtualizationEnabled
          ? sortedRows.slice(
            virtualRange.start,
            virtualRange.end,
          )
          : sortedRows;

      const topSpacerHeight =
        virtualizationEnabled
          ? (
            virtualRange.start *
            rowHeight
          )
          : 0;

      const bottomSpacerHeight =
        virtualizationEnabled
          ? (
            (
              sortedRows.length -
              virtualRange.end
            ) *
            rowHeight
          )
          : 0;

      const scrollToProtocolInternal =
        useCallback(
          (
            protocolId: string,
          ): boolean => {
            const id =
              String(
                protocolId,
              );

            const index =
              sortedRows.findIndex(
                (row) =>
                  String(row.id) ===
                  id,
              );

            if (
              index < 0
            ) {
              return false;
            }

            const container =
              containerRef.current;

            if (!container) {
              return false;
            }

            if (
              settings.groupBy ===
              "none"
            ) {
              const desired =
                (
                  HEADER_HEIGHT +
                  index *
                  rowHeight
                ) -
                (
                  container.clientHeight /
                  2
                ) +
                (
                  rowHeight /
                  2
                );

              container.scrollTop =
                Math.max(
                  0,
                  desired,
                );

              return true;
            }

            const group =
              groupedRows.find(
                (candidate) =>
                  candidate.rows
                    .some(
                      (row) =>
                        String(
                          row.id,
                        ) === id,
                    ),
              );

            if (
              group &&
              collapsedGroups.has(
                group.key,
              )
            ) {
              setCollapsedGroups(
                (current) => {
                  const next =
                    new Set(
                      current,
                    );

                  next.delete(
                    group.key,
                  );

                  return next;
                },
              );
            }

            requestAnimationFrame(
              () =>
                requestAnimationFrame(
                  () => {
                    rowRefs.current[
                      id
                    ]?.scrollIntoView({
                      block:
                        "center",
                      behavior:
                        "auto",
                    });
                  },
                ),
            );

            return true;
          },
          [
            sortedRows,
            groupedRows,
            settings.groupBy,
            collapsedGroups,
            rowHeight,
          ],
        );

      useImperativeHandle(
        ref,
        () => ({
          scrollToProtocol:
            scrollToProtocolInternal,

          scrollToFirstVisible:
            () => {
              const first =
                sortedRows[0];

              if (!first) {
                return false;
              }

              return scrollToProtocolInternal(
                first.id,
              );
            },
        }),
        [
          sortedRows,
          scrollToProtocolInternal,
        ],
      );

      const setColumnVisible =
        (
          columnId: ColumnId,
          visible: boolean,
        ) => {
          const definition =
            COLUMN_DEFINITIONS.find(
              (column) =>
                column.id ===
                columnId,
            );

          if (
            definition?.mandatory
          ) {
            return;
          }

          setSettings(
            (current) => ({
              ...current,

              visible: {
                ...current.visible,

                [columnId]:
                  visible,
              },
            }),
          );
        };

      const handleSort =
        (
          key:
            SortableColumnId,
          shiftPressed: boolean,
        ) => {
          setSettings(
            (current) => {
              const existingIndex =
                current.sorts
                  .findIndex(
                    (rule) =>
                      rule.key ===
                      key,
                  );

              if (
                shiftPressed
              ) {
                if (
                  existingIndex >=
                  0
                ) {
                  const nextSorts =
                    [
                      ...current.sorts,
                    ];

                  nextSorts[
                    existingIndex
                  ] = {
                    ...nextSorts[
                    existingIndex
                    ],

                    direction:
                      nextSorts[
                        existingIndex
                      ].direction ===
                        "asc"
                        ? "desc"
                        : "asc",
                  };

                  return {
                    ...current,
                    sorts:
                      nextSorts,
                  };
                }

                return {
                  ...current,

                  sorts: [
                    ...current.sorts,
                    {
                      key,
                      direction:
                        "asc",
                    },
                  ],
                };
              }

              if (
                current.sorts.length ===
                1 &&
              current.sorts[0].key ===
                key
              ) {
                return {
                  ...current,

                  sorts: [
                    {
                      key,

                      direction:
                        current.sorts[0]
                          .direction ===
                          "asc"
                          ? "desc"
                          : "asc",
                    },
                  ],
                };
              }

              return {
                ...current,

                sorts: [
                  {
                    key,
                    direction:
                      key === "id"
                        ? "desc"
                        : "asc",
                  },
                ],
              };
            },
          );
        };

      const getSortRuleIndex =
        (
          columnId: ColumnId,
        ) =>
          settings.sorts
            .findIndex(
              (rule) =>
                rule.key ===
                columnId,
            );

      const renderSortIndicator =
        (
          columnId: ColumnId,
        ) => {
          const index =
            getSortRuleIndex(
              columnId,
            );

          if (
            index < 0
          ) {
            return (
              <ArrowUpDown
                className="ppt-sortIcon"
              />
            );
          }

          const rule =
            settings.sorts[
            index
            ];

          return (
            <span className="ppt-sortActive">
              {rule.direction ===
                "asc" ? (
                <ArrowUp
                  className="ppt-sortIcon ppt-sortIconActive"
                />
              ) : (
                <ArrowDown
                  className="ppt-sortIcon ppt-sortIconActive"
                />
              )}

              {settings.sorts
                .length >
                1 && (
                  <span className="ppt-sortPriority">
                    {index + 1}
                  </span>
                )}
            </span>
          );
        };

      const getAriaSort =
        (
          columnId: ColumnId,
        ):
          | "ascending"
          | "descending"
          | "none" => {
          const index =
            getSortRuleIndex(
              columnId,
            );

          if (
            index !== 0
          ) {
            return "none";
          }

          return settings.sorts[0]
            .direction ===
            "asc"
            ? "ascending"
            : "descending";
        };

      const startColumnResize =
        (
          event:
            React.PointerEvent<
              HTMLSpanElement
            >,
          column:
            ColumnDefinition,
        ) => {
          event.preventDefault();
          event.stopPropagation();

          const startX =
            event.clientX;

          const startWidth =
            settings.widths[
            column.id
            ] ??
            column.defaultWidth;

          const handleMove =
            (
              moveEvent:
                PointerEvent,
            ) => {
              const delta =
                moveEvent.clientX -
                startX;

              const nextWidth =
                Math.max(
                  column.minWidth,
                  startWidth +
                  delta,
                );

              setSettings(
                (current) => ({
                  ...current,

                  widths: {
                    ...current.widths,

                    [column.id]:
                      nextWidth,
                  },
                }),
              );
            };

          const handleUp =
            () => {
              window
                .removeEventListener(
                  "pointermove",
                  handleMove,
                );

              window
                .removeEventListener(
                  "pointerup",
                  handleUp,
                );
            };

          window.addEventListener(
            "pointermove",
            handleMove,
          );

          window.addEventListener(
            "pointerup",
            handleUp,
          );
        };

      const getColumnStyle =
        (
          column:
            ColumnDefinition,
        ): CSSProperties => {
          const width =
            settings.widths[
            column.id
            ] ??
            column.defaultWidth;

          const style:
            CSSProperties = {
            width,
            minWidth: width,
            maxWidth: width,
          };

          if (
            column.id ===
            "id"
          ) {
            style.position =
              "sticky";

            style.left =
              SELECT_COLUMN_WIDTH;
          }

          if (
            column.id ===
            "protocol"
          ) {
            style.position =
              "sticky";

            style.left =
              SELECT_COLUMN_WIDTH +
              settings.widths.id;
          }

          if (
            column.id ===
            "actions"
          ) {
            style.position =
              "sticky";

            style.right = 0;
          }

          return style;
        };

      const toggleGroup =
        (
          groupKey: string,
        ) => {
          setCollapsedGroups(
            (current) => {
              const next =
                new Set(
                  current,
                );

              if (
                next.has(
                  groupKey,
                )
              ) {
                next.delete(
                  groupKey,
                );
              } else {
                next.add(
                  groupKey,
                );
              }

              return next;
            },
          );
        };

      const toggleRowSelection =
        (
          protocolId: string,
          shiftPressed: boolean,
        ) => {
          const id =
            String(
              protocolId,
            );

          const next =
            new Set(
              selectedSet,
            );

          if (
            shiftPressed &&
            lastSelectionAnchorRef
              .current
          ) {
            const anchorIndex =
              sortedRows.findIndex(
                (row) =>
                  row.id ===
                  lastSelectionAnchorRef
                    .current,
              );

            const currentIndex =
              sortedRows.findIndex(
                (row) =>
                  row.id ===
                  id,
              );

            if (
              anchorIndex >= 0 &&
              currentIndex >= 0
            ) {
              const start =
                Math.min(
                  anchorIndex,
                  currentIndex,
                );

              const end =
                Math.max(
                  anchorIndex,
                  currentIndex,
                );

              for (
                let index = start;
                index <= end;
                index += 1
              ) {
                next.add(
                  sortedRows[
                    index
                  ].id,
                );
              }
            }
          } else if (
            next.has(id)
          ) {
            next.delete(id);
          } else {
            next.add(id);
          }

          lastSelectionAnchorRef
            .current = id;

          onSelectionChange(
            Array.from(next),
          );
        };

      const allVisibleSelected =
        sortedRows.length >
        0 &&
        sortedRows.every(
          (row) =>
            selectedSet.has(
              row.id,
            ),
        );

      const someVisibleSelected =
        !allVisibleSelected &&
        sortedRows.some(
          (row) =>
            selectedSet.has(
              row.id,
            ),
        );

      const toggleAllVisible =
        () => {
          const next =
            new Set(
              selectedSet,
            );

          if (
            allVisibleSelected
          ) {
            for (
              const row
              of sortedRows
            ) {
              next.delete(
                row.id,
              );
            }
          } else {
            for (
              const row
              of sortedRows
            ) {
              next.add(
                row.id,
              );
            }
          }

          onSelectionChange(
            Array.from(next),
          );
        };

      const selectedRows =
        useMemo(() => {
          if (
            !selectedSet.size
          ) {
            return [];
          }

          return rows.filter(
            (row) =>
              selectedSet.has(
                row.id,
              ),
          );
        }, [
          rows,
          selectedSet,
        ]);

      const selectedLiveIds =
        useMemo(
          () =>
            selectedRows
              .filter(
                (row) =>
                  LIVE_STATUSES.has(
                    normalizeStatus(
                      row.status,
                    ),
                  ),
              )
              .map(
                (row) =>
                  row.id,
              ),
          [
            selectedRows,
          ],
        );

      const isMenuVisible =
        (
          key:
            keyof NodeMenuVisibility,
        ) =>
          contextMenuVisibility?.[
          key
          ] !== false;

      const renderTags =
        (
          row:
            ProjectProtocolTableRow,
        ) => {
          const ids =
            getAssignedTagIds(
              row,
            );

          if (
            !ids.length
          ) {
            return (
              <span className="ppt-emptyValue">
                —
              </span>
            );
          }

          const visible =
            ids.slice(0, 2);

          const remaining =
            Math.max(
              0,
              ids.length - 2,
            );

          return (
            <div className="ppt-tagsCell">
              {visible.map(
                (tagId) => {
                  const tag =
                    tagById.get(
                      tagId,
                    );

                  const color =
                    normalizeTagColor(
                      tag?.color,
                    );

                  return (
                    <span
                      key={tagId}
                      className="ppt-tagChip"
                      title={
                        String(
                          tag?.title ??
                          tagId,
                        )
                      }
                      style={{
                        backgroundColor:
                          color,

                        color:
                          getReadableTextColor(
                            color,
                          ),
                      }}
                    >
                      {String(
                        tag?.title ??
                        tagId,
                      )}
                    </span>
                  );
                },
              )}

              {remaining >
                0 && (
                  <span className="ppt-tagMore">
                    +{remaining}
                  </span>
                )}
            </div>
          );
        };

      const renderIoCell =
        (
          items:
            unknown[]
            | undefined,
        ) => {
          const normalized =
            Array.isArray(items)
              ? items
              : [];

          if (
            !normalized.length
          ) {
            return (
              <span className="ppt-emptyValue">
                —
              </span>
            );
          }

          const firstName =
            getIoName(
              normalized[0],
            );

          return (
            <div
              className="ppt-ioCell"
              title={
                getIoTooltip(
                  normalized,
                )
              }
            >
              <span className="ppt-countPill">
                {normalized.length}
              </span>

              {firstName && (
                <span className="ppt-ioName">
                  {firstName}
                </span>
              )}
            </div>
          );
        };

      const renderState =
        (
          row:
            ProjectProtocolTableRow,
        ) => {
          const status =
            normalizeStatus(
              row.status,
            );

          const steps =
            getRowSteps(
              row,
            );

          return (
            <div className="ppt-stateCell">
              <span
                className={[
                  "ppt-statusBadge",

                  status ===
                    "running"
                    ? "ppt-statusRunning"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{
                  backgroundColor:
                    getStatusBackground(
                      status,
                    ),
                }}
              >
                {getStatusLabel(
                  status,
                )}
              </span>

              {steps.total >
                0 && (
                  <div className="ppt-stepProgress">
                    <div className="ppt-stepTrack">
                      <div
                        className="ppt-stepFill"
                        style={{
                          width:
                            `${steps.percentage}%`,
                        }}
                      />
                    </div>

                    <span className="ppt-stepText">
                      {steps.done} /{" "}
                      {steps.total} steps
                    </span>
                  </div>
                )}
            </div>
          );
        };

      const renderDependent =
        (
          row:
            ProjectProtocolTableRow,
        ) => {
          const children =
            Array.isArray(
              row.children,
            )
              ? row.children
              : [];

          if (
            !children.length
          ) {
            return (
              <span className="ppt-emptyValue">
                —
              </span>
            );
          }

          const visible =
            children.slice(
              0,
              3,
            );

          const remaining =
            children.length -
            visible.length;

          return (
            <div className="ppt-depsCell">
              {visible.map(
                (childId) => (
                  <button
                    key={childId}
                    type="button"
                    className="ppt-dependencyButton"
                    onClick={(
                      event,
                    ) => {
                      event
                        .stopPropagation();

                      onActivate(
                        String(
                          childId,
                        ),
                      );

                      scrollToProtocolInternal(
                        String(
                          childId,
                        ),
                      );
                    }}
                  >
                    {childId}
                  </button>
                ),
              )}

              {remaining >
                0 && (
                  <span className="ppt-dependencyMore">
                    +{remaining}
                  </span>
                )}
            </div>
          );
        };

      const renderRowMenu =
        (
          row:
            ProjectProtocolTableRow,
        ) => {
          const status =
            normalizeStatus(
              row.status,
            );

          const label =
            getProtocolDisplayName(
              row,
            );

          return (
            <DropdownMenu>
              <DropdownMenuTrigger
                asChild
              >
                <button
                  type="button"
                  className="ppt-rowMenuButton"
                  aria-label={
                    `Actions for ${label}`
                  }
                  onClick={(
                    event,
                  ) =>
                    event
                      .stopPropagation()
                  }
                >
                  <MoreHorizontal />
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent
                align="end"
                className="min-w-[190px]"
              >
                {isMenuVisible(
                  "open",
                ) && (
                    <DropdownMenuItem
                      onSelect={() =>
                        onOpen(
                          row.id,
                        )
                      }
                    >
                      <Scan />
                      Open
                    </DropdownMenuItem>
                  )}

                {isMenuVisible(
                  "browse",
                ) && (
                    <DropdownMenuItem
                      onSelect={() =>
                        onBrowse(
                          row.id,
                          label,
                        )
                      }
                    >
                      <FolderOpen />
                      Browse
                    </DropdownMenuItem>
                  )}

                {isMenuVisible(
                  "rename",
                ) && (
                    <DropdownMenuItem
                      onSelect={() =>
                        onAnnotate(
                          row.id,
                        )
                      }
                    >
                      <Pencil />
                      Annotate
                    </DropdownMenuItem>
                  )}

                <DropdownMenuSeparator />

                {isMenuVisible(
                  "duplicate",
                ) && (
                    <DropdownMenuItem
                      onSelect={() =>
                        onDuplicate([
                          row.id,
                        ])
                      }
                    >
                      <CopyPlus />
                      Duplicate
                    </DropdownMenuItem>
                  )}

                {isMenuVisible(
                  "copyWorkflow",
                ) && (
                    <DropdownMenuItem
                      onSelect={() =>
                        onCopyWorkflow([
                          row.id,
                        ])
                      }
                    >
                      <Copy />
                      Copy workflow
                    </DropdownMenuItem>
                  )}

                <DropdownMenuSeparator />

                {isMenuVisible(
                  "selectFrom",
                ) && (
                    <DropdownMenuItem
                      onSelect={() =>
                        onSelectFrom(
                          row.id,
                        )
                      }
                    >
                      Select from
                    </DropdownMenuItem>
                  )}

                {isMenuVisible(
                  "selectTo",
                ) && (
                    <DropdownMenuItem
                      onSelect={() =>
                        onSelectTo(
                          row.id,
                        )
                      }
                    >
                      Select to
                    </DropdownMenuItem>
                  )}

                {isMenuVisible(
                  "stop",
                ) &&
                  LIVE_STATUSES.has(
                    status,
                  ) && (
                    <DropdownMenuItem
                      onSelect={() =>
                        onStop([
                          row.id,
                        ])
                      }
                    >
                      <Square />
                      Stop
                    </DropdownMenuItem>
                  )}

                {isMenuVisible(
                  "restart",
                ) && (
                    <DropdownMenuItem
                      onSelect={() =>
                        onRestartAll(
                          row.id,
                        )
                      }
                    >
                      <RefreshCw />
                      Restart all
                    </DropdownMenuItem>
                  )}

                {isMenuVisible(
                  "continue",
                ) && (
                    <DropdownMenuItem
                      onSelect={() =>
                        onContinueAll(
                          row.id,
                        )
                      }
                    >
                      <Play />
                      Continue all
                    </DropdownMenuItem>
                  )}

                {isMenuVisible(
                  "reset",
                ) && (
                    <DropdownMenuItem
                      onSelect={() =>
                        onResetFrom(
                          row.id,
                        )
                      }
                    >
                      <RotateCcw />
                      Reset from
                    </DropdownMenuItem>
                  )}

                {isMenuVisible(
                  "manageTags",
                ) && (
                    <>
                      <DropdownMenuSeparator />

                      <DropdownMenuItem
                        onSelect={
                          onManageTags
                        }
                      >
                        <Tags />
                        Manage tags
                      </DropdownMenuItem>
                    </>
                  )}

                {isMenuVisible(
                  "delete",
                ) && (
                    <>
                      <DropdownMenuSeparator />

                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() =>
                          onDelete([
                            row.id,
                          ])
                        }
                      >
                        <Trash2 />
                        Delete
                      </DropdownMenuItem>
                    </>
                  )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        };

      const renderCell =
        (
          row:
            ProjectProtocolTableRow,
          column:
            ColumnDefinition,
        ) => {
          switch (
          column.id
          ) {
            case "id":
              return (
                <div className="ppt-idPill">
                  {row.id}
                </div>
              );

            case "protocol":
              return (
                <div
                  className="ppt-protocolCell"
                  title={
                    String(
                      row.label ??
                      getProtocolDisplayName(
                        row,
                      ),
                    )
                  }
                >
                  {getProtocolDisplayName(
                    row,
                  )}
                </div>
              );

            case "state":
              return renderState(
                row,
              );

            case "tags":
              return renderTags(
                row,
              );

            case "elapsed":
              return (
                <span className="ppt-elapsed">
                  {formatElapsed(
                    getRowElapsed(
                      row,
                    ),
                  )}
                </span>
              );

            case "inputs":
              return renderIoCell(
                row.inputs,
              );

            case "outputs":
              return renderIoCell(
                row.outputs,
              );

            case "dependent":
              return renderDependent(
                row,
              );

            case "actions":
              return renderRowMenu(
                row,
              );

            default:
              return null;
          }
        };

      const renderProtocolRow =
        (
          row:
            ProjectProtocolTableRow,
        ) => {
          const selected =
            selectedSet.has(
              row.id,
            );

          const highlighted =
            highlightedId ===
            row.id;

          return (
            <tr
              key={row.id}
              data-protocol-id={
                row.id
              }
              ref={(element) => {
                rowRefs.current[
                  row.id
                ] = element;
              }}
              className={[
                "ppt-row",

                selected
                  ? "ppt-rowSelected"
                  : "",

                highlighted
                  ? "ppt-rowHighlighted"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{
                height:
                  rowHeight,
              }}
              onClick={(
                event,
              ) => {
                rootRef.current
                  ?.focus({
                    preventScroll:
                      true,
                  });

                if (
                  event.ctrlKey ||
                  event.metaKey ||
                  event.shiftKey
                ) {
                  toggleRowSelection(
                    row.id,
                    event.shiftKey,
                  );

                  return;
                }

                onActivate(
                  row.id,
                );
              }}
              onDoubleClick={() =>
                onOpen(
                  row.id,
                )
              }
            >
              <td
                className="ppt-cell ppt-selectCell ppt-stickyLeft"
                style={{
                  width:
                    SELECT_COLUMN_WIDTH,

                  minWidth:
                    SELECT_COLUMN_WIDTH,

                  maxWidth:
                    SELECT_COLUMN_WIDTH,

                  left: 0,
                }}
              >
                <SelectionCheckbox
                  checked={
                    selected
                  }
                  ariaLabel={
                    `Select protocol ${row.id}`
                  }
                  onClick={(
                    event,
                  ) => {
                    event
                      .stopPropagation();

                    toggleRowSelection(
                      row.id,
                      event.shiftKey,
                    );
                  }}
                />
              </td>

              {visibleColumns.map(
                (column) => {
                  const sticky =
                    column.id ===
                      "id" ||
                    column.id ===
                      "protocol" ||
                    column.id ===
                      "actions";

                  return (
                    <td
                      key={
                        column.id
                      }
                      className={[
                        "ppt-cell",

                        sticky
                          ? "ppt-stickyCell"
                          : "",

                        column.id ===
                          "id"
                          ? "ppt-idColumn"
                          : "",

                        column.id ===
                          "protocol"
                          ? "ppt-protocolColumn"
                          : "",

                        column.id ===
                          "actions"
                          ? "ppt-actionsColumn"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      style={
                        getColumnStyle(
                          column,
                        )
                      }
                    >
                      {renderCell(
                        row,
                        column,
                      )}
                    </td>
                  );
                },
              )}
            </tr>
          );
        };

      const handleKeyboard =
        (
          event:
            React.KeyboardEvent<
              HTMLDivElement
            >,
        ) => {
          const target =
            event.target as
            HTMLElement;

          if (
            target.closest(
              "input,button,a,[role='menuitem']",
            )
          ) {
            return;
          }

          const activeId =
            highlightedId ??
            selectedIds[0] ??
            sortedRows[0]?.id;

          const currentIndex =
            activeId
              ? sortedRows.findIndex(
                (row) =>
                  row.id ===
                  activeId,
              )
              : -1;

          if (
            event.key ===
            "ArrowDown"
          ) {
            event.preventDefault();

            const nextIndex =
              Math.min(
                sortedRows.length -
                1,
                Math.max(
                  0,
                  currentIndex +
                  1,
                ),
              );

            const row =
              sortedRows[
              nextIndex
              ];

            if (row) {
              onActivate(
                row.id,
              );

              scrollToProtocolInternal(
                row.id,
              );
            }

            return;
          }

          if (
            event.key ===
            "ArrowUp"
          ) {
            event.preventDefault();

            const nextIndex =
              Math.max(
                0,
                currentIndex -
                1,
              );

            const row =
              sortedRows[
              nextIndex
              ];

            if (row) {
              onActivate(
                row.id,
              );

              scrollToProtocolInternal(
                row.id,
              );
            }

            return;
          }

          if (
            event.key ===
            "Enter" &&
            activeId
          ) {
            event.preventDefault();

            onOpen(
              activeId,
            );

            return;
          }

          if (
            event.key ===
            "Delete"
          ) {
            const ids =
              selectedIds.length
                ? selectedIds
                : activeId
                  ? [activeId]
                  : [];

            if (
              ids.length
            ) {
              event.preventDefault();

              onDelete(
                ids,
              );
            }

            return;
          }

          if (
            (
              event.ctrlKey ||
              event.metaKey
            ) &&
            event.key
              .toLowerCase() ===
            "a"
          ) {
            event.preventDefault();

            onSelectionChange(
              sortedRows.map(
                (row) =>
                  row.id,
              ),
            );

            return;
          }

          if (
            event.key ===
            "Escape" &&
            selectedIds.length
          ) {
            event.preventDefault();

            onSelectionChange(
              [],
            );
          }
        };

      return (
        <div
          ref={rootRef}
          className="ppt-root"
          data-density={
            settings.density
          }
          tabIndex={0}
          onKeyDown={
            handleKeyboard
          }
        >
          <div className="ppt-toolbar">
            <div className="ppt-statusFilters">
              <button
                type="button"
                className="ppt-filterChip"
                data-active={
                  settings.stateFilter ===
                  "all"
                }
                onClick={() =>
                  setSettings(
                    (current) => ({
                      ...current,
                      stateFilter:
                        "all",
                    }),
                  )
                }
              >
                All
                <span>
                  {
                    baseFilteredRows
                      .length
                  }
                </span>
              </button>

              {availableStatuses.map(
                (status) => (
                  <button
                    key={
                      status
                    }
                    type="button"
                    className="ppt-filterChip"
                    data-active={
                      settings.stateFilter ===
                      status
                    }
                    onClick={() =>
                      setSettings(
                        (current) => ({
                          ...current,

                          stateFilter:
                            status,
                        }),
                      )
                    }
                  >
                    {getStatusLabel(
                      status,
                    )}

                    <span>
                      {
                        stateCounts.get(
                          status,
                        ) ??
                        0
                      }
                    </span>
                  </button>
                ),
              )}
            </div>

            <div className="ppt-toolbarRight">
              <span className="ppt-rowCounter">
                {sortedRows.length} of{" "}
                {rows.length} protocols
              </span>

              <DropdownMenu>
                <DropdownMenuTrigger
                  asChild
                >
                  <button
                    type="button"
                    className="ppt-toolbarButton"
                  >
                    <Columns3 />
                    Columns
                  </button>
                </DropdownMenuTrigger>

                <DropdownMenuContent
                  align="end"
                  className="min-w-[190px]"
                >
                  <DropdownMenuLabel>
                    Visible columns
                  </DropdownMenuLabel>

                  {COLUMN_DEFINITIONS.map(
                    (column) => (
                      <DropdownMenuCheckboxItem
                        key={
                          column.id
                        }
                        checked={
                          settings.visible[
                          column.id
                          ]
                        }
                        disabled={
                          column.mandatory
                        }
                        onSelect={(
                          event,
                        ) =>
                          event
                            .preventDefault()
                        }
                        onCheckedChange={(
                          checked,
                        ) =>
                          setColumnVisible(
                            column.id,

                            checked ===
                            true,
                          )
                        }
                      >
                        {
                          column.label ||
                          "Actions"
                        }
                      </DropdownMenuCheckboxItem>
                    ),
                  )}

                  <DropdownMenuSeparator />

                  <DropdownMenuItem
                    onSelect={() =>
                      setSettings(
                        createDefaultSettings(),
                      )
                    }
                  >
                    Reset table
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger
                  asChild
                >
                  <button
                    type="button"
                    className="ppt-toolbarButton"
                  >
                    <Rows3 />
                    Density
                  </button>
                </DropdownMenuTrigger>

                <DropdownMenuContent
                  align="end"
                >
                  <DropdownMenuRadioGroup
                    value={
                      settings.density
                    }
                    onValueChange={(
                      value,
                    ) =>
                      setSettings(
                        (current) => ({
                          ...current,

                          density:
                            value as
                            TableDensity,
                        }),
                      )
                    }
                  >
                    <DropdownMenuRadioItem
                      value="comfortable"
                    >
                      Comfortable
                    </DropdownMenuRadioItem>

                    <DropdownMenuRadioItem
                      value="compact"
                    >
                      Compact
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger
                  asChild
                >
                  <button
                    type="button"
                    className="ppt-toolbarButton"
                  >
                    <Layers3 />
                    Group
                  </button>
                </DropdownMenuTrigger>

                <DropdownMenuContent
                  align="end"
                >
                  <DropdownMenuRadioGroup
                    value={
                      settings.groupBy
                    }
                    onValueChange={(
                      value,
                    ) =>
                      setSettings(
                        (current) => ({
                          ...current,

                          groupBy:
                            value as
                            TableGroupBy,
                        }),
                      )
                    }
                  >
                    <DropdownMenuRadioItem
                      value="none"
                    >
                      None
                    </DropdownMenuRadioItem>

                    <DropdownMenuRadioItem
                      value="state"
                    >
                      State
                    </DropdownMenuRadioItem>

                    <DropdownMenuRadioItem
                      value="tag"
                    >
                      Tag
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              <button
                type="button"
                className="ppt-refreshButton"
                title="Refresh project"
                disabled={
                  isRefreshing
                }
                onClick={
                  onRefresh
                }
              >
                <RefreshCw
                  className={
                    isRefreshing
                      ? "ppt-spin"
                      : ""
                  }
                />
              </button>
            </div>
          </div>

          {selectedIds.length >
            0 && (
              <div className="ppt-bulkToolbar">
                <div className="ppt-bulkSelection">
                  <CheckSquare2 />

                  <strong>
                    {
                      selectedIds.length
                    }
                  </strong>

                  selected
                </div>

                <div className="ppt-bulkActions">
                  <button
                    type="button"
                    className="ppt-bulkButton"
                    onClick={() =>
                      onDuplicate(
                        selectedIds,
                      )
                    }
                  >
                    <CopyPlus />
                    Duplicate
                  </button>

                  <button
                    type="button"
                    className="ppt-bulkButton"
                    onClick={() =>
                      onCopyWorkflow(
                        selectedIds,
                      )
                    }
                  >
                    <Copy />
                    Copy
                  </button>

                  <DropdownMenu>
                    <DropdownMenuTrigger
                      asChild
                    >
                      <button
                        type="button"
                        className="ppt-bulkButton"
                      >
                        <Tags />
                        Tags
                      </button>
                    </DropdownMenuTrigger>

                    <DropdownMenuContent
                      align="start"
                      className="min-w-[210px]"
                    >
                      <DropdownMenuLabel>
                        Toggle tag for selection
                      </DropdownMenuLabel>

                      {allTags.map(
                        (tag) => {
                          const tagId =
                            String(
                              tag.id,
                            );

                          const allHaveTag =
                            selectedRows.length >
                            0 &&
                            selectedRows.every(
                              (row) =>
                                getAssignedTagIds(
                                  row,
                                ).includes(
                                  tagId,
                                ),
                            );

                          return (
                            <DropdownMenuCheckboxItem
                              key={
                                tagId
                              }
                              checked={
                                allHaveTag
                              }
                              onSelect={(
                                event,
                              ) =>
                                event
                                  .preventDefault()
                              }
                              onCheckedChange={(
                                checked,
                              ) => {
                                void onToggleTag(
                                  selectedIds,
                                  tagId,
                                  checked ===
                                  true,
                                );
                              }}
                            >
                              {String(
                                tag.title ??
                                tag.id,
                              )}
                            </DropdownMenuCheckboxItem>
                          );
                        },
                      )}

                      <DropdownMenuSeparator />

                      <DropdownMenuItem
                        onSelect={
                          onManageTags
                        }
                      >
                        Manage tag definitions
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {selectedLiveIds.length >
                    0 && (
                      <button
                        type="button"
                        className="ppt-bulkButton"
                        onClick={() =>
                          onStop(
                            selectedLiveIds,
                          )
                        }
                      >
                        <Square />
                        Stop
                      </button>
                    )}

                  <button
                    type="button"
                    className="ppt-bulkButton ppt-bulkButtonDanger"
                    onClick={() =>
                      onDelete(
                        selectedIds,
                      )
                    }
                  >
                    <Trash2 />
                    Delete
                  </button>

                  <button
                    type="button"
                    className="ppt-clearSelection"
                    title="Clear selection"
                    onClick={() =>
                      onSelectionChange(
                        [],
                      )
                    }
                  >
                    <X />
                  </button>
                </div>
              </div>
            )}

          <div
            ref={containerRef}
            className="ppt-tableCard"
            onScroll={(
              event,
            ) =>
              setScrollTop(
                event.currentTarget
                  .scrollTop,
              )
            }
          >
            <table
              className="ppt-table"
              role="grid"
              style={{
                minWidth:
                  "100%",

                width:
                  totalWidth,
              }}
            >
              <thead className="ppt-head">
                <tr>
                  <th
                    className="ppt-headCell ppt-selectCell ppt-stickyLeft"
                    style={{
                      width:
                        SELECT_COLUMN_WIDTH,

                      minWidth:
                        SELECT_COLUMN_WIDTH,

                      maxWidth:
                        SELECT_COLUMN_WIDTH,

                      left: 0,
                    }}
                  >
                    <SelectionCheckbox
                      checked={
                        allVisibleSelected
                      }
                      indeterminate={
                        someVisibleSelected
                      }
                      ariaLabel="Select visible protocols"
                      onClick={(
                        event,
                      ) => {
                        event
                          .stopPropagation();

                        toggleAllVisible();
                      }}
                    />
                  </th>

                  {visibleColumns.map(
                    (column) => {
                      const sticky =
                        column.id ===
                          "id" ||
                        column.id ===
                          "protocol" ||
                        column.id ===
                          "actions";

                      return (
                        <th
                          key={
                            column.id
                          }
                          className={[
                            "ppt-headCell",

                            sticky
                              ? "ppt-stickyHead"
                              : "",

                            column.id ===
                              "id"
                              ? "ppt-idColumn"
                              : "",

                            column.id ===
                              "protocol"
                              ? "ppt-protocolColumn"
                              : "",

                            column.id ===
                              "actions"
                              ? "ppt-actionsColumn"
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          style={
                            getColumnStyle(
                              column,
                            )
                          }
                          aria-sort={
                            column.sortable
                              ? getAriaSort(
                                column.id,
                              )
                              : undefined
                          }
                        >
                          {column.sortable ? (
                            <button
                              type="button"
                              className="ppt-sortButton"
                              data-active={
                                getSortRuleIndex(
                                  column.id,
                                ) >=
                                0
                              }
                              title="Click to sort. Shift+click for multi-sort."
                              onClick={(
                                event,
                              ) =>
                                handleSort(
                                  column.id as
                                  SortableColumnId,

                                  event.shiftKey,
                                )
                              }
                            >
                              <span>
                                {
                                  column.label
                                }
                              </span>

                              {renderSortIndicator(
                                column.id,
                              )}
                            </button>
                          ) : (
                            <span>
                              {
                                column.label
                              }
                            </span>
                          )}

                          {column.id !==
                            "actions" && (
                              <span
                                className="ppt-resizeHandle"
                                onPointerDown={(
                                  event,
                                ) =>
                                  startColumnResize(
                                    event,
                                    column,
                                  )
                                }
                              />
                            )}
                        </th>
                      );
                    },
                  )}
                </tr>
              </thead>

              <tbody>
                {settings.groupBy ===
                  "none" ? (
                  <>
                    {topSpacerHeight >
                      0 && (
                        <tr
                          aria-hidden="true"
                        >
                          <td
                            colSpan={
                              totalColSpan
                            }
                            className="ppt-spacerCell"
                            style={{
                              height:
                                topSpacerHeight,
                            }}
                          />
                        </tr>
                      )}

                    {virtualRows.map(
                      renderProtocolRow,
                    )}

                    {bottomSpacerHeight >
                      0 && (
                        <tr
                          aria-hidden="true"
                        >
                          <td
                            colSpan={
                              totalColSpan
                            }
                            className="ppt-spacerCell"
                            style={{
                              height:
                                bottomSpacerHeight,
                            }}
                          />
                        </tr>
                      )}
                  </>
                ) : (
                  groupedRows.map(
                    (group) => {
                      const collapsed =
                        collapsedGroups.has(
                          group.key,
                        );

                      return (
                        <FragmentGroup
                          key={
                            group.key
                          }
                          groupKey={
                            group.key
                          }
                          label={
                            group.label
                          }
                          count={
                            group.rows
                              .length
                          }
                          collapsed={
                            collapsed
                          }
                          colSpan={
                            totalColSpan
                          }
                          onToggle={() =>
                            toggleGroup(
                              group.key,
                            )
                          }
                        >
                          {!collapsed &&
                            group.rows.map(
                              renderProtocolRow,
                            )}
                        </FragmentGroup>
                      );
                    },
                  )
                )}

                {!sortedRows.length && (
                  <tr>
                    <td
                      colSpan={
                        totalColSpan
                      }
                      className="ppt-emptyTable"
                    >
                      No protocols match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      );
    },
  );

ProjectProtocolTable.displayName =
  "ProjectProtocolTable";

function FragmentGroup({
  groupKey,
  label,
  count,
  collapsed,
  colSpan,
  onToggle,
  children,
}: {
  groupKey: string;
  label: string;
  count: number;
  collapsed: boolean;
  colSpan: number;
  onToggle: () => void;
  children:
    React.ReactNode;
}) {
  return (
    <>
      <tr
        className="ppt-groupRow"
        data-group-key={
          groupKey
        }
      >
        <td
          colSpan={
            colSpan
          }
        >
          <button
            type="button"
            className="ppt-groupButton"
            onClick={
              onToggle
            }
          >
            {collapsed ? (
              <span>▶</span>
            ) : (
              <span>▼</span>
            )}

            <strong>
              {label}
            </strong>

            <span className="ppt-groupCount">
              {count}
            </span>
          </button>
        </td>
      </tr>

      {children}
    </>
  );
}

export default ProjectProtocolTable;