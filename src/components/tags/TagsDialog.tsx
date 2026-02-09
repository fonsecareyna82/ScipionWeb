// src/components/tags/TagsDialog.tsx
import React from "react";
import { Dialog, DialogTitle, DialogContent, DialogActions, Button } from "@mui/material";

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
          borderRadius: 4, // moreRoundedDialogPaper
        },
        "& .MuiDialogTitle-root": {
          borderTopLeftRadius: 16, // matchPaperRadiusInPx
          borderTopRightRadius: 16, // matchPaperRadiusInPx
        },
        "& .MuiDialogContent-root": {
          borderBottomLeftRadius: 16, // matchPaperRadiusInPx
          borderBottomRightRadius: 16, // matchPaperRadiusInPx
        },
      }}
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      // disableEnforceFocusToAvoidFocusTrapLoop
      disableEnforceFocus
      // disableAutoFocusToAvoidFocusTrapLoop
      disableAutoFocus
      // disableRestoreFocusToAvoidFocusTrapLoop
      disableRestoreFocus
    >
      <DialogTitle>{title ?? "Tags"}</DialogTitle>

      <DialogContent
        dividers
        sx={{
          // overflowVisibleToAvoidAutocompleteClippingWhenDisablePortalIsUsedSomewhere
          overflow: "visible",
        }}
      >
        {children}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} variant="outlined" sx={{ borderRadius: 2, backgroundColor: "#e0e0e0", color: "black", "&:hover": { backgroundColor: "#d5d5d5" }  }}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
