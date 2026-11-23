// src/components/tags/TagList.tsx
// The tags of a project as a list: how many, a search when there are many, and one row per tag with Edit and Delete.
// Shared by Settings → Tags and the project's "Manage tags", so both look and work the same.
import { useMemo, useState, type ReactNode } from "react";
import {
  Box, Button, CircularProgress, IconButton, InputAdornment, Stack, TextField, Tooltip, Typography,
  type SxProps, type Theme,
} from "@mui/material";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";

import type { ProtocolTag } from "./tagTypes";

export type TagListColors = { border: string; text: string; muted: string; hover: string; ring: string };

const TEXT = { title: 15, text: 13.5, control: 14 } as const;
const DANGER = "#dc2626";

function usageText(count: number): string {
  if (count === 0) return "Not used";
  return count === 1 ? "1 protocol" : `${count} protocols`;
}

export default function TagList({
  tags, isLoading, deletingIds, colors, buttonSx, fieldSx, onEdit, onDelete, onCreate, newButtonSx, getUsageCount,
  emptyHint,
}: {
  tags: ProtocolTag[];
  isLoading: boolean;
  deletingIds: Record<string, boolean>;
  colors: TagListColors;
  buttonSx: SxProps<Theme>;
  fieldSx?: SxProps<Theme>;
  onEdit: (tag: ProtocolTag) => void;
  onDelete: (tag: ProtocolTag) => void;
  /** When given, a "New tag" button sits next to the count. */
  onCreate?: () => void;
  newButtonSx?: SxProps<Theme>;
  /** How many protocols use each tag, when it is known. */
  getUsageCount?: (tagId: string) => number;
  emptyHint: ReactNode;
}) {
  const [search, setSearch] = useState("");

  const shown = useMemo(() => {
    const words = search.trim().toLowerCase();
    if (!words) return tags;
    return tags.filter((tag) => `${tag.title} ${tag.description ?? ""}`.toLowerCase().includes(words));
  }, [tags, search]);

  return (
    <Box>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}
             justifyContent="space-between" sx={{ mb: 1.5 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography sx={{ fontSize: TEXT.title, fontWeight: 700, color: colors.text }}>
            {isLoading ? "Loading tags…" : tags.length === 1 ? "1 tag" : `${tags.length} tags`}
          </Typography>
          {isLoading && <CircularProgress size={14} />}
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center">
          {tags.length > 6 && (
            <TextField size="small" sx={{ ...(fieldSx as object), width: { xs: "100%", sm: 240 } }} value={search}
                       placeholder="Search tags" aria-label="Search tags"
                       onChange={(e) => setSearch(e.target.value)}
                       InputProps={{ startAdornment: (
                         <InputAdornment position="start"><Search size={16} /></InputAdornment>
                       ) }} />
          )}
          {onCreate && (
            <Button size="small" variant="contained" sx={newButtonSx} startIcon={<Plus size={15} />}
                    disabled={isLoading} onClick={onCreate}>
              New tag
            </Button>
          )}
        </Stack>
      </Stack>

      {!isLoading && tags.length === 0 && (
        <Box sx={{ border: `1px dashed ${colors.border}`, borderRadius: 2, px: 2, py: 2.5, textAlign: "center" }}>
          <Typography sx={{ fontSize: TEXT.title, fontWeight: 700, color: colors.text }}>
            No tags in this project yet.
          </Typography>
          <Typography sx={{ fontSize: TEXT.text, color: colors.muted, mt: 0.5 }}>{emptyHint}</Typography>
        </Box>
      )}

      {shown.length > 0 && (
        <Box component="ul" aria-label="Tags"
             sx={{ listStyle: "none", m: 0, p: 0, border: `1px solid ${colors.border}`, borderRadius: 2, overflow: "hidden" }}>
          {shown.map((tag, index) => {
            const deleting = Boolean(deletingIds[tag.id]);
            const usage = getUsageCount?.(tag.id);
            return (
              <Box component="li" key={tag.id}
                   sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 2, py: 1.25, opacity: deleting ? 0.55 : 1,
                         borderTop: index > 0 ? `1px solid ${colors.border}` : "none",
                         "&:hover": { bgcolor: colors.hover } }}>
                <Box aria-hidden sx={{ width: 14, height: 14, borderRadius: "50%", flexShrink: 0, bgcolor: tag.color,
                                       boxShadow: `0 0 0 3px ${colors.ring}` }} />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: TEXT.title, fontWeight: 700, color: colors.text, overflow: "hidden",
                                      textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={tag.title}>
                      {tag.title}
                    </Typography>
                    {usage != null && (
                      <Box component="span" sx={{ flexShrink: 0, px: 1, borderRadius: 10, fontSize: TEXT.text - 0.5,
                                                  fontWeight: 600, color: colors.muted, bgcolor: colors.ring,
                                                  lineHeight: 1.7, whiteSpace: "nowrap" }}>
                        {usageText(usage)}
                      </Box>
                    )}
                  </Stack>
                  {tag.description && (
                    <Typography sx={{ fontSize: TEXT.text, color: colors.muted, whiteSpace: "pre-wrap",
                                      wordBreak: "break-word" }}>
                      {tag.description}
                    </Typography>
                  )}
                </Box>
                <Button size="small" variant="outlined" sx={buttonSx} startIcon={<Pencil size={14} />}
                        disabled={deleting || isLoading} aria-label={`Edit tag ${tag.title}`} onClick={() => onEdit(tag)}>
                  Edit
                </Button>
                <Tooltip title="Delete">
                  <span>
                    <IconButton size="small" aria-label={`Delete tag ${tag.title}`} disabled={deleting || isLoading}
                                sx={{ color: DANGER }} onClick={() => onDelete(tag)}>
                      <Trash2 size={17} />
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>
            );
          })}
        </Box>
      )}
      {tags.length > 0 && shown.length === 0 && (
        <Typography sx={{ fontSize: TEXT.text, color: colors.muted, py: 1 }}>No tag matches the search.</Typography>
      )}
    </Box>
  );
}
