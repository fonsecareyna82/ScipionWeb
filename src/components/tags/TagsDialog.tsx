// src/components/tags/TagsDialog.tsx
// The project's "Manage tags": its tags to look at and change, in the dialogs' own look.
import React from "react";
import { Tag } from "lucide-react";

import { ViewDialog } from "@/pages/Facility/DialogParts";

type TagsDialogProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
};

export default function TagsDialog({ open, onClose, title, children }: TagsDialogProps) {
  if (!open) return null;
  return (
    <ViewDialog icon={<Tag size={20} color="white" />} title={title ?? "Tags"}
                subtitle="Labels to group and filter the protocols of this project." onClose={onClose}>
      {children}
    </ViewDialog>
  );
}
