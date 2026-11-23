// src/components/tags/TagManager.tsx
// Lists, creates, edits and deletes the tags of one project.
import { memo } from "react";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";

import type { ProtocolTag } from "./tagTypes";
import TagEditorDialog from "./TagEditorDialog";
import TagList, { type TagListColors } from "./TagList";
import { tagDialogPaperSx, tagOutlinedButtonSx, tagPalette, tagTextFieldSx } from "./tagStyles";
import { deleteConfirmationText, useTagList } from "./useTagList";
import type { Id } from "@/services/ProjectService";

const LIST_COLORS: TagListColors = {
  border: tagPalette.borderSoft,
  text: tagPalette.text,
  muted: tagPalette.textMuted,
  hover: tagPalette.rowHover,
  ring: tagPalette.row,
};
const EDIT_BUTTON_SX = { ...tagOutlinedButtonSx, minWidth: 0, fontSize: 13.5, fontWeight: 600 };
const NEW_BUTTON_SX = { textTransform: "none", borderRadius: 2, boxShadow: "none", fontSize: 13.5, fontWeight: 700,
                        "&:hover": { boxShadow: "none" } } as const;

type TagManagerProps = {
  projectId: Id;
  open?: boolean;
  /** The list after it loaded or changed. */
  onTagsChange?: (next: ProtocolTag[]) => void;
  /** A tag was deleted; the server removed it from its protocols. */
  onTagDeleted?: (tagId: string) => void;
  /** How many protocols use the tag, for the delete confirmation. */
  getUsageCount?: (tagId: string) => number;
};

const TagManager = memo(function TagManager({
  projectId,
  open = true,
  onTagsChange,
  onTagDeleted,
  getUsageCount,
}: TagManagerProps) {
  const {
    tags, isLoading, isSaving, deletingIds, editor, openCreate, openEdit, closeEditor, changeDraft, saveDraft,
    confirmDelete, setConfirmDelete, deleteTag,
  } = useTagList({ projectId, open, onTagsChange, onTagDeleted });

  const usage = confirmDelete && getUsageCount ? getUsageCount(confirmDelete.id) : undefined;

  return (
    <Box sx={{ color: tagPalette.text }}>
      <TagList
        tags={tags}
        isLoading={isLoading}
        deletingIds={deletingIds}
        colors={LIST_COLORS}
        buttonSx={EDIT_BUTTON_SX}
        fieldSx={tagTextFieldSx}
        onCreate={openCreate}
        newButtonSx={NEW_BUTTON_SX}
        onEdit={openEdit}
        onDelete={setConfirmDelete}
        getUsageCount={getUsageCount}
        emptyHint="Make one with New tag, then give it to protocols from their menu."
      />

      <TagEditorDialog
        open={editor.open}
        mode={editor.mode}
        draft={editor.draft}
        onChange={changeDraft}
        onClose={closeEditor}
        onSave={saveDraft}
        isSaving={isSaving}
        validationError={editor.validationError}
      />

      <Dialog
        open={confirmDelete != null}
        onClose={() => setConfirmDelete(null)}
        maxWidth="xs"
        fullWidth
        aria-labelledby="tag-delete-title"
        slotProps={{ backdrop: { sx: { backgroundColor: tagPalette.backdrop } } }}
        PaperProps={{ sx: tagDialogPaperSx }}
      >
        <DialogTitle id="tag-delete-title" sx={{ backgroundColor: tagPalette.header, color: "white", fontWeight: 700, fontSize: 16, px: 2, py: 1.5 }}>
          Delete tag “{confirmDelete?.title}”?
        </DialogTitle>
        <DialogContent sx={{ backgroundColor: tagPalette.panel, color: tagPalette.text, px: 2 }}>
          <Typography sx={{ fontSize: 14, pt: 2 }}>{deleteConfirmationText(usage)}</Typography>
        </DialogContent>
        <DialogActions sx={{ gap: 1, px: 2, py: 1.5, borderTop: `1px solid ${tagPalette.borderSoft}`, backgroundColor: tagPalette.panelSubtle }}>
          <Button variant="outlined" onClick={() => setConfirmDelete(null)} sx={tagOutlinedButtonSx}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => confirmDelete && void deleteTag(confirmDelete)}
            sx={{ textTransform: "none", minWidth: 112, borderRadius: 2, boxShadow: "none" }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
});

export default TagManager;
