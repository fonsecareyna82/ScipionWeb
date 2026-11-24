// Why a protocol cannot be launched yet: each problem its form has, to fix before launching again.
import { Box, Stack, Typography } from "@mui/material";
import { AlertTriangle, ListX } from "lucide-react";

import { useIsDark } from "@/context/ThemeContext";
import { ViewDialog } from "@/pages/Facility/DialogParts";

type ValidationErrorsDialogProps = {
  open: boolean;
  onClose: () => void;
  errors: string[];
};

/** An error with its **bold** parts (the parameters it is about). */
function ErrorText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith("**") && part.endsWith("**") ? <strong key={index}>{part.slice(2, -2)}</strong> : part)}
    </>
  );
}

export default function ValidationErrorsDialog({ open, onClose, errors }: ValidationErrorsDialogProps) {
  const isDark = useIsDark();
  if (!open) return null;
  const text = isDark ? "#f1f5f9" : "#0f172a";
  const muted = isDark ? "#94a3b8" : "#64748b";
  return (
    <ViewDialog
      icon={<ListX size={20} color="#fca5a5" />}
      title="Validation Errors"
      subtitle={errors.length
        ? `${errors.length === 1 ? "One thing" : `${errors.length} things`} to fix in the form before launching it.`
        : undefined}
      maxWidth="sm"
      onClose={onClose}
    >
      {errors.length > 0 ? (
        <Box component="ol" aria-label="What to fix" sx={{ listStyle: "none", m: 0, p: 0 }}>
          {errors.map((error, index) => (
            <Stack key={index} component="li" direction="row" spacing={1.25} alignItems="flex-start"
                   sx={{ border: "1px solid rgba(220,38,38,0.3)", borderLeft: "4px solid #dc2626", borderRadius: 2,
                         bgcolor: isDark ? "rgba(220,38,38,0.08)" : "#fef2f2", px: 1.5, py: 1.1, mb: 1 }}>
              <AlertTriangle size={17} color="#dc2626" style={{ flexShrink: 0, marginTop: 2 }} />
              <Typography sx={{ fontSize: 14.5, lineHeight: 1.5, color: text, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                <ErrorText text={error} />
              </Typography>
            </Stack>
          ))}
        </Box>
      ) : (
        <Typography sx={{ fontSize: 14.5, color: muted }}>No validation details provided.</Typography>
      )}
    </ViewDialog>
  );
}
