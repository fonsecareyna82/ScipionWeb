// src/components/ProtocolForm.tsx

import React, { useState, useEffect, useCallback, JSX } from 'react';
import {
  Tabs,
  Tab,
  Box,
  Typography,
  Button,
  TextField,
  RadioGroup,
  FormControlLabel,
  Radio,
  Switch,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  CircularProgress,
} from '@mui/material';
import './ProtocolForm.css';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  CloseIcon,
  ExecuteIcon,
  SaveIcon,
  HelpIcon,
  FindIcon,
  TrashBinIcon,
  EyeIcon,
} from '../../icons';
import { executeProtocol } from '../../api/projects';

type ProtocolFormProps = {
  data: any;
  onClose: () => void;
};

export default function ProtocolForm({ data, onClose }: ProtocolFormProps) {
  const [topTab, setTopTab] = useState(0);
  const [bottomTab, setBottomTab] = useState(0);
  const [sectionTab, setSectionTab] = useState(0);
  const [protocolDetails, setProtocolDetails] = useState<any>({});
  const [expandedGroups, setExpandedGroups] = useState<{ [key: string]: boolean }>({});
  const [execLoading, setExecLoading] = useState(false);
  const [execError, setExecError] = useState<string | null>(null);

  // Drag/drop state
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [currentDraggedOutput, setCurrentDraggedOutput] = useState<any>(null);

  // Parse JSON value
  const parseFromJSONValue = (maybeJson: any) => {
    try {
      if (typeof maybeJson === 'string') {
        const obj = JSON.parse(maybeJson);
        if (obj && typeof obj === 'object' && '_objValue' in obj) {
          return obj._objValue;
        }
      }
    } catch { }
    return maybeJson;
  };

  const coerceToken = (raw: any) => {
    if (raw === undefined || raw === null) return '';
    if (typeof raw === 'boolean' || typeof raw === 'number') return raw;
    if (typeof raw !== 'string') return raw;
    const trimmed = raw.trim();
    if (/^["'].*["']$/.test(trimmed)) return trimmed.slice(1, -1);
    if (/^(True|true)$/.test(trimmed)) return true;
    if (/^(False|false)$/.test(trimmed)) return false;
    if (!isNaN(Number(trimmed))) return Number(trimmed);
    return trimmed;
  };

  const getParamCurrentValue = (sectionIdx: number, paramName: string) => {
    const key = `${sectionIdx}_${paramName}`;
    const state = protocolDetails.params?.[key];
    if (!state) return '';
    if (state._class === 'EnumParam' && Array.isArray(state.choices)) {
      const v = state.editableValue ?? state.default ?? '';
      if (typeof v === 'number') return v;
      const idx = state.choices.indexOf(v);
      return idx >= 0 ? idx : 0;
    }
    return state.editableValue ?? '';
  };

  const evalAtom = (sectionIdx: number, atom: string): boolean => {
    let a = atom.replace(/[()]/g, '').trim();
    let neg = false;
    if (/^not\s+/i.test(a)) {
      neg = true;
      a = a.replace(/^not\s+/i, '').trim();
    } else if (a.startsWith('!')) {
      neg = true;
      a = a.slice(1).trim();
    }
    const m = a.match(/^(.*?)\s*(==|!=|>=|<=|>|<|=)\s*(.*)$/);
    let res = false;
    if (m) {
      const [, leftRaw, opRaw, rightRaw] = m;
      const left = coerceToken(getParamCurrentValue(sectionIdx, leftRaw.trim()));
      const op = opRaw === '=' ? '==' : opRaw;
      const right = coerceToken(rightRaw.replace(/[()]/g, '').trim());
      switch (op) {
        case '==': res = left === right; break;
        case '!=': res = left !== right; break;
        case '>': res = (left as any) > (right as any); break;
        case '<': res = (left as any) < (right as any); break;
        case '>=': res = (left as any) >= (right as any); break;
        case '<=': res = (left as any) <= (right as any); break;
      }
    } else {
      const v = coerceToken(getParamCurrentValue(sectionIdx, a));
      res = !!(v === true || v === 'True' || v === 1 || v === '1');
    }
    return neg ? !res : res;
  };

  const evalExpr = (sectionIdx: number, exprRaw: string): boolean => {
    const expr = exprRaw
      .replace(/[()]/g, ' ')
      .replace(/\band\b/gi, '&&')
      .replace(/\bor\b/gi, '||')
      .replace(/\s+/g, ' ')
      .trim();
    if (!expr) return true;
    return expr
      .split('||')
      .some((part) =>
        part
          .split('&&')
          .every((atom) => evalAtom(sectionIdx, atom.trim()))
      );
  };

  useEffect(() => {
    if (!data) {
      setProtocolDetails({});
      return;
    }
    const params: any = {};
    const walk = (secIdx: number, obj: any) => {
      const [name, def] = Object.entries(obj)[0] as [string, any];
      if (def._class === 'Group' && Array.isArray(def.children)) {
        def.children.forEach((c: any) => walk(secIdx, c));
        return;
      }
      const key = `${secIdx}_${name}`;
      const raw = def.value ?? def.default ?? '';
      const parsed = parseFromJSONValue(raw);
      let init = parsed ?? '';
      if (def._class === 'EnumParam' && Array.isArray(def.choices) && typeof init === 'number') {
        init = def.choices[init] ?? def.default ?? '';
      }
      params[key] = { ...def, value: def.value, editableValue: init };
    };

    data.definition?.forEach((section: any, i: number) => {
      section.params?.forEach((p: any) => walk(i, p));
    });

    setProtocolDetails({
      label: data.protocolName ?? '',
      status: data.status ?? '',
      id: data.id ?? '',
      color: data.color ?? '',
      params,
    });
  }, [data]);

  const getExpectedClass = (def: any): string | undefined => {
    if (!def) return undefined;
    const candidates = [
      def.pointerClass,
      def.accept,
      def.accepts,
      def.accepted,
      def.objectClass,
      def.targetClass,
      def._expectedClass,
      def.acceptsClass,
      def.type,
      def._type,
      def._classAccepted,
      def.class,
    ];
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim()) return c.trim();
    }
    return undefined;
  };

  const getDraggedOutput = (dataTransfer: DataTransfer) => {
    try {
      const raw =
        dataTransfer.getData('application/scipion-output') || // tipo correcto
        dataTransfer.getData('text/plain');                   // fallback
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      console.warn('Failed to parse drag payload', err);
      return null;
    }
  };

  const handleDragOverParam = (e: React.DragEvent, def: any, key: string) => {
    e.preventDefault(); // necesario para permitir drop
    setDragOverKey(key);

    try {
      const payload = e.dataTransfer.getData('application/scipion-output');
      if (payload) {
        const output = JSON.parse(payload);
        setCurrentDraggedOutput(output); // ahora currentDraggedOutput es el output real
      }
    } catch (err) {
      console.error('Error parsing dragged data:', err);
      setCurrentDraggedOutput(null);
    }
  };



  const getBorderColor = (key: string, def: any) => {
    if (dragOverKey === key) {
      const expected = getExpectedClass(def);
      if (!currentDraggedOutput) return 'transparent';
      return currentDraggedOutput._class === expected ? 'green' : 'red';
    }
    return 'transparent';
  };


  const handleDragLeaveParam = () => {
    setDragOverKey(null);
    setCurrentDraggedOutput(null);
  };

  const handleDropOnParam = (e: React.DragEvent, def: any, key: string) => {
    e.preventDefault();
    setDragOverKey(null);

    try {
      const payload = e.dataTransfer.getData('application/scipion-output');
      if (!payload) return;

      const output = JSON.parse(payload);
      setCurrentDraggedOutput(null); // limpiamos

      const expected = getExpectedClass(def);
      if (!expected || output._class !== expected) return;

      // Actualiza el form con el output real
      setProtocolDetails((prev: any) => ({
        ...prev,
        params: {
          ...prev.params,
          [key]: { ...prev.params[key], editableValue: output._objValue ?? '' },
        },
      }));
    } catch (err) {
      console.error('Error parsing dropped data:', err);
    }
  };

  const getSerializedParams = useCallback(() => {
    const out: any = {};
    Object.entries(protocolDetails.params || {}).forEach(([k, p]: any) => {
      let v = p.value;
      try {
        const obj = JSON.parse(p.value);
        obj._objValue = p.editableValue;
        v = JSON.stringify(obj, null, 2);
      } catch {
        v = p.editableValue;
      }
      out[k] = { ...p, value: v };
    });
    return out;
  }, [protocolDetails.params]);

  const handleExecute = async () => {
    setExecLoading(true);
    setExecError(null);
    try {
      await executeProtocol(data.id, getSerializedParams());
      onClose();
    } catch (err: any) {
      console.error(err);
      setExecError(err.message || 'Error al ejecutar protocolo');
    } finally {
      setExecLoading(false);
    }
  };

  const [draggedOutput, setDraggedOutput] = useState<any | null>(null);

  const wrapWithDrop = (control: JSX.Element, def: any, key: string) => {
    const isOver = dragOverKey === key;
    const expectedClass = getExpectedClass(def);
  
    // Calculamos matches reactivo, usando el estado actual de draggedOutput
    const matches = draggedOutput?._class === expectedClass;
  
    return (
      <div
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOverKey(key);
          try {
            const payload = e.dataTransfer.getData('application/scipion-output');
            if (payload) setDraggedOutput(JSON.parse(payload));
            else setDraggedOutput(null);
          } catch {
            setDraggedOutput(null);
          }
        }}
        onDragOver={(e) => e.preventDefault()} // necesario para permitir drop
        onDragLeave={() => {
          setDragOverKey(null);
          setDraggedOutput(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOverKey(null);
          try {
            const payload = e.dataTransfer.getData('application/scipion-output');
            if (!payload) return;
            const output = JSON.parse(payload);
            setDraggedOutput(null);
  
            const expected = getExpectedClass(def);
            if (!expected || output._class !== expected) return;
  
            // Actualizamos protocolDetails con el valor del output
            setProtocolDetails((prev: any) => ({
              ...prev,
              params: {
                ...prev.params,
                [key]: { ...prev.params[key], editableValue: output._objValue ?? '' },
              },
            }));
          } catch {
            console.error('Drop failed');
          }
        }}
        style={{
          border: `2px solid ${isOver ? (matches ? 'green' : 'red') : 'transparent'}`,
          borderRadius: 4,
          padding: 4,
          boxSizing: 'border-box',
          transition: 'border-color 0.2s',
          position: 'relative',
        }}
      >
        {control}
  
        {/* Indicador de match */}
        {isOver && matches && (
          <span
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              backgroundColor: 'green',
              color: 'white',
              fontWeight: 'bold',
              borderRadius: '50%',
              width: 16,
              height: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
            }}
          >
            +
          </span>
        )}
      </div>
    );
  };
  




  // ParamRow: memoized to avoid full re-render
  const ParamRow = React.memo(({
    label,
    control,
    rowIndex = 0,
    helpText,
    isPointerParam,
    onClear,
  }: {
    label: string;
    control: JSX.Element;
    rowIndex?: number;
    helpText?: string;
    isPointerParam?: boolean;
    onClear?: () => void;
  }) => {
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
  });


  // MultiParamRow: memoized, now accepts onRowClear and onRowDrop
  const MultiParamRow = React.memo(({
    label,
    items,
    helpText,
    onRowClear,
    onRowDrop,
    dragOverKey,
    currentDraggedOutput,
    paramKey,
  }: {
    label: string;
    items: any[];
    helpText?: string;
    onRowClear?: (i: number) => void;
    onRowDrop?: (i: number, dragged: any) => void;
    dragOverKey?: string | null;
    currentDraggedOutput?: any;
    paramKey?: string;
  }) => {
    const [openHelp, setOpenHelp] = useState(false);
    const display = [...items];
    while (display.length < 5) display.push({ object: '', info: '' });

    const isEmpty = (r: any) => !r.object?.trim() && !r.info?.trim();

    return (
      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>{label}</Typography>
          {helpText && (
            <Tooltip title="Help">
              <IconButton size="small" onClick={() => setOpenHelp(true)}>
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

                return (
                  <TableRow
                    key={i}
                    sx={{
                      border: `2px solid ${borderColor}`,
                      transition: 'border-color 0.2s',
                    }}
                    onDragOver={(e) => {
                      if (!onRowDrop) return;
                      try {
                        const raw = e.dataTransfer.getData('application/scipion-output');
                        if (!raw) return;
                        const dragged = JSON.parse(raw);
                        if (dragged && dragged._class) {
                          e.preventDefault();
                        }
                      } catch { }
                    }}
                    onDrop={(e) => {
                      if (!onRowDrop) return;
                      e.preventDefault();
                      try {
                        const raw = e.dataTransfer.getData('application/scipion-output');
                        if (!raw) return;
                        const dragged = JSON.parse(raw);
                        onRowDrop(i, dragged);
                      } catch { }
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

        {helpText && (
          <Dialog open={openHelp} onClose={() => setOpenHelp(false)} maxWidth="sm" fullWidth>
            <DialogTitle className="form-header">Help</DialogTitle>
            <DialogContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ lineHeight: 1.6 }}>{helpText}</Typography>
            </DialogContent>
            <DialogActions sx={{ justifyContent: 'center' }}>
              <Button variant="outlined" onClick={() => setOpenHelp(false)} startIcon={<CloseIcon />}>
                Close
              </Button>
            </DialogActions>
          </Dialog>
        )}
      </Box>
    );
  });


  // renderParam: memoized so stable across renders
  const renderParam = useCallback(
    (paramObj: any, sectionIdx: number, rowIndex = 0): JSX.Element | null => {
      const [name, def] = Object.entries(paramObj)[0] as [string, any];
      const key = `${sectionIdx}_${name}`;
      const value = protocolDetails.params?.[key]?.editableValue;

      if (def.condition && !evalExpr(sectionIdx, def.condition)) return null;

      const advancedTag = def.expertLevel === 1 ? (
        <Tooltip title="Advanced">
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '1.5rem',
              height: '1.5rem',
              bgcolor: '#777',
              color: 'white',
              borderRadius: '50%',
              fontSize: '0.8rem',
            }}
          >
            A
          </Box>
        </Tooltip>
      ) : null;

      // --- MultiPointerParam ---
      if (def._class === 'MultiPointerParam') {
        const items = Array.isArray(value) ? value : def.default ?? [];

        const onClear = (i: number) => {
          setProtocolDetails((prev: any) => {
            const list = [...prev.params[key].editableValue];
            list.splice(i, 1);
            list.push({ object: '', info: '' });
            return {
              ...prev,
              params: { ...prev.params, [key]: { ...prev.params[key], editableValue: list } },
            };
          });
        };

        const onRowDrop = (i: number, dragged: any) => {
          const expected = getExpectedClass(def);
          if (!expected || dragged._class !== expected) return;
          setProtocolDetails((prev: any) => {
            const list = Array.isArray(prev.params[key].editableValue)
              ? [...prev.params[key].editableValue]
              : [];
            while (list.length <= i) list.push({ object: '', info: '' });
            list[i] = { object: dragged._objValue ?? '', info: dragged.info ?? '' };
            return {
              ...prev,
              params: { ...prev.params, [key]: { ...prev.params[key], editableValue: list } },
            };
          });
        };

        return (
          <MultiParamRow
            key={key}
            label={def.label || name}
            items={items}
            helpText={def.help}
            onRowClear={onClear}
            onRowDrop={onRowDrop}
            dragOverKey={dragOverKey}
            currentDraggedOutput={currentDraggedOutput}
            paramKey={key}
          />
        );
      }

      // --- PointerParam ---
      if (def._class === 'PointerParam') {
        const onClear = () =>
          setProtocolDetails((prev: any) => ({
            ...prev,
            params: { ...prev.params, [key]: { ...prev.params[key], editableValue: '' } },
          }));

          const control = (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {advancedTag}
              <TextField
                size="small"
                value={value ?? def.default ?? ''}
                onChange={(e) =>
                  setProtocolDetails((prev: any) => ({
                    ...prev,
                    params: {
                      ...prev.params,
                      [key]: { ...prev.params[key], editableValue: e.target.value },
                    },
                  }))
                }
                sx={{ minWidth: 300, '& .MuiInputBase-input': { fontSize: '0.8rem' } }}
              />
              {/* MATCH / NO MATCH basado en el valor actual, no en el drag */}
              <Box sx={{ ml: 1, fontWeight: 'bold', color: (value ?? '') === (protocolDetails.params[key]?.editableValue ?? '') ? 'green' : 'red' }}>
                {(value ?? '') === (protocolDetails.params[key]?.editableValue ?? '') ? 'MATCH' : 'NO MATCH'}
              </Box>
            </Box>
          );

        return (
          <ParamRow
            key={key}
            label={def.label || name}
            control={wrapWithDrop(control, def, key)}
            helpText={def.help}
            isPointerParam
            onClear={onClear}
            rowIndex={rowIndex}
          />
        );
      }



      // --- EnumParam ---
      if (def._class === 'EnumParam' && Array.isArray(def.choices)) {
        let sel = value ?? def.default ?? '';
        if (typeof sel === 'number') sel = def.choices[sel] ?? '';

        const onChange = (v: any) =>
          setProtocolDetails((prev: any) => ({
            ...prev,
            params: { ...prev.params, [key]: { ...prev.params[key], editableValue: v } },
          }));

        const controlBase =
          def.display === 0 ? (
            <RadioGroup row value={sel} onChange={(e) => onChange(e.target.value)}>
              {def.choices.map((ch: string, i: number) => (
                <FormControlLabel key={i} value={ch} control={<Radio size="small" />} label={ch} />
              ))}
            </RadioGroup>
          ) : (
            <TextField
              select
              size="small"
              value={sel}
              onChange={(e) => onChange(e.target.value)}
              SelectProps={{ native: true }}
              sx={{ minWidth: 300, '& .MuiInputBase-input': { fontSize: '0.8rem' } }}
            >
              {def.choices.map((ch: string, i: number) => (
                <option key={i} value={ch}>
                  {ch}
                </option>
              ))}
            </TextField>
          );

        return (
          <ParamRow
            key={key}
            label={def.label || name}
            control={wrapWithDrop(
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>{advancedTag}{controlBase}</Box>,
              def,
              key
            )}
            helpText={def.help}
            rowIndex={rowIndex}
          />
        );
      }

      // --- BooleanParam ---
      if (def._class === 'BooleanParam') {
        const checked =
          value !== undefined ? ['True', true, 1, '1'].includes(value) : ['True', true, 1, '1'].includes(def.default);

        return (
          <ParamRow
            key={key}
            label={def.label || name}
            control={wrapWithDrop(
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {advancedTag}
                <Switch
                  checked={!!checked}
                  onChange={(e) =>
                    setProtocolDetails((prev: any) => ({
                      ...prev,
                      params: { ...prev.params, [key]: { ...prev.params[key], editableValue: e.target.checked ? 'True' : 'False' } },
                    }))
                  }
                  color="primary"
                />
              </Box>,
              def,
              key
            )}
            helpText={def.help}
            rowIndex={rowIndex}
          />
        );
      }

      // --- Default TextField ---
      const defaultControl = (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {advancedTag}
          <TextField
            size="small"
            name={key}
            value={value ?? def.default ?? ''}
            onChange={(e) =>
              setProtocolDetails((prev: any) => ({
                ...prev,
                params: { ...prev.params, [key]: { ...prev.params[key], editableValue: e.target.value } },
              }))
            }
            sx={{ minWidth: 300, '& .MuiInputBase-input': { fontSize: '0.8rem' } }}
          />
        </Box>
      );

      return (
        <ParamRow
          key={key}
          label={def.label || name}
          control={wrapWithDrop(defaultControl, def, key)}
          helpText={def.help}
          rowIndex={rowIndex}
        />
      );
    },
    [protocolDetails.params, expandedGroups, dragOverKey, currentDraggedOutput]
  );



  if (!data || !protocolDetails.params) return null;

  return (
    <div className="protocol-form slide-in-right">
      {/* HEADER */}
      <div className="form-header">
        <div className="form-title-wrapper">
          <Box
            className="inline-flex items-center justify-center rounded-full bg-green-500 text-black text-xs font-bold px-2 py-1"
          >
            {data.id}
          </Box>
          <h2>{protocolDetails.label}</h2>
          <span
            className="node-status-pill"
            style={{ backgroundColor: protocolDetails.color, color: 'black' }}
          >
            {protocolDetails.status || 'Unknown'}
          </span>
        </div>
        <button className="close-btn" onClick={onClose}>
          ×
        </button>
      </div>

      {/* Execution error message */}
      {execError && (
        <Typography
          color="error"
          variant="body2"
          sx={{ px: 2, py: 1 }}
        >
          {execError}
        </Typography>
      )}

      {/* ===== BODY ===== */}
      <div
        className="form-body"
        style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}
      >
        <Box
          sx={{
            flexGrow: 7,
            overflowY: 'auto',
            backgroundColor: '#f9fafb',
            borderRadius: 2,
            boxShadow: '0px 2px 6px rgba(0,0,0,0.2)',
            p: 1,
          }}
        >
          <Tabs
            value={topTab}
            onChange={(e, val) => setTopTab(val)}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            sx={{
              '& .MuiTab-root': {
                textTransform: 'none',
                fontSize: '0.8rem',
                fontWeight: 500,
                minHeight: 48,
              },
              '& .Mui-selected': {
                backgroundColor: 'white',
                borderRadius: 1,
              },
            }}
          >
            <Tab label="Inputs and Parameters" />
            <Tab label="Outputs" />
            <Tab label="Summary" />
            <Tab label="Methods" />
            <Tab label="Logs" />
          </Tabs>

          <Box className="top-tab-content" sx={{ p: 1 }}>
            {topTab === 0 && (
              <>
                <Tabs
                  value={sectionTab}
                  onChange={(e, val) => setSectionTab(val)}
                  variant="scrollable"
                  scrollButtons="auto"
                  allowScrollButtonsMobile
                  sx={{
                    mb: 2,
                    '& .MuiTab-root': {
                      textTransform: 'none',
                      fontSize: '0.8rem',
                      fontWeight: 500,
                    },
                  }}
                >
                  {data.definition.map((section: any, idx: number) => (
                    <Tab
                      key={idx}
                      label={section.name || `Section ${idx + 1}`}
                    />
                  ))}
                </Tabs>
                <Box>
                  {data.definition[sectionTab]?.params?.map(
                    (paramObj: any, idx: number) =>
                      renderParam(paramObj, sectionTab, idx)
                  )}
                </Box>
              </>
            )}
            {topTab === 1 && (
              <Typography variant="body1">Outputs content goes here.</Typography>
            )}
            {topTab === 2 && (
              <Typography variant="body1">Summary content goes here.</Typography>
            )}
            {topTab === 3 && (
              <Typography variant="body1">Methods content goes here.</Typography>
            )}
            {topTab === 4 && (
              <Box sx={{ flexGrow: 3, overflowY: 'auto' }}>
                <Tabs
                  value={bottomTab}
                  onChange={(e, val) => setBottomTab(val)}
                  sx={{
                    mb: 2,
                    '& .MuiTab-root': {
                      textTransform: 'none',
                      fontSize: '0.8rem',
                      fontWeight: 500,
                    },
                  }}
                >
                  {['Output Log', 'Project Log'].map((label, index) => (
                    <Tab key={index} label={label} />
                  ))}
                </Tabs>
                <Box className="bottom-tab-content" sx={{ p: 2 }}>
                  {bottomTab === 0 && (
                    <Typography variant="body1">Outputs Log</Typography>
                  )}
                  {bottomTab === 1 && (
                    <Typography variant="body1">Project Log</Typography>
                  )}
                </Box>
              </Box>
            )}
          </Box>
        </Box>
      </div>

      {/* ===== FOOTER ===== */}
      <div className="form-footer">
        <Button
          variant="outlined"
          startIcon={<CloseIcon />}
          onClick={onClose}
          disabled={execLoading}
          sx={{ textTransform: 'none' }}
        >
          Close
        </Button>
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          onClick={() => console.log('Save', getSerializedParams())}
          disabled={execLoading}
          sx={{ textTransform: 'none' }}
        >
          Save
        </Button>
        <Button
          variant="contained"
          startIcon={
            execLoading ? (
              <CircularProgress size={16} color="inherit" />
            ) : (
              <ExecuteIcon />
            )
          }
          color="success"
          onClick={handleExecute}
          disabled={execLoading}
          sx={{ textTransform: 'none' }}
        >
          {execLoading ? 'Executing...' : 'Execute'}
        </Button>
      </div>
    </div>
  );
}
