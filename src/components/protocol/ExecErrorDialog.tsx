import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";

type ExecErrorDialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  message: string;
};

export default function ExecErrorDialog({
  open,
  onClose,
  title,
  message,
}: ExecErrorDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          boxShadow: "0px 10px 25px rgba(0, 0, 0, 0.25)",
        },
      }}
    >
      <DialogTitle sx={{ fontWeight: 700 }}>{title}</DialogTitle>

      <DialogContent dividers>
        <Typography
          variant="body2"
          sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
        >
          {message}
        </Typography>
      </DialogContent>

      <DialogActions>
        <Button
          onClick={onClose}
          variant="contained"
          sx={{ textTransform: "none" }}
        >
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}