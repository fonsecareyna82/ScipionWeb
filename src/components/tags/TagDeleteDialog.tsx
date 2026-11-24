// src/components/tags/TagDeleteDialog.tsx
// Asking before a tag is deleted: the tag as it looks, and how many protocols lose it.
import { Box, Stack, Typography } from "@mui/material";
import { Trash2 } from "lucide-react";

import { useIsDark } from "@/context/ThemeContext";
import SettingsDialog from "@/pages/Settings/SettingsDialog";
import type { ProtocolTag } from "./tagTypes";
import { TagChip } from "./TagEditorDialog";
import { deleteConfirmationText } from "./useTagList";

export default function TagDeleteDialog({ tag, usage, busy, onConfirm, onClose }: {
  tag: ProtocolTag | null;
  /** How many protocols use it, when it is known. */
  usage?: number;
  busy?: boolean;
  onConfirm: (tag: ProtocolTag) => void;
  onClose: () => void;
}) {
  const isDark = useIsDark();
  if (!tag) return null;
  const border = isDark ? "rgba(255,255,255,0.14)" : "#e2e8f0";
  const muted = isDark ? "#94a3b8" : "#64748b";
  return (
    <SettingsDialog
      title={`Delete tag “${tag.title}”?`}
      description="This cannot be undone. The protocols keep everything else."
      icon={<Trash2 size={20} color="#fca5a5" />}
      confirmLabel="Delete"
      busyLabel="Deleting…"
      busy={!!busy}
      destructive
      maxWidth="xs"
      closeButton
      onConfirm={() => onConfirm(tag)}
      onClose={onClose}
    >
      <Stack spacing={1.25}>
        <Box sx={{ border: `1px solid ${border}`, borderLeft: "4px solid #dc2626", borderRadius: 2, px: 1.5, py: 1.25 }}>
          <TagChip title={tag.title} color={tag.color} />
          {tag.description && (
            <Typography sx={{ fontSize: 13.5, color: muted, mt: 0.75, whiteSpace: "pre-wrap" }}>{tag.description}</Typography>
          )}
        </Box>
        <Typography sx={{ fontSize: 14.5, fontWeight: usage ? 700 : 400, color: usage ? "#b45309" : muted }}>
          {deleteConfirmationText(usage)}
        </Typography>
      </Stack>
    </SettingsDialog>
  );
}
