// src/components/tags/TagsSubmenu.tsx
// The "Tags" submenu of a protocol (graph card dropdown, its context menu and
// the table): toggle each tag on the target protocols, create one, or open
// the manager.
import { Check, Pencil, Plus, Tags } from "lucide-react";

import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import type { ProtocolTag } from "./tagTypes";

/** Whether every target has the tag, some of them, or none. */
export type TagCheckState = "all" | "some" | "none";

const PRIMITIVES = {
  dropdown: {
    Sub: DropdownMenuSub,
    SubTrigger: DropdownMenuSubTrigger,
    SubContent: DropdownMenuSubContent,
    Item: DropdownMenuItem,
    Separator: DropdownMenuSeparator,
  },
  context: {
    Sub: ContextMenuSub,
    SubTrigger: ContextMenuSubTrigger,
    SubContent: ContextMenuSubContent,
    Item: ContextMenuItem,
    Separator: ContextMenuSeparator,
  },
} as const;

type TagsSubmenuProps = {
  kind: "dropdown" | "context";
  tags: ProtocolTag[];
  loading?: boolean;
  getCheckState: (tagId: string) => TagCheckState;
  onToggle: (tagId: string) => void;
  onCreate: () => void;
  onManage?: () => void;
  contentClassName?: string;
};

type MenuSelectEvent = { preventDefault: () => void; stopPropagation?: () => void };

export function getTagCheckState(targets: string[][], tagId: string): TagCheckState {
  if (targets.length === 0) return "none";
  const count = targets.filter((assigned) => assigned.includes(tagId)).length;
  return count === 0 ? "none" : count === targets.length ? "all" : "some";
}

export default function TagsSubmenu({
  kind,
  tags,
  loading = false,
  getCheckState,
  onToggle,
  onCreate,
  onManage,
  contentClassName,
}: TagsSubmenuProps) {
  // The two menu libraries take the same props; one set of primitives each.
  const P = PRIMITIVES[kind] as typeof PRIMITIVES["dropdown"];

  return (
    <P.Sub>
      <P.SubTrigger>
        <span className="inline-flex items-center gap-2">
          <Tags className="size-4" />
          <span>Tags</span>
        </span>
      </P.SubTrigger>

      <P.SubContent className={["min-w-[13rem] max-w-[18rem]", contentClassName].filter(Boolean).join(" ")} sideOffset={8}>
        <P.Item onSelect={() => onCreate()}>
          <span className="inline-flex items-center gap-2">
            <Plus className="size-4" />
            <span>New tag…</span>
          </span>
        </P.Item>

        {onManage ? (
          <P.Item onSelect={() => onManage()}>
            <span className="inline-flex items-center gap-2">
              <Pencil className="size-4" />
              <span>Manage tags…</span>
            </span>
          </P.Item>
        ) : null}

        {tags.length > 0 || loading ? <P.Separator /> : null}

        {tags.length > 0 ? (
          <div className="max-h-72 overflow-y-auto">
            {tags.map((tag) => {
              const state = getCheckState(tag.id);
              return (
                <P.Item
                  key={tag.id}
                  role="menuitemcheckbox"
                  aria-checked={state === "all" ? true : state === "some" ? "mixed" : false}
                  onSelect={(event: MenuSelectEvent) => {
                    // Stay open, so several tags can be toggled in a row.
                    event.preventDefault();
                    event.stopPropagation?.();
                    onToggle(tag.id);
                  }}
                >
                  <span className="flex w-full min-w-0 items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="inline-block size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: tag.color, boxShadow: "0 0 0 1px var(--app-n-400)" }}
                    />
                    <span className="min-w-0 flex-1 truncate" title={tag.description || tag.title}>
                      {tag.title}
                    </span>
                    <span className="inline-flex size-4 shrink-0 items-center justify-center">
                      {state === "all" ? (
                        <Check className="size-4" />
                      ) : state === "some" ? (
                        <span aria-hidden="true" className="h-0.5 w-2.5 rounded bg-current" />
                      ) : null}
                    </span>
                  </span>
                </P.Item>
              );
            })}
          </div>
        ) : loading ? (
          <P.Item disabled>
            <span>Loading tags…</span>
          </P.Item>
        ) : null}
      </P.SubContent>
    </P.Sub>
  );
}
