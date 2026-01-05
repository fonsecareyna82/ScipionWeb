// src/components/ParamRow.tsx
import { JSX, useState } from "react";
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
import { CloseIcon, EyeIcon, FindIcon, HelpIcon, TrashBinIcon } from "../../icons";
import { FolderOpen as FolderIcon } from "lucide-react";
import styles from "./paramrow.module.css";

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
}: ParamRowProps) => {
  const [openHelp, setOpenHelp] = useState(false);
  const [openSelector, setOpenSelector] = useState(false); // fallback

  return (
    <>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "210px 1fr auto",
          alignItems: "center",
          mb: 1,
          backgroundColor: rowIndex % 2 ? "white" : "#EDEBEB",
          position: "relative",
        }}
      >
        <Typography
          variant="body2"
          className={styles.paramRowLabel}
          sx={{ p: 0.5, pr: 2, fontSize: "0.75rem", fontWeight: 300, color: "black" }}
        >
          {label}
        </Typography>

        <Box>{control}</Box>

        <Box sx={{ display: "flex", gap: 0, alignItems: "center" }}>
          {isPointerParam && (
            <Tooltip title="Find">
              <IconButton size="small" onClick={onOpenFind ? onOpenFind : () => setOpenSelector(true)}>
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

          {/*

          {isPointerParam && (
            <Tooltip title="Visualize">
              <IconButton size="small" onClick={() => console.log("View")}>
                <EyeIcon className="ml-0" fontSize="1.3rem" />
              </IconButton>
            </Tooltip>
          )}

          */}

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
