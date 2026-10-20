// src/components/tags/TagEditorDialog.tsx
// Create or edit one tag: title, description and a hex colour.
import { useState, type ChangeEvent, type FormEvent } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";

import { CloseIcon, HelpIcon } from "../../icons";
import {
  TAG_COLOR_PRESETS,
  TAG_DESCRIPTION_MAX_LENGTH,
  TAG_TITLE_MAX_LENGTH,
  isHexColor,
  toColorInputValue,
} from "@/utils/protocol_tags";
import { tagDialogPaperSx, tagOutlinedButtonSx, tagPalette, tagTextFieldSx } from "./tagStyles";

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
  const dialogTitle = mode === "create" ? "Create tag" : "Edit tag";
  const [helpOpen, setHelpOpen] = useState(false);
  const titleLength = draft.title.trim().length;
  const colorIsValid = isHexColor(draft.color);

  return (
    <>
      <Dialog
        open={open}
        onClose={isSaving ? undefined : onClose}
        maxWidth="sm"
        fullWidth
        aria-labelledby="tag-editor-title"
        slotProps={{ backdrop: { sx: { backgroundColor: tagPalette.backdrop, backdropFilter: "blur(2px)" } } }}
        PaperProps={{ sx: tagDialogPaperSx }}
      >
        <DialogTitle
          id="tag-editor-title"
          component="div"
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: tagPalette.header,
            color: "white",
            px: 2,
            py: 1.5,
          }}
        >
          <Typography component="h2" sx={{ fontWeight: 700, fontSize: 16, lineHeight: 1.2 }}>{dialogTitle}</Typography>
          <IconButton
            onClick={onClose}
            aria-label="Close"
            size="small"
            disabled={!!isSaving}
            sx={{ color: "white", backgroundColor: "rgba(255,255,255,0.12)", "&:hover": { backgroundColor: "rgba(255,255,255,0.20)" } }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ px: 2, py: 1.75, backgroundColor: tagPalette.panel, color: tagPalette.text }}>
          <Box
            component="form"
            noValidate
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              if (!isSaving) void onSave();
            }}
            sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 0.5 }}
          >
            <TextField
              label="Title"
              value={draft.title}
              onChange={(e) => onChange({ title: e.target.value })}
              fullWidth
              size="small"
              required
              autoFocus
              margin="dense"
              disabled={!!isSaving}
              error={titleLength > TAG_TITLE_MAX_LENGTH}
              helperText={`${titleLength}/${TAG_TITLE_MAX_LENGTH}`}
              sx={tagTextFieldSx}
            />
            <TextField
              label="Description (optional)"
              value={draft.description}
              onChange={(e) => onChange({ description: e.target.value })}
              fullWidth
              size="small"
              multiline
              minRows={2}
              margin="dense"
              disabled={!!isSaving}
              error={draft.description.trim().length > TAG_DESCRIPTION_MAX_LENGTH}
              sx={tagTextFieldSx}
            />

            <Box>
              <Typography sx={{ fontSize: 12, fontWeight: 700, mb: 0.75, color: tagPalette.text }}>Color</Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
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
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        border: "2px solid",
                        borderColor: isSelected ? tagPalette.text : tagPalette.border,
                        backgroundColor: c,
                        cursor: isSaving ? "default" : "pointer",
                        opacity: isSaving ? 0.65 : 1,
                        boxShadow: isSelected ? `0 0 0 3px ${tagPalette.border}` : "none",
                      }}
                    />
                  );
                })}
              </Box>
              <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, mt: 1 }}>
                <Box
                  component="input"
                  type="color"
                  value={toColorInputValue(draft.color)}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => onChange({ color: e.target.value })}
                  disabled={!!isSaving}
                  aria-label="Pick custom color"
                  sx={{
                    width: 40,
                    height: 40,
                    border: `1px solid ${tagPalette.border}`,
                    borderRadius: 1.5,
                    backgroundColor: "transparent",
                    padding: 0.25,
                    cursor: "pointer",
                  }}
                />
                <TextField
                  size="small"
                  value={draft.color}
                  onChange={(e) => onChange({ color: e.target.value.trim() })}
                  sx={{ ...tagTextFieldSx, width: 160 }}
                  inputProps={{ "aria-label": "Hex color", spellCheck: false }}
                  placeholder="#3b82f6"
                  disabled={!!isSaving}
                  error={!colorIsValid}
                  helperText={colorIsValid ? " " : "Use #rgb or #rrggbb"}
                />
              </Box>
            </Box>

            {note ? <Typography sx={{ fontSize: 12, color: tagPalette.textMuted }}>{note}</Typography> : null}

            {validationError ? (
              <Typography role="alert" sx={{ color: tagPalette.danger, fontSize: 12, fontWeight: 600, whiteSpace: "pre-wrap" }}>
                {validationError}
              </Typography>
            ) : null}

            {/* Enter in the title saves. */}
            <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
          </Box>
        </DialogContent>

        <DialogActions sx={{ justifyContent: "center", gap: 1, px: 2, py: 1.5, borderTop: `1px solid ${tagPalette.borderSoft}`, backgroundColor: tagPalette.panelSubtle }}>
          <Button variant="outlined" onClick={onClose} disabled={!!isSaving} sx={tagOutlinedButtonSx}>
            Cancel
          </Button>
          <Button variant="contained" onClick={() => void onSave()} disabled={!!isSaving} sx={{ textTransform: "none", minWidth: 112, borderRadius: 2, boxShadow: "none" }}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
          <Tooltip title="Help">
            <IconButton size="small" aria-label="Help" onClick={() => setHelpOpen(true)} sx={{ color: tagPalette.accent }}>
              <HelpIcon fontSize="1.1rem" />
            </IconButton>
          </Tooltip>
        </DialogActions>
      </Dialog>

      <Dialog
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        maxWidth="sm"
        fullWidth
        slotProps={{ backdrop: { sx: { backgroundColor: tagPalette.backdrop, backdropFilter: "blur(2px)" } } }}
        PaperProps={{ sx: tagDialogPaperSx }}
      >
        <DialogTitle sx={{ backgroundColor: tagPalette.header, color: "white", fontWeight: 700 }}>Help</DialogTitle>
        <DialogContent sx={{ backgroundColor: tagPalette.panel, color: tagPalette.text, pt: 2 }}>
          <Typography sx={{ fontSize: 13, lineHeight: 1.6, color: tagPalette.text, pt: 1.5 }}>
            The tag title identifies and filters protocols; it must be unique in the project and at most {TAG_TITLE_MAX_LENGTH} characters.
            The description is optional. Pick a color to recognize the tag quickly in chips and lists.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ backgroundColor: tagPalette.panelSubtle, borderTop: `1px solid ${tagPalette.borderSoft}` }}>
          <Button onClick={() => setHelpOpen(false)} variant="outlined" sx={tagOutlinedButtonSx}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
