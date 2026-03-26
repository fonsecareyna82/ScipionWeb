import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
  alpha,
  useTheme,
} from "@mui/material";
import { FolderOpen, HelpCircle, X } from "lucide-react";
import toast from "react-hot-toast";

import RemoteFileDialog, {
  RemoteEntry,
  RemotePreview,
} from "@/components/files/RemoteFileDialog";
import type { ImportProjectPayload } from "@/services/ProjectService";

type ResolveBrowserPathsResult = {
  rootAbs?: string;
  startPath?: string;
};

type ImportProjectDialogProps = {
  open: boolean;
  onClose: () => void;
  onImport: (payload: ImportProjectPayload) => Promise<void> | void;

  resolveBrowserPaths: () => Promise<ResolveBrowserPathsResult>;
  listRemoteDirectory: (relPath: string) => Promise<RemoteEntry[]>;
  previewRemoteEntry?: (relPath: string) => Promise<RemotePreview | null>;
  buildDownloadUrl?: (relPath: string, inline?: boolean) => string;

  title?: string;
};

function extractErrorMessage(error: unknown): string {
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;

    const readStringArray = (input: unknown): string | null => {
      if (!Array.isArray(input)) return null;

      const parts = input
        .map((item) => String(item ?? "").trim())
        .filter((item) => item.length > 0);

      return parts.length ? parts.join("\n") : null;
    };

    const directDetail =
      typeof value.detail === "string" && value.detail.trim()
        ? value.detail.trim()
        : readStringArray(value.detail);

    if (directDetail) {
      return directDetail;
    }

    const directErrors = readStringArray(value.errors);
    if (directErrors) {
      return directErrors;
    }

    if (typeof value.message === "string" && value.message.trim()) {
      return value.message.trim();
    }

    if (value.data && typeof value.data === "object") {
      const nested = value.data as Record<string, unknown>;

      const nestedDetail =
        typeof nested.detail === "string" && nested.detail.trim()
          ? nested.detail.trim()
          : readStringArray(nested.detail);

      if (nestedDetail) {
        return nestedDetail;
      }

      const nestedErrors = readStringArray(nested.errors);
      if (nestedErrors) {
        return nestedErrors;
      }

      if (typeof nested.message === "string" && nested.message.trim()) {
        return nested.message.trim();
      }
    }
  }

  return "Failed to import project";
}

export default function ImportProjectDialog({
  open,
  onClose,
  onImport,
  resolveBrowserPaths,
  listRemoteDirectory,
  previewRemoteEntry,
  buildDownloadUrl,
  title = "Import project",
}: ImportProjectDialogProps) {
  const theme = useTheme();

  const [projectLocation, setProjectLocation] = useState("");
  const [projectName, setProjectName] = useState("");
  const [copyProject, setCopyProject] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [openBrowser, setOpenBrowser] = useState(false);

  useEffect(() => {
    if (!open) return;

    setProjectLocation("");
    setProjectName("");
    setCopyProject(true);
    setSubmitting(false);
    setOpenBrowser(false);
  }, [open]);

  const handleImport = async () => {
    const trimmedLocation = projectLocation.trim();
    if (!trimmedLocation) return;

    setSubmitting(true);

    try {
      await onImport({
        projectLocation: trimmedLocation,
        projectName: projectName.trim() || undefined,
        copyProject,
      });

      onClose();
    } catch (error: unknown) {
      toast.error(extractErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={submitting || openBrowser ? undefined : onClose}
        maxWidth="sm"
        fullWidth
        disableEnforceFocus
        disableAutoFocus
        disableRestoreFocus
        PaperProps={{
          sx: {
            borderRadius: 2,
            overflow: "hidden",
            border: `1px solid ${alpha(theme.palette.divider, 0.9)}`,
          },
        }}
      >
        <DialogTitle
          sx={{
            px: 2.5,
            py: 1.5,
            backgroundColor: "#333d49",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            spacing={2}
          >
            <Typography
              variant="subtitle1"
              sx={{
                color: "#ffffff",
                fontWeight: 700,
                letterSpacing: 0.1,
              }}
            >
              {title}
            </Typography>

            <IconButton
              onClick={onClose}
              size="small"
              disabled={submitting}
              sx={{
                color: "#ffffff",
                border: "1px solid rgba(255,255,255,0.14)",
                backgroundColor: "rgba(255,255,255,0.06)",
                "&:hover": {
                  backgroundColor: "rgba(255,255,255,0.12)",
                },
              }}
            >
              <X size={16} />
            </IconButton>
          </Stack>
        </DialogTitle>

        <DialogContent sx={{ px: 2.5, py: 2.25 }}>
          <Stack spacing={2}>
            <Box>
              <Typography
                variant="body2"
                sx={{
                  mb: 0.75,
                  fontWeight: 600,
                  color: theme.palette.text.primary,
                }}
              >
                Project location
              </Typography>

              <Stack direction="row" spacing={1}>
                <TextField
                  fullWidth
                  size="small"
                  value={projectLocation}
                  onChange={(e) => setProjectLocation(e.target.value)}
                  placeholder="/path/to/project"
                  disabled={submitting}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: 1,
                    },
                  }}
                />

                <IconButton
                  onClick={() => setOpenBrowser(true)}
                  disabled={submitting}
                  sx={{
                    border: `1px solid ${alpha(
                      theme.palette.text.primary,
                      0.16,
                    )}`,
                    borderRadius: 1,
                  }}
                >
                  <FolderOpen size={18} />
                </IconButton>
              </Stack>
            </Box>

            <Box>
              <Stack spacing={0.75}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Checkbox
                    checked={copyProject}
                    onChange={(e) => setCopyProject(e.target.checked)}
                    disabled={submitting}
                    size="small"
                    sx={{ p: 0.5 }}
                  />

                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    Copy project
                  </Typography>

                  <Tooltip
                    title="If disabled, the imported project will be linked using a symbolic link instead of copying the whole directory."
                    arrow
                    placement="top"
                  >
                    <Box
                      component="span"
                      sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        color: alpha(theme.palette.text.primary, 0.72),
                      }}
                    >
                      <HelpCircle size={15} />
                    </Box>
                  </Tooltip>
                </Stack>

                <Typography
                  variant="caption"
                  sx={{
                    pl: 4.5,
                    color: theme.palette.text.secondary,
                    lineHeight: 1.45,
                  }}
                >
                  If disabled, the project will be imported as a symbolic link
                  instead of duplicating the files.
                </Typography>
              </Stack>
            </Box>

            <Box>
              <Typography
                variant="body2"
                sx={{
                  mb: 0.75,
                  fontWeight: 600,
                  color: theme.palette.text.primary,
                }}
              >
                Project name (Optional)
              </Typography>

              <TextField
                fullWidth
                size="small"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Imported project name"
                disabled={submitting}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 1,
                  },
                }}
              />
            </Box>
          </Stack>
        </DialogContent>

        <DialogActions
          sx={{
            px: 2.5,
            py: 1.75,
            borderTop: `1px solid ${alpha(theme.palette.divider, 0.9)}`,
            justifyContent: "flex-end",
            gap: 1,
          }}
        >
          <Button
            onClick={handleImport}
            variant="contained"
            color="error"
            disabled={submitting || !projectLocation.trim()}
            sx={{
              minWidth: 100,
              textTransform: "none",
              fontWeight: 700,
              boxShadow: "none",
              borderRadius: 3,
            }}
          >
            {submitting ? "Importing..." : "Import"}
          </Button>

          <Button
            onClick={onClose}
            variant="outlined"
            disabled={submitting}
            sx={{
              minWidth: 100,
              textTransform: "none",
              fontWeight: 700,
              borderRadius: 3,
            }}
          >
            Cancel
          </Button>
        </DialogActions>
      </Dialog>

      <RemoteFileDialog
        open={openBrowser}
        onClose={() => setOpenBrowser(false)}
        title="Select project location"
        resolveBrowserPaths={resolveBrowserPaths}
        listRemoteDirectory={listRemoteDirectory}
        previewRemoteEntry={previewRemoteEntry}
        buildDownloadUrl={buildDownloadUrl}
        onPick={(relativePath) => {
          setProjectLocation(relativePath);
          setOpenBrowser(false);
        }}
      />
    </>
  );
}