import { useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography,
  alpha,
  useTheme,
} from "@mui/material";
import { FolderOpen, X } from "lucide-react";
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
  const [submitting, setSubmitting] = useState(false);
  const [openBrowser, setOpenBrowser] = useState(false);
  const [browserDialogKey, setBrowserDialogKey] = useState(0);
  const browserRootAbsRef = useRef("");

  const normalizePosixPath = (path: string) =>
    String(path || "").replace(/\\/g, "/").replace(/\/+/g, "/").trim();

  const isAbsolutePath = (path: string) => {
    const normalized = normalizePosixPath(path);
    return normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized);
  };

  const buildAbsoluteProjectLocation = (pickedPath: string, entry?: RemoteEntry) => {
    const entryAbsPath = normalizePosixPath(entry?.absPath || "");
    if (entryAbsPath && isAbsolutePath(entryAbsPath)) {
      return entryAbsPath;
    }

    const normalizedPickedPath = normalizePosixPath(pickedPath || "");
    if (normalizedPickedPath && isAbsolutePath(normalizedPickedPath)) {
      return normalizedPickedPath;
    }

    const rootAbs = normalizePosixPath(browserRootAbsRef.current || "").replace(/\/+$/g, "");
    if (!rootAbs) {
      return normalizedPickedPath;
    }

    const relPath = normalizedPickedPath.replace(/^\/+/, "");
    return relPath ? `${rootAbs}/${relPath}` : rootAbs;
  };

  const handleResolveBrowserPaths = async () => {
    const resolved = await resolveBrowserPaths();
    browserRootAbsRef.current = normalizePosixPath(resolved?.rootAbs || "");
    return resolved;
  };

  const textFieldSx = {
    "& .MuiOutlinedInput-root": {
      borderRadius: 1,
      backgroundColor: "rgba(255,255,255,0.96)",
      color: theme.palette.text.primary,
      transition: "background-color 0.15s ease, border-color 0.15s ease",

      "& fieldset": {
        borderColor: alpha(theme.palette.text.primary, 0.22),
      },

      "&:hover fieldset": {
        borderColor: alpha(theme.palette.text.primary, 0.36),
      },

      "&.Mui-focused fieldset": {
        borderColor: theme.palette.primary.main,
      },
    },

    "& .MuiInputBase-input": {
      color: theme.palette.text.primary,

      "&::placeholder": {
        color: alpha(theme.palette.text.primary, 0.46),
        opacity: 1,
      },
    },

    ".dark & .MuiOutlinedInput-root": {
      backgroundColor: "rgba(15, 23, 42, 0.72)",
      color: "#e5e7eb",

      "& fieldset": {
        borderColor: "rgba(148, 163, 184, 0.34)",
      },

      "&:hover fieldset": {
        borderColor: "rgba(148, 163, 184, 0.52)",
      },

      "&.Mui-focused fieldset": {
        borderColor: "#60a5fa",
      },
    },

    ".dark & .MuiInputBase-input": {
      color: "#e5e7eb",
    },

    ".dark & .MuiInputBase-input::placeholder": {
      color: "#94a3b8",
      opacity: 1,
    },

    ".dark & .MuiInputBase-input.Mui-disabled": {
      WebkitTextFillColor: "rgba(226, 232, 240, 0.46)",
    },

    ".dark & .MuiOutlinedInput-root.Mui-disabled": {
      backgroundColor: "rgba(15, 23, 42, 0.42)",
    },
  };

  useEffect(() => {
    if (!open) return;

    browserRootAbsRef.current = "";
    setProjectLocation("");
    setProjectName("");
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
            borderRadius: 4,
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
                  mt: 2,
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
                  sx={textFieldSx}
                />

                <IconButton
                  aria-label="Browse project location"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setBrowserDialogKey((key) => key + 1);
                    setOpenBrowser(true);
                  }}
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

            <Box
              sx={{
                px: 1.5,
                py: 1.25,
                borderRadius: 1,
                backgroundColor: alpha(theme.palette.primary.main, 0.06),
                border: `1px solid ${alpha(theme.palette.primary.main, 0.18)}`,
              }}
            >
              <Typography
                variant="body2"
                sx={{
                  color: theme.palette.text.secondary,
                  lineHeight: 1.5,
                }}
              >
                The project will be copied into the ScipionWeb workspace.
                The original project will not be modified.
              </Typography>
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
                sx={textFieldSx}
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

      {openBrowser && (
        <RemoteFileDialog
          key={browserDialogKey}
          open={openBrowser}
          onClose={() => setOpenBrowser(false)}
          title="Select project location"
          resolveBrowserPaths={handleResolveBrowserPaths}
          listRemoteDirectory={listRemoteDirectory}
          previewRemoteEntry={previewRemoteEntry}
          buildDownloadUrl={buildDownloadUrl}
          onPick={(pickedPath, entry) => {
            setProjectLocation(buildAbsoluteProjectLocation(pickedPath, entry));
            setOpenBrowser(false);
          }}
        />
      )}
    </>
  );
}
