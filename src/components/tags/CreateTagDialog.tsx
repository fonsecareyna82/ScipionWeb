// src/components/tags/CreateTagDialog.tsx
// "New tag…" from a protocol's Tags submenu: creates the tag and gives it to
// the protocols the menu was opened on.
import { useEffect, useState } from "react";

import TagEditorDialog, { type TagDraft } from "./TagEditorDialog";
import type { ProtocolTag } from "./tagTypes";
import type { ProtocolTagCreatePayload } from "@/services/ProjectService";
import { DEFAULT_TAG_COLOR, apiErrorMessage, validateTagDraft } from "@/utils/protocol_tags";

type CreateTagDialogProps = {
  open: boolean;
  targetCount: number;
  existingTags: ProtocolTag[];
  onCreate: (payload: ProtocolTagCreatePayload) => Promise<unknown>;
  onClose: () => void;
};

const emptyDraft = (): TagDraft => ({ title: "", description: "", color: DEFAULT_TAG_COLOR });

export default function CreateTagDialog({ open, targetCount, existingTags, onCreate, onClose }: CreateTagDialogProps) {
  const [draft, setDraft] = useState<TagDraft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(emptyDraft());
    setError(null);
  }, [open]);

  const save = async () => {
    const invalid = validateTagDraft(draft, existingTags);
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onCreate({
        title: draft.title.trim(),
        description: draft.description.trim() || null,
        color: draft.color,
      });
      onClose();
    } catch (e) {
      // 409 (title in use) and 422 come with a readable message.
      setError(apiErrorMessage(e, "Failed to create tag"));
    } finally {
      setSaving(false);
    }
  };

  const note =
    targetCount > 1
      ? `The new tag will be added to the ${targetCount} selected protocols.`
      : targetCount === 1
        ? "The new tag will be added to this protocol."
        : undefined;

  return (
    <TagEditorDialog
      open={open}
      mode="create"
      draft={draft}
      onChange={(patch) => setDraft((prev) => ({ ...prev, ...patch }))}
      onClose={() => {
        if (!saving) onClose();
      }}
      onSave={save}
      isSaving={saving}
      validationError={error}
      note={note}
    />
  );
}
