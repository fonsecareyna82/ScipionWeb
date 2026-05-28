// src/components/tags/TagsDialog.tsx
import React from "react";
import { Dialog, DialogTitle, DialogContent, DialogActions, Button } from "@mui/material";
import "./tag-dark-overrides.css";

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
          borderColor: (theme) => theme.palette.mode === "dark" ? "rgba(148,163,184,0.24)" : "rgba(203,213,225,0.95)",
          backgroundImage: "none",
          backgroundColor: (theme) => theme.palette.mode === "dark" ? "#0f172a" : "#ffffff",
          color: (theme) => theme.palette.mode === "dark" ? "#e5e7eb" : "#111827",
          boxShadow: (theme) => theme.palette.mode === "dark"
            ? "0 24px 70px rgba(0,0,0,0.62)"
            : "0 18px 50px rgba(15,23,42,0.18)",
        },
        "& .MuiDialogTitle-root": {
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          backgroundColor: "#333d49",
          color: "#ffffff",
          fontWeight: 700,
          fontSize: 16,
          px: 2,
          py: 1.5,
        },
        "& .MuiDialogContent-root": {
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
          borderColor: (theme) => theme.palette.mode === "dark" ? "rgba(148,163,184,0.18)" : "rgba(226,232,240,0.95)",
          backgroundColor: (theme) => theme.palette.mode === "dark" ? "#0f172a" : "#ffffff",
        },
        "& .MuiDialogActions-root": {
          borderTop: "1px solid",
          borderColor: (theme) => theme.palette.mode === "dark" ? "rgba(148,163,184,0.18)" : "rgba(226,232,240,0.95)",
          backgroundColor: (theme) => theme.palette.mode === "dark" ? "rgba(15,23,42,0.98)" : "#f8fafc",
          px: 2,
          py: 1.5,
        },
      }}
      slotProps={{
        backdrop: {
          sx: {
            backgroundColor: (theme) => theme.palette.mode === "dark" ? "rgba(2,6,23,0.42)" : "rgba(15,23,42,0.12)",
            backdropFilter: "blur(2px)",
          },
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
          textTransform: "none",
        }}
      >
        {children}
      </DialogContent>

      <DialogActions>
        <Button
          onClick={onClose}
          variant="outlined"
          sx={{
            borderRadius: 2,
            textTransform: "none",
            minWidth: 112,
            color: (theme) => theme.palette.mode === "dark" ? "#e5e7eb" : "#334155",
            borderColor: (theme) => theme.palette.mode === "dark" ? "rgba(148,163,184,0.34)" : "rgba(100,116,139,0.42)",
            backgroundColor: (theme) => theme.palette.mode === "dark" ? "rgba(15,23,42,0.78)" : "#ffffff",
            "&:hover": {
              backgroundColor: (theme) => theme.palette.mode === "dark" ? "rgba(30,41,59,0.90)" : "#f1f5f9",
              borderColor: (theme) => theme.palette.mode === "dark" ? "rgba(148,163,184,0.48)" : "rgba(71,85,105,0.45)",
            },
          }}
        >
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
