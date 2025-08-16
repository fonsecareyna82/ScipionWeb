// src/components/ProtocolForm.tsx

import { useState, useEffect, JSX } from 'react';
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
  // UI tabs
  const [topTab, setTopTab] = useState(0);
  const [bottomTab, setBottomTab] = useState(0);
  const [sectionTab, setSectionTab] = useState(0);

  // protocol details & form state
  const [protocolDetails, setProtocolDetails] = useState<any>({});
  const [expandedGroups, setExpandedGroups] = useState<{ [key: string]: boolean }>({});

  // execution state
  const [execLoading, setExecLoading] = useState(false);
  const [execError, setExecError] = useState<string | null>(null);

  // ---------- Helpers ----------
  const parseFromJSONValue = (maybeJson: any) => {
    try {
      if (typeof maybeJson === 'string') {
        const obj = JSON.parse(maybeJson);
        if (obj && typeof obj === 'object' && '_objValue' in obj) {
          return obj._objValue;
        }
      }
    } catch {}
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
    const fieldKey = `${sectionIdx}_${paramName}`;
    const paramState = protocolDetails.params?.[fieldKey];
    if (!paramState) return '';
    if (paramState._class === 'EnumParam' && Array.isArray(paramState.choices)) {
      const editable = paramState.editableValue ?? paramState.default ?? '';
      if (typeof editable === 'number') return editable;
      const idx = paramState.choices.indexOf(editable);
      return idx >= 0 ? idx : 0;
    }
    return paramState.editableValue ?? '';
  };

  const evalAtom = (sectionIdx: number, atomRaw: string): boolean => {
    let atom = atomRaw.replace(/[()]/g, '').trim();
    let negate = false;
    if (/^not\s+/i.test(atom)) {
      negate = true;
      atom = atom.replace(/^not\s+/i, '').trim();
    } else if (atom.startsWith('!')) {
      negate = true;
      atom = atom.slice(1).trim();
    }
    const m = atom.match(/^(.*?)\s*(==|!=|>=|<=|>|<|=)\s*(.*)$/);
    let result: boolean;
    if (m) {
      const [, leftRaw, opRaw, rightRaw] = m;
      const left = coerceToken(getParamCurrentValue(sectionIdx, leftRaw.trim()));
      const op = opRaw === '=' ? '==' : opRaw;
      const right = coerceToken(rightRaw.replace(/[()]/g, '').trim());
      switch (op) {
        case '==':
          result = left === right;
          break;
        case '!=':
          result = left !== right;
          break;
        case '>':
          result = (left as any) > (right as any);
          break;
        case '<':
          result = (left as any) < (right as any);
          break;
        case '>=':
          result = (left as any) >= (right as any);
          break;
        case '<=':
          result = (left as any) <= (right as any);
          break;
        default:
          result = false;
      }
    } else {
      const val = coerceToken(getParamCurrentValue(sectionIdx, atom));
      result = !!(val === true || val === 'True' || val === 1 || val === '1');
    }
    return negate ? !result : result;
  };

  const evalExpr = (sectionIdx: number, exprRaw: string): boolean => {
    const expr = exprRaw
      .replace(/[()]/g, ' ')
      .replace(/\band\b/gi, '&&')
      .replace(/\bor\b/gi, '||')
      .replace(/\s+/g, ' ')
      .trim();
    if (!expr) return true;
    const orParts = expr.split('||').map((s) => s.trim()).filter(Boolean);
    return orParts.some((orPart) =>
      orPart
        .split('&&')
        .map((s) => s.trim())
        .filter(Boolean)
        .every((atom) => evalAtom(sectionIdx, atom))
    );
  };

  // ---------- Initialization of params ----------
  useEffect(() => {
    if (!data) {
      setProtocolDetails({});
      return;
    }
    const initialParams: any = {};
    const addParamRec = (sectionIdx: number, paramObj: any) => {
      const [pName, pData] = Object.entries(paramObj)[0] as [string, any];
      if (pData?._class === 'Group' && Array.isArray(pData.children)) {
        pData.children.forEach((child: any) => addParamRec(sectionIdx, child));
        return;
      }
      const fieldKey = `${sectionIdx}_${pName}`;
      const rawInit = pData?.value ?? pData?.default ?? '';
      const parsedInit = parseFromJSONValue(rawInit);
      let editableInit: any = parsedInit ?? '';
      if (
        pData?._class === 'EnumParam' &&
        Array.isArray(pData.choices) &&
        typeof editableInit === 'number'
      ) {
        editableInit = pData.choices[editableInit] ?? pData.default ?? '';
      }
      initialParams[fieldKey] = {
        ...pData,
        value: pData?.value,
        editableValue: editableInit,
      };
    };
    data.definition?.forEach((section: any, sIdx: number) => {
      section.params?.forEach((paramObj: any) => addParamRec(sIdx, paramObj));
    });
    setProtocolDetails({
      label: data.protocolName || '',
      status: data.status || '',
      id: data.id || '',
      color: data.color || '',
      params: initialParams,
    });
  }, [data]);

  // ---------- ParamRow component ----------
  const ParamRow = ({
    label,
    control,
    rowIndex = 0,
    helpText,
    isPointerParam,
    onClear,
  }: {
    label: string;
    rowIndex?: number;
    control: JSX.Element;
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
            backgroundColor: rowIndex % 2 === 1 ? 'white' : '#EDEBEB',
          }}
        >
          <Typography
            variant="body2"
            sx={{
              justifySelf: 'start',
              pr: 2,
              fontSize: '0.8rem',
              fontWeight: 500,
            }}
          >
            {label}
          </Typography>
          <Box sx={{ justifySelf: 'start' }}>{control}</Box>
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
                <IconButton size="small" onClick={() => console.log('Eye clicked')}>
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
          <Dialog
            open={openHelp}
            onClose={() => setOpenHelp(false)}
            maxWidth="sm"
            fullWidth
          >
            <DialogTitle className="form-header">Help</DialogTitle>
            <DialogContent sx={{ padding: 2 }}>
              <Typography variant="body2" sx={{ lineHeight: 1.6, mt: 2 }}>
                {helpText}
              </Typography>
            </DialogContent>
            <DialogActions sx={{ padding: 1, justifyContent: 'center' }}>
              <Button
                onClick={() => setOpenHelp(false)}
                variant="outlined"
                startIcon={<CloseIcon />}
              >
                Close
              </Button>
            </DialogActions>
          </Dialog>
        )}
      </>
    );
  };

  // ---------- MultiParamRow component ----------
  const MultiParamRow = ({
    label,
    items,
    rowIndex = 0,
    helpText,
    onRowClear,
  }: {
    label: string;
    items: any[];
    rowIndex: number;
    helpText?: string;
    onRowClear?: (index: number) => void;
  }) => {
    const [openHelp, setOpenHelp] = useState(false);

    const displayItems = [...items];
    while (displayItems.length < 5) {
      displayItems.push({ object: '', info: '' });
    }

    const isRowEmpty = (row: any) =>
      (!row?.object || row.object.trim() === '') &&
      (!row?.info || row.info.trim() === '');

    return (
      <Box sx={{ mb: 2 }}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mb: 1,
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {label}
          </Typography>
          {helpText && (
            <Tooltip title="Help">
              <IconButton size="small" onClick={() => setOpenHelp(true)}>
                <HelpIcon fontSize="1.3rem" />
              </IconButton>
            </Tooltip>
          )}
        </Box>

        <Box
          sx={{
            maxHeight: 200,
            overflowY: 'auto',
            border: '1px solid #ddd',
            borderRadius: 1,
          }}
        >
          <Table size="small">
            <TableHead sx={{ backgroundColor: '#BABABA' }}>
              <TableRow>
                <TableCell>Object</TableCell>
                <TableCell>Information</TableCell>
                {onRowClear && <TableCell>Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {displayItems.map((item, idx) => {
                const objVal = item ?? { object: '', info: '' };
                const empty = isRowEmpty(objVal);
                return (
                  <TableRow
                    key={idx}
                    sx={{
                      backgroundColor: idx % 2 === 0 ? '#f5f5f5' : '#ffffff',
                    }}
                  >
                    <TableCell>{objVal.object}</TableCell>
                    <TableCell>{objVal.info}</TableCell>
                    {onRowClear && (
                      <TableCell>
                        {!empty && (
                          <>
                            <IconButton
                              size="small"
                              onClick={() => onRowClear(idx)}
                            >
                              <TrashBinIcon fontSize="1.3rem" />
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={() => console.log('View row', idx)}
                            >
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
          <Dialog
            open={openHelp}
            onClose={() => setOpenHelp(false)}
            maxWidth="sm"
            fullWidth
          >
            <DialogTitle className="form-header">Help</DialogTitle>
            <DialogContent sx={{ padding: 2 }}>
              <Typography variant="body2" sx={{ lineHeight: 1.6, mt: 2 }}>
                {helpText}
              </Typography>
            </DialogContent>
            <DialogActions sx={{ padding: 1, justifyContent: 'center' }}>
              <Button
                onClick={() => setOpenHelp(false)}
                variant="outlined"
                startIcon={<CloseIcon />}
              >
                Close
              </Button>
            </DialogActions>
          </Dialog>
        )}
      </Box>
    );
  };

  // ---------- renderParam helper ----------
  const renderParam = (paramObj: any, sectionIdx: number, rowIndex = 0): JSX.Element | null => {
    const [paramName, paramData] = Object.entries(paramObj)[0] as [string, any];
    if (!protocolDetails?.params) return null;

    const fieldKey = `${sectionIdx}_${paramName}`;
    const value = protocolDetails.params[fieldKey]?.editableValue;
    if (paramData.condition && !evalExpr(sectionIdx, paramData.condition)) {
      return null;
    }

    const advancedTag =
      paramData.expertLevel === 1 ? (
        <Tooltip title="Advanced">
          <div className="inline-flex items-center justify-center rounded-full bg-gray-500 text-white text-xs px-2 py-1">
            A
          </div>
        </Tooltip>
      ) : (
        <div className="inline-flex items-center justify-center rounded-full text-white text-xs px-3 py-1" />
      );

    // MultiPointerParam
    if (paramData._class === 'MultiPointerParam') {
      const items: any[] = Array.isArray(value) ? value : paramData.default ?? [];
      const handleRowClear = (idx: number) => {
        const newItems = [...items];
        newItems.splice(idx, 1);
        newItems.push({ object: '', info: '' });
        setProtocolDetails({
          ...protocolDetails,
          params: {
            ...protocolDetails.params,
            [fieldKey]: {
              ...protocolDetails.params[fieldKey],
              editableValue: newItems,
            },
          },
        });
      };
      return (
        <MultiParamRow
          key={fieldKey}
          rowIndex={rowIndex}
          label={paramData.label || paramName}
          items={items}
          helpText={paramData.help}
          onRowClear={handleRowClear}
        />
      );
    }

    // PointerParam
    if (paramData._class === 'PointerParam') {
      const fieldValue = value ?? paramData.default ?? '';
      const handleClear = () => {
        setProtocolDetails({
          ...protocolDetails,
          params: {
            ...protocolDetails.params,
            [fieldKey]: {
              ...protocolDetails.params[fieldKey],
              editableValue: '',
            },
          },
        });
      };
      const control = (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {advancedTag}
          <TextField
            size="small"
            value={fieldValue}
            onChange={(e) => {
              setProtocolDetails({
                ...protocolDetails,
                params: {
                  ...protocolDetails.params,
                  [fieldKey]: {
                    ...protocolDetails.params[fieldKey],
                    editableValue: e.target.value,
                  },
                },
              });
            }}
            sx={{
              minWidth: 300,
              '& .MuiInputBase-input': { fontSize: '0.8rem', py: 0.5 },
            }}
          />
        </Box>
      );
      return (
        <ParamRow
          key={fieldKey}
          rowIndex={rowIndex}
          label={paramData.label || paramName}
          control={control}
          helpText={paramData.help}
          isPointerParam
          onClear={handleClear}
        />
      );
    }

    // Group
    if (paramData._class === 'Group' && Array.isArray(paramData.children)) {
      const isExpanded = expandedGroups[fieldKey] ?? true;
      return (
        <Box
          key={fieldKey}
          sx={{ mb: 2, pl: 2, border: '2px solid #ddd', borderRadius: 1 }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
              mb: 1,
            }}
            onClick={() =>
              setExpandedGroups({
                ...expandedGroups,
                [fieldKey]: !expandedGroups[fieldKey],
              })
            }
          >
            <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
              {paramData.label || paramName}
            </Typography>
            {isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
          </Box>
          {isExpanded &&
            paramData.children.map((childObj: any, idx: number) =>
              renderParam(childObj, sectionIdx, idx)
            )}
        </Box>
      );
    }

    // EnumParam
    if (paramData._class === 'EnumParam' && Array.isArray(paramData.choices)) {
      let selectedValue: any = value ?? paramData.default ?? '';
      if (typeof selectedValue === 'number') {
        selectedValue = paramData.choices[selectedValue] ?? '';
      }
      const controlBase =
        paramData.display === 0 ? (
          <RadioGroup
            row
            value={selectedValue}
            onChange={(e) => {
              const newValue = e.target.value;
              setProtocolDetails({
                ...protocolDetails,
                params: {
                  ...protocolDetails.params,
                  [fieldKey]: {
                    ...protocolDetails.params[fieldKey],
                    editableValue: newValue,
                  },  
                },
              });
            }}
          >
            {paramData.choices.map((choice: string, idx: number) => (
              <FormControlLabel
                key={idx}
                value={choice}
                control={<Radio size="small" />}
                label={choice}
              />
            ))}
          </RadioGroup>
        ) : (
          <TextField
            select
            size="small"
            value={selectedValue}
            onChange={(e) => {
              const newValue = e.target.value;
              setProtocolDetails({
                ...protocolDetails,
                params: {
                  ...protocolDetails.params,
                  [fieldKey]: {
                    ...protocolDetails.params[fieldKey],
                    editableValue: newValue,
                  },
                },  
              });
            }}
            SelectProps={{ native: true }}
            sx={{
              minWidth: 300,
              '& .MuiInputBase-input': { fontSize: '0.8rem', py: 0.5 },
            }}
          >
            {paramData.choices.map((choice: string, idx: number) => (
              <option key={idx} value={choice}>
                {choice}
              </option>
            ))}
          </TextField>
        );
      const control = (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {advancedTag}
          {controlBase}
        </Box>
      );
      return (
        <ParamRow
          key={fieldKey}
          rowIndex={rowIndex}
          label={paramData.label || paramName}
          control={control}
          helpText={paramData.help}
        />
      );
    }

    // BooleanParam
    if (paramData._class === 'BooleanParam') {
      const boolValue =
        value !== undefined
          ? (value === 'True' || value === true || value === 1 || value === '1')
          : (paramData.default === 'True' ||
             paramData.default === true ||
             paramData.default === 1 ||
             paramData.default === '1');
      const control = (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {advancedTag}
          <Switch
            checked={!!boolValue}
            onChange={(e) => {
              const newValue = e.target.checked ? 'True' : 'False';
              setProtocolDetails({
                ...protocolDetails,
                params: {
                  ...protocolDetails.params,
                  [fieldKey]: {
                    ...protocolDetails.params[fieldKey],
                    editableValue: newValue,
                  },
                },
              });
            }}
            color="primary"
          />
        </Box>
      );
      return (
        <ParamRow
          key={fieldKey}
          rowIndex={rowIndex}
          label={paramData.label || paramName}
          control={control}
          helpText={paramData.help}
        />
      );
    }

    // Default TextField
    const fieldValue = value ?? paramData.default ?? '';
    const control = (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {advancedTag}
        <TextField
          variant="outlined"
          size="small"
          name={fieldKey}
          value={fieldValue}
          onChange={(e) => {
            const { name, value } = e.target;
            setProtocolDetails({
              ...protocolDetails,
              params: {
                ...protocolDetails.params,
                [name]: {
                  ...protocolDetails.params[name],
                  editableValue: value,
                },
              },
            });
          }}
          sx={{
            minWidth: 300,
            '& .MuiInputBase-input': { fontSize: '0.8rem', py: 0.5 },
          }}
        />
      </Box>
    );
    return (
      <ParamRow
        key={fieldKey}
        rowIndex={rowIndex}
        label={paramData.label || paramName}
        control={control}
        helpText={paramData.help}
      />
    );
  };

  // ---------- Serialize params ----------
  const getSerializedParams = () => {
    const updatedParams: any = {};
    Object.entries(protocolDetails.params || {}).forEach(([key, param]: any) => {
      let newValue = param.value;
      try {
        const obj = JSON.parse(param.value);
        obj._objValue = param.editableValue;
        newValue = JSON.stringify(obj, null, 2);
      } catch {
        newValue = param.editableValue;
      }
      updatedParams[key] = { ...param, value: newValue };
    });
    return updatedParams;
  };

  // ---------- Execute handler ----------
  const handleExecute = async () => {
    setExecLoading(true);
    setExecError(null);
    try {
      const params = getSerializedParams();
      await executeProtocol(data.id, params);
      onClose();
    } catch (err: any) {
      console.error(err);
      setExecError(err.message || 'Error al ejecutar protocolo');
    } finally {
      setExecLoading(false);
    }
  };

  if (!data || !protocolDetails.params) return null;

  return (
    <div className="protocol-form slide-in-right">
      {/* ===== HEADER ===== */}
      <div className="form-header">
        <div className="form-title-wrapper">
          <div className="inline-flex items-center justify-center rounded-full bg-green-500 text-black text-xs font-bold px-2 py-1">
            {data.id}
          </div>
          <h2>{protocolDetails.label}</h2>
          <span
            className="node-status-pill"
            style={{
              backgroundColor: protocolDetails.color,
              color: 'black',
            }}
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
        >
          Close
        </Button>
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          onClick={() => console.log('Save', getSerializedParams())}
          disabled={execLoading}
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
        >
          {execLoading ? 'Ejecutando…' : 'Execute'}
        </Button>
      </div>
    </div>
  );
}
