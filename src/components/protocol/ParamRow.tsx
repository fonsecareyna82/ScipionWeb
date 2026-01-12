// src/components/ParamRow.tsx
import { JSX, useMemo, useState } from "react";
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from "@mui/material";
import { CloseIcon, FindIcon, HelpIcon, TrashBinIcon } from "../../icons";
import { FolderOpen as FolderIcon } from "lucide-react";
import styles from "./paramrow.module.css";

type ParamRowLayoutVariant = "standard" | "inline";

type ParamRowProps = {
  label: string;
  control: JSX.Element;
  helpText?: string;
  isPointerParam?: boolean;
  onClear?: () => void;
  rowIndex?: number;

  // PointerParam
  onOpenFind?: () => void;

  // PathParam
  isPathParam?: boolean;
  onBrowsePath?: () => void;

  // Layout
  layoutVariant?: ParamRowLayoutVariant;
};

const ParamRow = ({
  label,
  control,
  helpText,
  isPointerParam,
  onClear,
  rowIndex = 0,
  onOpenFind,
  isPathParam,
  onBrowsePath,
  layoutVariant = "standard",
}: ParamRowProps) => {
  const [openHelp, setOpenHelp] = useState(false);
  const [openSelector, setOpenSelector] = useState(false); // fallback

  const isInline = layoutVariant === "inline";

  const rowBg = useMemo(() => {
    // computeRowBackground
    return rowIndex % 2 ? "white" : "white";
  }, [rowIndex]);

  return (
    <>
      <Box
        sx={{
          ...(isInline
            ? {
                display: "inline-flex",
                alignItems: "center",
                gap: 1,
                px: 1,
                py: 0.5,
                borderRadius: 1,
                //backgroundColor: rowBg,
                border: "1px solid rgba(0,0,0,0.08)",
                minHeight: 42,
              }
            : {
                display: "grid",
                gridTemplateColumns: "210px 1fr auto",
                alignItems: "center",
                mb: 1,
                //backgroundColor: rowBg,
                position: "relative",
              }),
        }}
      >
        <Typography
          variant="body2"
          className={styles.paramRowLabel}
          sx={{
            p: isInline ? 0 : 0.5,
            pr: isInline ? 0.75 : 2,
            fontSize: "0.75rem",
            fontWeight: 300,
            color: "black",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            ...(isInline ? { maxWidth: 180 } : null),
          }}
          title={label}
        >
          {label}
        </Typography>

        <Box
          sx={{
            minWidth: 0,
            ...(isInline
              ? {
                  display: "flex",
                  alignItems: "center",
                  gap: 0.75,
                }
              : null),
          }}
        >
          {control}
        </Box>

        <Box sx={{ display: "flex", gap: 0, alignItems: "center" }}>
          {isPointerParam && (
            <Tooltip title="Find">
              <IconButton
                size="small"
                onClick={onOpenFind ? onOpenFind : () => setOpenSelector(true)}
              >
                <FindIcon className="ml-0" fontSize="1.3rem" />
              </IconButton>
            </Tooltip>
          )}

          {isPathParam && (
            <Tooltip title="Browse files">
              <IconButton size="small" onClick={onBrowsePath}>
                <FolderIcon className="ml-0" size={18} />
              </IconButton>
            </Tooltip>
          )}

          {onClear && (
            <Tooltip title="Clear">
              <IconButton size="small" onClick={onClear}>
                <TrashBinIcon className="ml-0" fontSize="1.3rem" />
              </IconButton>
            </Tooltip>
          )}

          {helpText && (
            <Tooltip title="Help">
              <IconButton size="small" onClick={() => setOpenHelp(true)}>
                <HelpIcon className="ml-0" fontSize="1.3rem" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>

      {helpText && (
        <Dialog open={openHelp} onClose={() => setOpenHelp(false)} maxWidth="sm" fullWidth>
          <DialogTitle className={styles.formHeader}>Help</DialogTitle>
          <DialogContent sx={{ p: 2 }}>
            <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
              {helpText}
            </Typography>
          </DialogContent>
          <DialogActions sx={{ justifyContent: "center" }}>
            <Button variant="outlined" onClick={() => setOpenHelp(false)} startIcon={<CloseIcon />}>
              Close
            </Button>
          </DialogActions>
        </Dialog>
      )}

      <Dialog open={openSelector} onClose={() => setOpenSelector(false)} maxWidth="sm" fullWidth>
        <DialogTitle className={styles.formHeader}>Select output</DialogTitle>
        <DialogContent sx={{ p: 2 }}>
          <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
            No selector implemented here. Use onOpenFind/onBrowsePath from the parent.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ justifyContent: "center" }}>
          <Button variant="outlined" onClick={() => setOpenSelector(false)} startIcon={<CloseIcon />}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default ParamRow;
