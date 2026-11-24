// src/components/tags/TagEditorDialog.tsx
// Create or edit one tag: title, description and a hex colour, with how the tag will look.
import type { ChangeEvent, FormEvent } from "react";
import { Alert, Box, Stack, TextField, Typography } from "@mui/material";
import { Palette, Tag } from "lucide-react";

import { useIsDark } from "@/context/ThemeContext";
import SettingsDialog from "@/pages/Settings/SettingsDialog";
import { sectionTint } from "@/pages/Settings/SettingsSection";
import { DialogPart } from "@/pages/Facility/DialogParts";
import {
  TAG_COLOR_PRESETS,
  TAG_DESCRIPTION_MAX_LENGTH,
  TAG_TITLE_MAX_LENGTH,
  isHexColor,
  toColorInputValue,
} from "@/utils/protocol_tags";

export type TagDraft = {
  id?: string;
  title: string;
  description: string;
  color: string;
};

type TagEditorDialogProps = {
  open: boolean;
  mode: "create" | "edit";
  draft: TagDraft;
  onChange: (patch: Partial<TagDraft>) => void;
  onClose: () => void;
  onSave: () => void | Promise<void>;
  isSaving?: boolean;
  validationError?: string | null;
  /** A line under the fields, e.g. which protocols get the new tag. */
  note?: string;
};

/** A tag as the protocols show it: its colour and its title. */
export function TagChip({ title, color, size = "medium" }: { title: string; color: string; size?: "small" | "medium" }) {
  const shown = isHexColor(color) ? color : "#94a3b8";
  return (
    <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, maxWidth: "100%",
                                px: size === "small" ? 1 : 1.25, py: size === "small" ? 0.15 : 0.4, borderRadius: 10,
                                fontSize: size === "small" ? 13 : 14.5, fontWeight: 700, color: shown,
                                bgcolor: `${shown}1f`, border: `1px solid ${shown}55` }}>
      <Box component="span" sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: shown, flexShrink: 0 }} />
      <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</Box>
    </Box>
  );
}

export default function TagEditorDialog({
  open,
  mode,
  draft,
  onChange,
  onClose,
  onSave,
  isSaving,
  validationError,
  note,
}: TagEditorDialogProps) {
  const isDark = useIsDark();
  const tint = sectionTint(isDark);
  const colors = isDark
    ? { border: "rgba(255,255,255,0.14)", text: "#f1f5f9", muted: "#94a3b8" }
    : { border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };
  const titleLength = draft.title.trim().length;
  const colorIsValid = isHexColor(draft.color);

  if (!open) return null;

  return (
    <SettingsDialog
      title={mode === "create" ? "New tag" : `Edit tag ${draft.title.trim() ? `“${draft.title.trim()}”` : ""}`.trim()}
      description="A label to group and filter the protocols of the project. Its title is unique in the project."
      icon={<Tag size={20} color="white" />}
      confirmLabel="Save"
      busyLabel="Saving…"
      busy={!!isSaving}
      maxWidth="sm"
      closeButton
      onConfirm={() => void onSave()}
      onClose={onClose}
    >
      <Box
        component="form"
        noValidate
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          if (!isSaving) void onSave();
        }}
      >
        <Stack spacing={2}>
          <Box sx={{ borderRadius: 2.5, bgcolor: tint, px: 2, py: 1.5, display: "flex", alignItems: "center", gap: 1.5,
                     flexWrap: "wrap" }}>
            <Typography sx={{ fontSize: 13.5, color: colors.muted }}>It will look like</Typography>
            <TagChip title={draft.title.trim() || "New tag"} color={draft.color} />
          </Box>

          <DialogPart icon={<Tag size={18} />} title="The tag" tint={tint} colors={colors}>
            <TextField
              label="Title"
              value={draft.title}
              onChange={(e) => onChange({ title: e.target.value })}
              fullWidth
              size="small"
              required
              autoFocus
              disabled={!!isSaving}
              error={titleLength > TAG_TITLE_MAX_LENGTH}
              helperText={`${titleLength}/${TAG_TITLE_MAX_LENGTH}`}
              FormHelperTextProps={{ sx: { fontSize: 13, textAlign: "right", mr: 0 } }}
            />
            <TextField
              label="Description (optional)"
              value={draft.description}
              onChange={(e) => onChange({ description: e.target.value })}
              fullWidth
              size="small"
              multiline
              minRows={2}
              disabled={!!isSaving}
              error={draft.description.trim().length > TAG_DESCRIPTION_MAX_LENGTH}
              placeholder="What the protocols with this tag have in common"
            />
          </DialogPart>

          <DialogPart icon={<Palette size={18} />} title="Colour" tint={tint} colors={colors}
                      subtitle="To recognise the tag at a glance in the lists and the graph.">
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, flexWrap: "wrap" }}>
              {TAG_COLOR_PRESETS.map((c) => {
                const isSelected = c.toLowerCase() === String(draft.color).toLowerCase();
                return (
                  <Box
                    key={c}
                    component="button"
                    type="button"
                    onClick={() => onChange({ color: c })}
                    disabled={!!isSaving}
                    aria-label={`Pick color ${c}`}
                    aria-pressed={isSelected}
                    sx={{
                      width: 30, height: 30, p: 0, borderRadius: "50%", border: "3px solid",
                      borderColor: isSelected ? colors.text : "transparent", backgroundColor: c,
                      cursor: isSaving ? "default" : "pointer", opacity: isSaving ? 0.65 : 1,
                      boxShadow: isSelected ? `0 0 0 2px ${c}` : "none", transition: "transform 120ms",
                      "&:hover": { transform: "scale(1.1)" },
                    }}
                  />
                );
              })}
            </Box>
            <Stack direction="row" spacing={1.25} alignItems="flex-start">
              <Box
                component="input"
                type="color"
                value={toColorInputValue(draft.color)}
                onChange={(e: ChangeEvent<HTMLInputElement>) => onChange({ color: e.target.value })}
                disabled={!!isSaving}
                aria-label="Pick custom color"
                sx={{ width: 42, height: 40, border: `1px solid ${colors.border}`, borderRadius: 1.5, backgroundColor: "transparent",
                      padding: 0.25, cursor: "pointer", flexShrink: 0 }}
              />
              <TextField
                size="small"
                label="Another colour"
                value={draft.color}
                onChange={(e) => onChange({ color: e.target.value.trim() })}
                sx={{ width: 180 }}
                inputProps={{ "aria-label": "Hex color", spellCheck: false, style: { fontFamily: "monospace" } }}
                placeholder="#3b82f6"
                disabled={!!isSaving}
                error={!colorIsValid}
                helperText={colorIsValid ? " " : "Use #rgb or #rrggbb"}
                FormHelperTextProps={{ sx: { fontSize: 13 } }}
              />
            </Stack>
          </DialogPart>

          {note ? <Typography sx={{ fontSize: 13.5, color: colors.muted }}>{note}</Typography> : null}

          {validationError ? (
            <Alert severity="error" role="alert" sx={{ fontSize: 13.5, whiteSpace: "pre-wrap" }}>{validationError}</Alert>
          ) : null}

          {/* Enter in the title saves. */}
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </Stack>
      </Box>
    </SettingsDialog>
  );
}
