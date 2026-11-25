// While a wizard starts on the server: what it is preparing, in the wizards' own look.
import { Box, CircularProgress, Typography } from "@mui/material";

import WizardShell, { WIZARD_TEXT } from "./WizardShell";

type WizardLoadingDialogProps = {
  open: boolean;
  title?: string;
  message?: string;
};

export default function WizardLoadingDialog({
  open,
  title = "Opening wizard",
  message = "Preparing preview...",
}: WizardLoadingDialogProps) {
  if (!open) return null;
  return (
    <WizardShell title={title} subtitle="Wizard" maxWidth="xs" closable={false}>
      <Box role="status" sx={{ display: "flex", alignItems: "center", gap: 2, py: 1 }}>
        <CircularProgress size={26} sx={{ color: "#333d49", flexShrink: 0 }} />
        <Box>
          <Typography sx={{ fontSize: WIZARD_TEXT.body, fontWeight: 600, color: "var(--app-n-900)" }}>{message}</Typography>
          <Typography sx={{ fontSize: WIZARD_TEXT.note, color: "var(--app-n-500)" }}>
            This may take a few seconds the first time.
          </Typography>
        </Box>
      </Box>
    </WizardShell>
  );
}
