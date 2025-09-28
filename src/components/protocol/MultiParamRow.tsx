// src/components/MultiParamRow.tsx
import {
  Box,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  IconButton,
  Tooltip,
} from '@mui/material';
import { TrashBinIcon, EyeIcon, HelpIcon } from '../../icons';

type MultiParamRowProps = {
  label: string;
  items: any[];
  helpText?: string;
  onRowClear?: (i: number) => void;
  onRowDrop?: (i: number, dragged: any) => void;
  dragOverKey?: string | null;
  currentDraggedOutput?: any;
  paramKey?: string;
  rowIndex?: number;
};

export default function MultiParamRow({
  label,
  items,
  helpText,
  onRowClear,
  onRowDrop,
  dragOverKey,
  currentDraggedOutput,
  paramKey,
}: MultiParamRowProps) {
  
  const display = [...items];
  while (display.length < 5) display.push({ object: '', info: '' });

  const isEmpty = (r: any) => !r.object?.trim() && !r.info?.trim();

  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
        <strong>{label}</strong>
        {helpText && (
          <Tooltip title={helpText}>
            <IconButton size="small">
              <HelpIcon fontSize="1.3rem" />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      <Box sx={{ maxHeight: 200, overflowY: 'auto', borderRadius: 1 }}>
        <Table size="small">
          <TableHead sx={{ backgroundColor: '#BABABA' }}>
            <TableRow>
              <TableCell>Object</TableCell>
              <TableCell>Information</TableCell>
              {onRowClear && <TableCell>Actions</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {display.map((row, i) => {
              const keyId = `${paramKey}_${i}`;
              const isOver = dragOverKey === keyId;
              const expectedClass = currentDraggedOutput?._expectedClass ?? null;
              const matches = currentDraggedOutput?._class === expectedClass;
              const borderColor = isOver ? (matches ? 'green' : 'red') : 'transparent';
              const backgroundColor = isOver
                ? matches
                  ? 'rgba(0,255,0,0.2)'
                  : 'rgba(255,0,0,0.2)'
                : 'transparent';

              return (
                <TableRow
                  key={i}
                  sx={{
                    border: `2px solid ${borderColor}`,
                    backgroundColor,
                    transition: 'all 0.2s',
                  }}
                  onDragOver={(e) => {
                    if (!onRowDrop) return;
                    e.preventDefault();
                  }}
                  onDrop={(e) => {
                    if (!onRowDrop) return;
                    e.preventDefault();
                    try {
                      const raw = e.dataTransfer.getData('application/scipion-output');
                      if (!raw) return;
                      const dragged = JSON.parse(raw);
                      onRowDrop(i, dragged);
                    } catch {}
                  }}
                >
                  <TableCell>{row.object}</TableCell>
                  <TableCell>{row.info}</TableCell>
                  {onRowClear && (
                    <TableCell>
                      {!isEmpty(row) && (
                        <>
                          <IconButton size="small" onClick={() => onRowClear(i)}>
                            <TrashBinIcon fontSize="1.3rem" />
                          </IconButton>
                          <IconButton size="small" onClick={() => console.log('View', i)}>
                            <EyeIcon fontSize="1.3rem" />
                          </IconButton>
                        </>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Box>
    </Box>
  );
}
