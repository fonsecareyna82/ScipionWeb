// src/components/ParamRow.tsx
import React, { JSX, useState } from 'react';
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
} from '@mui/material';
import { CloseIcon, EyeIcon, FindIcon, HelpIcon, TrashBinIcon } from '../../icons';
import OutputSelectorDialog from './outputSelectorDialog';

type Output = {
  _key?: string;
  _class: string;
  _objValue: string;
  info: string;
  _parentId: string;
};

type ParamRowProps = {
  label: string;
  control: JSX.Element;
  helpText?: string;
  isPointerParam?: boolean;
  onClear?: () => void;
  rowIndex?: number;
  /** Optional: full list of outputs available in the project (for Find button) */
  allOutputs?: Output[];
  /** Optional: expected class for filtering in the selector */
  expectedClass?: string | string[];
  /** Called when the user selects an output from the selector dialog */
  onSelectOutput?: (output: Output) => void;
};

const ParamRow = ({
  label,
  control,
  helpText,
  isPointerParam,
  onClear,
  rowIndex = 0,
  allOutputs = [],
  expectedClass,
  onSelectOutput,
}: ParamRowProps) => {
  const [openHelp, setOpenHelp] = useState(false);
  const [openSelector, setOpenSelector] = useState(false);

  return (
    <>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '224px 1fr auto',
          alignItems: 'center',
          mb: 1,
          backgroundColor: rowIndex % 2 ? 'white' : '#EDEBEB',
          position: 'relative',
        }}
      >
        <Typography
          variant="body2"
          sx={{
            p: 0.5,
            pr: 2,
            fontSize: '0.8rem',
            fontWeight: 500,
            color: 'black',
          }}
        >
          {label}
        </Typography>

        <Box>{control}</Box>

        <Box sx={{ display: 'flex', gap: 0, alignItems: 'center' }}>
          {isPointerParam && (
            <Tooltip title="Find">
              <IconButton size="small" onClick={() => setOpenSelector(true)}>
                <FindIcon fontSize="1.3rem" />
              </IconButton>
            </Tooltip>
          )}

          {onClear && (
            <Tooltip title="Clear">
              <IconButton size="small" onClick={onClear}>
                <TrashBinIcon fontSize="1.3rem" />
              </IconButton>
            </Tooltip>
          )}

          {isPointerParam && (
            <Tooltip title="Visualize">
              <IconButton size="small" onClick={() => console.log('View')}>
                <EyeIcon fontSize="1.3rem" />
              </IconButton>
            </Tooltip>
          )}

          {helpText && (
            <Tooltip title="Help">
              <IconButton size="small" onClick={() => setOpenHelp(true)}>
                <HelpIcon fontSize="1.3rem" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>

      {/* --- Help Dialog --- */}
      {helpText && (
        <Dialog open={openHelp} onClose={() => setOpenHelp(false)} maxWidth="sm" fullWidth>
          <DialogTitle className="form-header">Help</DialogTitle>
          <DialogContent sx={{ p: 2 }}>
            <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
              {helpText}
            </Typography>
          </DialogContent>
          <DialogActions sx={{ justifyContent: 'center' }}>
            <Button
              variant="outlined"
              onClick={() => setOpenHelp(false)}
              startIcon={<CloseIcon />}
            >
              Close
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {/* --- Output Selector Dialog --- */}
      {isPointerParam && (
        <OutputSelectorDialog
          open={openSelector}
          onClose={() => setOpenSelector(false)}
          expectedClass={expectedClass}
          allOutputs={allOutputs}
          onSelect={(selected) => {
            setOpenSelector(false);
            if (onSelectOutput) onSelectOutput(selected);
          }}
        />
      )}
    </>
  );
};

export default ParamRow;
