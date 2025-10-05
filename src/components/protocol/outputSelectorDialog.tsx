import React, { useMemo } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Tooltip,
  IconButton,
} from "@mui/material";
import { Info as InfoIcon, CheckCircle as CheckIcon, X as CloseIcon } from "lucide-react";

interface Output {
  _key?: string;
  _class: string;
  _objValue: string;
  info: string;
  _parentId: string;
}

interface OutputSelectorDialogProps {
  open: boolean;
  onClose: () => void;
  expectedClass?: string | string[];
  allOutputs: Output[];
  onSelect: (output: Output) => void;
}

const OutputSelectorDialog: React.FC<OutputSelectorDialogProps> = ({
  open,
  onClose,
  expectedClass,
  allOutputs,
  onSelect,
}) => {
  // Filtramos outputs que matchean con el tipo esperado
  const matchingOutputs = useMemo(() => {
    if (!expectedClass) return allOutputs;
    if (Array.isArray(expectedClass))
      return allOutputs.filter((o) => expectedClass.includes(o._class));
    return allOutputs.filter((o) => o._class === expectedClass);
  }, [allOutputs, expectedClass]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontWeight: 600,
        }}
      >
        Select Output
        <IconButton onClick={onClose} size="small">
          <CloseIcon size={18} />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 2 }}>
        {matchingOutputs.length === 0 ? (
          <div className="text-center text-gray-500 py-4">
            No outputs available for this parameter type.
          </div>
        ) : (
          <Table size="small" sx={{ border: "1px solid #ddd" }}>
            <TableHead sx={{ backgroundColor: "#f0f0f0" }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, fontSize: "0.85rem" }}>Info</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: "0.85rem" }}>Class</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: "0.85rem" }}>Protocol</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: "0.85rem" }}>Select</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {matchingOutputs.map((o, i) => (
                <TableRow
                  key={i}
                  hover
                  sx={{
                    cursor: "pointer",
                    "&:hover": { backgroundColor: "#e8f5e9" },
                    fontSize: "0.85rem",
                  }}
                  onClick={() => onSelect(o)}
                >
                  <TableCell>{o.info || "—"}</TableCell>
                  <TableCell>{o._class}</TableCell>
                  <TableCell>{o._parentId}</TableCell>
                  <TableCell>
                    <Tooltip title="Select this output">
                      <IconButton color="success" size="small">
                        <CheckIcon size={18} />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} variant="outlined" size="small">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default OutputSelectorDialog;
