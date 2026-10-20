// src/components/tags/TagsDialog.tsx
import React from "react";
import { Dialog, DialogTitle, DialogContent, DialogActions, Button } from "@mui/material";

import { tagOutlinedButtonSx, tagPalette } from "./tagStyles";

type TagsDialogProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
};

export default function TagsDialog({ open, onClose, title, children }: TagsDialogProps) {
  return (
    <Dialog
      sx={{
        "& .MuiDialog-paper": {
          overflow: "visible",
          borderRadius: 4,
          border: "1px solid",
          borderColor: tagPalette.borderSoft,
          backgroundImage: "none",
          backgroundColor: tagPalette.panel,
          color: tagPalette.text,
          boxShadow: tagPalette.shadow,
        },
        "& .MuiDialogTitle-root": {
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          backgroundColor: tagPalette.header,
          color: "#ffffff",
          fontWeight: 700,
          fontSize: 16,
          px: 2,
          py: 1.5,
        },
        "& .MuiDialogContent-root": {
          borderColor: tagPalette.borderSoft,
          backgroundColor: tagPalette.panel,
          color: tagPalette.text,
        },
        "& .MuiDialogActions-root": {
          borderTop: "1px solid",
          borderColor: tagPalette.borderSoft,
          backgroundColor: tagPalette.panelSubtle,
          px: 2,
          py: 1.5,
        },
      }}
      slotProps={{
        backdrop: {
          sx: {
            backgroundColor: tagPalette.backdrop,
            backdropFilter: "blur(2px)",
          },
        },
      }}
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      aria-labelledby="tags-dialog-title"
    >
      <DialogTitle id="tags-dialog-title">{title ?? "Tags"}</DialogTitle>

      <DialogContent dividers sx={{ textTransform: "none" }}>
        {children}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} variant="outlined" disableElevation sx={{ ...tagOutlinedButtonSx, fontWeight: 600 }}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
