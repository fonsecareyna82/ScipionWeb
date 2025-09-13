// src/components/ParamRow.tsx
import React, { JSX, useState } from 'react';
import { Box, Typography, IconButton, Tooltip, Dialog, DialogTitle, DialogContent, DialogActions, Button } from '@mui/material';
import { CloseIcon, EyeIcon, FindIcon, HelpIcon, TrashBinIcon } from '../../icons';

type ParamRowProps = {
  label: string;
  control: JSX.Element;
  helpText?: string;
  isPointerParam?: boolean;
  onClear?: () => void;
  rowIndex?: number;
};

const ParamRow = ({ label, control, helpText, isPointerParam, onClear, rowIndex = 0 }: ParamRowProps) => {
  const [openHelp, setOpenHelp] = useState(false);

  return (
    <>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '220px 1fr auto',
          alignItems: 'center',
          gap: 1,
          mb: 1,
          backgroundColor: rowIndex % 2 ? 'white' : '#EDEBEB',
          position: 'relative',
        }}
      >
        <Typography variant="body2" sx={{ pr: 2, fontSize: '0.8rem', fontWeight: 500 }}>
          {label}
        </Typography>
        <Box>{control}</Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          {isPointerParam && (
            <Tooltip title="Find">
              <IconButton size="small">
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

      {helpText && (
        <Dialog open={openHelp} onClose={() => setOpenHelp(false)} maxWidth="sm" fullWidth>
          <DialogTitle className="form-header">Help</DialogTitle>
          <DialogContent sx={{ p: 2 }}>
            <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
              {helpText}
            </Typography>
          </DialogContent>
          <DialogActions sx={{ justifyContent: 'center' }}>
            <Button variant="outlined" onClick={() => setOpenHelp(false)} startIcon={<CloseIcon />}>
              Close
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}

export default ParamRow;
