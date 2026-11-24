// Why a protocol could not be launched: the server's message, whole, and a way to copy it.
import { Box, Button, Typography } from "@mui/material";
import { Copy, OctagonX } from "lucide-react";
import toast from "react-hot-toast";

import { useIsDark } from "@/context/ThemeContext";
import { ViewDialog } from "@/pages/Facility/DialogParts";

type ExecErrorDialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  message: string;
};

export default function ExecErrorDialog({ open, onClose, title, message }: ExecErrorDialogProps) {
  const isDark = useIsDark();
  if (!open) return null;
  const shown = message || "No error details were provided by the backend.";
  const copy = () => {
    navigator.clipboard?.writeText(shown).then(() => toast.success("Error copied."), () => toast.error("The browser did not let it copy."));
  };
  return (
    <ViewDialog
      icon={<OctagonX size={20} color="#fca5a5" />}
      title={title || "Execution error"}
      subtitle="The protocol could not be executed."
      onClose={onClose}
      footer={
        <Button size="small" startIcon={<Copy size={15} />} sx={{ textTransform: "none", fontSize: 13.5 }} onClick={copy}>
          Copy the error
        </Button>
      }
    >
      <Box sx={{ border: "1px solid rgba(220,38,38,0.3)", borderLeft: "4px solid #dc2626", borderRadius: 2,
                 bgcolor: isDark ? "rgba(220,38,38,0.08)" : "#fef2f2", px: 1.75, py: 1.5, maxHeight: "52vh", overflow: "auto" }}>
        <Typography component="div" sx={{ fontSize: 14, lineHeight: 1.65, color: isDark ? "#f1f5f9" : "#0f172a",
                                          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                                          whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {shown}
        </Typography>
      </Box>
    </ViewDialog>
  );
}
