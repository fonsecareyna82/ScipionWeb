// src/components/tags/TagManager.tsx
// Lists, creates, edits and deletes the tags of one project.
import { memo } from "react";
import { Box } from "@mui/material";

import type { ProtocolTag } from "./tagTypes";
import TagEditorDialog from "./TagEditorDialog";
import TagList, { type TagListColors } from "./TagList";
import TagDeleteDialog from "./TagDeleteDialog";
import { tagOutlinedButtonSx, tagPalette, tagTextFieldSx } from "./tagStyles";
import { useTagList } from "./useTagList";
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

      <TagDeleteDialog tag={confirmDelete} usage={usage} busy={!!(confirmDelete && deletingIds[confirmDelete.id])}
                       onConfirm={(tag) => void deleteTag(tag)} onClose={() => setConfirmDelete(null)} />
    </Box>
  );
});

export default TagManager;
