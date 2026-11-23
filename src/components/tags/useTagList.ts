// src/components/tags/useTagList.ts
// The tags of one project and what can be done with them: load, create, edit, delete. Shared by every screen that
// manages tags, each with its own look.
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

import type { ProtocolTag } from "./tagTypes";
import type { TagDraft } from "./TagEditorDialog";
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

export function deleteConfirmationText(count: number | undefined): string {
  if (count == null) return "It will be removed from every protocol that uses it.";
  if (count === 0) return "No protocol uses it.";
  return count === 1
    ? "It is used by 1 protocol and will be removed from it."
    : `It is used by ${count} protocols and will be removed from them.`;
}

export function useTagList({ projectId, open = true, onTagsChange, onTagDeleted }: {
  projectId: Id | null;
  open?: boolean;
  /** The list after it loaded or changed. */
  onTagsChange?: (next: ProtocolTag[]) => void;
  /** A tag was deleted; the server removed it from its protocols. */
  onTagDeleted?: (tagId: string) => void;
}) {
  const svc = useProjectService();
  const svcRef = useRef(svc);
  svcRef.current = svc;
  const onTagsChangeRef = useRef(onTagsChange);
  onTagsChangeRef.current = onTagsChange;
  const onTagDeletedRef = useRef(onTagDeleted);
  onTagDeletedRef.current = onTagDeleted;

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

  const closeEditor = () => {
    if (!isSaving) setEditorOpen(false);
  };

  const changeDraft = (patch: Partial<TagDraft>) => setDraft((prev) => ({ ...prev, ...patch }));

  const saveDraft = async () => {
    if (projectId == null) return;
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
    if (projectId == null) return;
    const tid = tag.id;
    setConfirmDelete(null);
    setDeletingIds((prev) => ({ ...prev, [tid]: true }));
    try {
      await svcRef.current.deleteProjectTag(projectId, tid);
      commitTags(tags.filter((t) => t.id !== tid));
      onTagDeletedRef.current?.(tid);
    } catch (e) {
      if ((e as { status?: number } | null)?.status === 404) {
        // Someone else deleted it already: the result is the same.
        commitTags(tags.filter((t) => t.id !== tid));
        onTagDeletedRef.current?.(tid);
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

  return {
    tags, isLoading, isSaving, deletingIds,
    editor: { open: editorOpen, mode: editorMode, draft, validationError },
    openCreate, openEdit, closeEditor, changeDraft, saveDraft,
    confirmDelete, setConfirmDelete, deleteTag,
  };
}
