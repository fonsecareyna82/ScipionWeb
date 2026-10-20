// src/components/tags/TagManager.tsx
// Lists, creates, edits and deletes the tags of one project.
import { memo, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Tooltip,
  Typography,
} from "@mui/material";

import { TrashBinIcon } from "../../icons";
import type { ProtocolTag } from "./tagTypes";
import TagEditorDialog, { type TagDraft } from "./TagEditorDialog";
import { tagDialogPaperSx, tagOutlinedButtonSx, tagPalette } from "./tagStyles";
import { useProjectService } from "@/ProjectServiceContext";
import type { Id } from "@/services/ProjectService";
import {
  DEFAULT_TAG_COLOR,
  normalizeTag,
  normalizeTagList,
  sortTags,
  apiErrorMessage,
  validateTagDraft,
} from "@/utils/protocol_tags";

type TagManagerProps = {
  title?: string;
  projectId: Id;
  open?: boolean;
  /** The list after it loaded or changed. */
  onTagsChange?: (next: ProtocolTag[]) => void;
  /** A tag was deleted; the server removed it from its protocols. */
  onTagDeleted?: (tagId: string) => void;
  /** How many protocols use the tag, for the delete confirmation. */
  getUsageCount?: (tagId: string) => number;
};

function deleteConfirmationText(count: number | undefined): string {
  if (count == null) return "It will be removed from every protocol that uses it.";
  if (count === 0) return "No protocol uses it.";
  return count === 1
    ? "It is used by 1 protocol and will be removed from it."
    : `It is used by ${count} protocols and will be removed from them.`;
}

const TagManager = memo(function TagManager({
  title,
  projectId,
  open = true,
  onTagsChange,
  onTagDeleted,
  getUsageCount,
}: TagManagerProps) {
  const svc = useProjectService();
  const svcRef = useRef(svc);
  svcRef.current = svc;
  const onTagsChangeRef = useRef(onTagsChange);
  onTagsChangeRef.current = onTagsChange;

  const [tags, setTags] = useState<ProtocolTag[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Record<string, boolean>>({});
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
  const [draft, setDraft] = useState<TagDraft>({ title: "", description: "", color: DEFAULT_TAG_COLOR });
  const [validationError, setValidationError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ProtocolTag | null>(null);

  const commitTags = (next: ProtocolTag[]) => {
    const sorted = sortTags(next);
    setTags(sorted);
    onTagsChangeRef.current?.(sorted);
  };

  useEffect(() => {
    if (!open || projectId == null || String(projectId).trim() === "") return;

    let cancelled = false;
    setIsLoading(true);
    void (async () => {
      try {
        const remote = await svcRef.current.listProjectTags(projectId);
        if (cancelled) return;
        const list = sortTags(normalizeTagList(remote));
        setTags(list);
        onTagsChangeRef.current?.(list);
      } catch (e) {
        if (!cancelled) toast.error(apiErrorMessage(e, "Failed to load tags"));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, open]);

  const openCreate = () => {
    setValidationError(null);
    setEditorMode("create");
    setDraft({ title: "", description: "", color: DEFAULT_TAG_COLOR });
    setEditorOpen(true);
  };

  const openEdit = (tag: ProtocolTag) => {
    setValidationError(null);
    setEditorMode("edit");
    setDraft({ id: tag.id, title: tag.title, description: tag.description ?? "", color: tag.color ?? DEFAULT_TAG_COLOR });
    setEditorOpen(true);
  };

  const saveDraft = async () => {
    const err = validateTagDraft(draft, tags);
    if (err) {
      setValidationError(err);
      return;
    }
    const payload = {
      title: draft.title.trim(),
      // An empty description clears it on the server.
      description: draft.description.trim() ? draft.description.trim() : null,
      color: draft.color,
    };

    setIsSaving(true);
    setValidationError(null);
    try {
      if (editorMode === "create") {
        const created = normalizeTag(await svcRef.current.createProjectTag(projectId, payload));
        if (!created) throw new Error("Invalid tag response");
        commitTags([...tags.filter((tag) => tag.id !== created.id), created]);
      } else {
        if (!draft.id) {
          setValidationError("Missing tag id.");
          return;
        }
        const updated = normalizeTag(await svcRef.current.updateProjectTag(projectId, draft.id, payload));
        if (!updated) throw new Error("Invalid tag response");
        commitTags(tags.map((tag) => (tag.id === draft.id ? updated : tag)));
      }
      setEditorOpen(false);
    } catch (e) {
      // The server explains a duplicate title (409) or an invalid field (422).
      setValidationError(apiErrorMessage(e, "Failed to save tag"));
    } finally {
      setIsSaving(false);
    }
  };

  const deleteTag = async (tag: ProtocolTag) => {
    const tid = tag.id;
    setConfirmDelete(null);
    setDeletingIds((prev) => ({ ...prev, [tid]: true }));
    try {
      await svcRef.current.deleteProjectTag(projectId, tid);
      commitTags(tags.filter((t) => t.id !== tid));
      onTagDeleted?.(tid);
    } catch (e: any) {
      if (e?.status === 404) {
        // Someone else deleted it already: the result is the same.
        commitTags(tags.filter((t) => t.id !== tid));
        onTagDeleted?.(tid);
      } else {
        toast.error(apiErrorMessage(e, "Failed to delete tag"));
      }
    } finally {
      setDeletingIds((prev) => {
        const next = { ...prev };
        delete next[tid];
        return next;
      });
    }
  };

  const usage = confirmDelete && getUsageCount ? getUsageCount(confirmDelete.id) : undefined;

  return (
    <Box sx={{ border: `1px solid ${tagPalette.border}`, borderRadius: 3, backgroundColor: tagPalette.panel, color: tagPalette.text, overflow: "hidden", boxShadow: tagPalette.shadow }}>
      <Box sx={{ px: 1.75, py: 1.35, backgroundColor: tagPalette.header, color: "white", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
        <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 14, lineHeight: 1.25, color: "white" }}>{title ?? "Tags"}</Typography>
          {isLoading ? <CircularProgress size={14} sx={{ color: "rgba(255,255,255,0.88)" }} /> : null}
        </Box>
        <Button variant="contained" color="success" onClick={openCreate} disabled={isLoading} sx={{ textTransform: "none", borderRadius: 2, boxShadow: "none", fontWeight: 700, "&:hover": { boxShadow: "none" } }}>
          New tag
        </Button>
      </Box>

      <Box sx={{ p: 1.5, backgroundColor: tagPalette.panel }}>
        {tags.length === 0 ? (
          <Box sx={{ border: `1px dashed ${tagPalette.border}`, borderRadius: 2.5, px: 1.5, py: 1.25, backgroundColor: tagPalette.row }}>
            <Typography sx={{ fontSize: 12, color: tagPalette.textMuted }}>{isLoading ? "Loading tags..." : "No tags yet."}</Typography>
          </Box>
        ) : (
          <Box component="ul" sx={{ display: "flex", flexDirection: "column", gap: 1, listStyle: "none", m: 0, p: 0 }}>
            {tags.map((tag) => {
              const isDeleting = !!deletingIds[tag.id];
              return (
                <Box component="li" key={tag.id} sx={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "center", gap: 1, border: `1px solid ${tagPalette.borderSoft}`, borderRadius: 2.5, px: 1.25, py: 1, opacity: isDeleting ? 0.65 : 1, backgroundColor: tagPalette.row, "&:hover": { borderColor: tagPalette.border, backgroundColor: tagPalette.rowHover } }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
                      <Box aria-hidden="true" sx={{ width: 11, height: 11, borderRadius: "50%", backgroundColor: tag.color, boxShadow: "0 0 0 1px var(--app-n-400)", flex: "0 0 auto" }} />
                      <Typography sx={{ fontWeight: 700, fontSize: 13, color: tagPalette.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={tag.title}>
                        {tag.title}
                      </Typography>
                    </Box>
                    {tag.description ? <Typography sx={{ fontSize: 12, color: tagPalette.textMuted, mt: 0.35, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{tag.description}</Typography> : null}
                  </Box>
                  <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
                    <Button size="small" variant="contained" onClick={() => openEdit(tag)} disabled={isDeleting || isLoading} aria-label={`Edit tag ${tag.title}`} sx={{ textTransform: "none", borderRadius: 2, boxShadow: "none", "&:hover": { boxShadow: "none" } }}>
                      Edit
                    </Button>
                    <Tooltip title="Delete">
                      <span>
                        <IconButton
                          size="small"
                          aria-label={`Delete tag ${tag.title}`}
                          onClick={() => setConfirmDelete(tag)}
                          disabled={isDeleting || isLoading}
                          sx={{ color: tagPalette.danger, borderRadius: 2, "&:hover": { backgroundColor: tagPalette.dangerHover } }}
                        >
                          <TrashBinIcon fontSize="1.2rem" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
      </Box>

      <TagEditorDialog
        open={editorOpen}
        mode={editorMode}
        draft={draft}
        onChange={(patch) => setDraft((prev) => ({ ...prev, ...patch }))}
        onClose={() => {
          if (!isSaving) setEditorOpen(false);
        }}
        onSave={saveDraft}
        isSaving={isSaving}
        validationError={validationError}
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
          <Typography sx={{ fontSize: 13, pt: 2 }}>{deleteConfirmationText(usage)}</Typography>
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
