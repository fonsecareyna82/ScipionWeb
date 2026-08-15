import { useMemo } from "react";
import Grid from "@mui/material/Grid";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Divider,
  FormControlLabel,
  IconButton,
  Paper,
  Skeleton,
  Stack,
  Switch,
  Table as MuiTable,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import { CircleAlert, Plus, Trash2 } from "lucide-react";

export type HostQueueParam = {
  variableName: string;
  value: string;
  label: string;
  help: string;
};

export type HostQueue = {
  name: string;
  params: HostQueueParam[];
};

export type HostSettings = {
  hostAlias: string;
  schedulerName: string;
  mandatory: boolean;
  parallelCommand: string;
  submitCommand: string;
  cancelCommand: string;
  checkCommand: string;
  jobDoneRegex: string;
  submitTemplate: string;
  queues: HostQueue[];
};

type HostSettingsPanelProps = {
  value: HostSettings | null;
  onChange: (next: HostSettings) => void;
  loading: boolean;
  error: string | null;
  fieldSx: SxProps<Theme>;
  cardSx: SxProps<Theme>;
  cardHeaderSx: SxProps<Theme>;
  dividerSx: SxProps<Theme>;
  colors: {
    border: string;
    text: string;
    muted: string;
    surface: string;
    hover: string;
    primary: string;
  };
};

export const defaultHostSettings: HostSettings = {
  hostAlias: "localhost",
  schedulerName: "PBS/TORQUE",
  mandatory: false,
  parallelCommand: "mpirun -np %_(JOB_NODES)d %_(COMMAND)s",
  submitCommand: "qsub %_(JOB_SCRIPT)s",
  cancelCommand: "canceljob %_(JOB_ID)s",
  checkCommand: "qstat %_(JOB_ID)s",
  jobDoneRegex: "",
  submitTemplate: `#!/bin/bash
### Inherit all current environment variables
#PBS -V
### Job name
#PBS -N %_(JOB_NAME)s
### Queue name
###PBS -q %_(JOB_QUEUE)s
### Standard output and standard error messages
#PBS -k eo
### Specify the number of nodes and thread (ppn) for your job.
#PBS -l nodes=%_(JOB_NODES)d:ppn=%_(JOB_THREADS)d
### Tell PBS the anticipated run-time for your job, where walltime=HH:MM:SS
#PBS -l walltime=%_(JOB_HOURS)d:00:00
# Use as working dir the path where qsub was launched
WORKDIR=$PBS_O_WORKDIR
#################################
### Set environment variable to know running mode is non interactive
export XMIPP_IN_QUEUE=1
### Switch to the working directory;
cd $WORKDIR
# Make a copy of PBS_NODEFILE
cp $PBS_NODEFILE %_(JOB_NODEFILE)s
# Calculate the number of processors allocated to this run.
NPROCS=\`wc -l < $PBS_NODEFILE\`
# Calculate the number of nodes allocated.
NNODES=\`uniq $PBS_NODEFILE | wc -l\`
### Display the job context
echo Running on host \`hostname\`
echo Time is \`date\`
echo Working directory is \`pwd\`
echo Using \${NPROCS} processors across \${NNODES} nodes
echo PBS_NODEFILE:
cat $PBS_NODEFILE
#################################
%_(JOB_COMMAND)s`,
  queues: [{ name: "default", params: [] }],
};

function readString(raw: unknown, fallback = ""): string {
  if (typeof raw === "string") return raw;
  if (raw == null) return fallback;
  return String(raw);
}

function readBool(raw: unknown, fallback = false): boolean {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") {
    const value = raw.trim().toLowerCase();
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return fallback;
}

function normalizeQueueParamFromArray(raw: unknown[]): HostQueueParam | null {
  const values = Array.isArray(raw) ? [...raw] : [];
  while (values.length < 4) values.push("");

  const variableName = readString(values[0]).trim();
  if (!variableName) return null;

  return {
    variableName,
    value: readString(values[1]),
    label: readString(values[2]),
    help: readString(values[3]),
  };
}

function normalizeQueueParams(raw: unknown): HostQueueParam[] {
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (Array.isArray(item)) {
          return normalizeQueueParamFromArray(item);
        }

        if (item && typeof item === "object") {
          const obj = item as Record<string, unknown>;
          const variableName = readString(
            obj.variableName ?? obj.key ?? obj.name ?? "",
          ).trim();

          if (!variableName) return null;

          return {
            variableName,
            value: readString(obj.value ?? ""),
            label: readString(obj.label ?? ""),
            help: readString(obj.help ?? ""),
          };
        }

        return null;
      })
      .filter(Boolean) as HostQueueParam[];
  }

  if (raw && typeof raw === "object") {
    return Object.entries(raw as Record<string, unknown>)
      .map(([key, value]) => {
        const variableName = readString(key).trim();
        if (!variableName) return null;

        return {
          variableName,
          value: readString(value),
          label: variableName,
          help: "",
        };
      })
      .filter(Boolean) as HostQueueParam[];
  }

  return [];
}

function normalizeQueues(raw: unknown): HostQueue[] {
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (!item || typeof item !== "object") return null;

        const obj = item as Record<string, unknown>;
        const name = readString(obj.name ?? "").trim();
        if (!name) return null;

        return {
          name,
          params: normalizeQueueParams(obj.params),
        };
      })
      .filter(Boolean) as HostQueue[];
  }

  if (raw && typeof raw === "object") {
    return Object.entries(raw as Record<string, unknown>)
      .map(([name, paramsRaw]) => {
        const queueName = readString(name).trim();
        if (!queueName) return null;

        return {
          name: queueName,
          params: normalizeQueueParams(paramsRaw),
        };
      })
      .filter(Boolean) as HostQueue[];
  }

  return [];
}

export function sanitizeHostSettings(raw: unknown): HostSettings {
  const source =
    raw && typeof raw === "object" && (raw as Record<string, unknown>).config
      ? ((raw as Record<string, unknown>).config as Record<string, unknown>)
      : ((raw as Record<string, unknown> | null) ?? {});

  const hasData = Object.keys(source).length > 0;
  if (!hasData) {
    return {
      ...defaultHostSettings,
      queues: defaultHostSettings.queues.map((queue) => ({
        ...queue,
        params: queue.params.map((param) => ({ ...param })),
      })),
    };
  }

  const rawQueues =
    source.queues !== undefined ? source.queues : source.QUEUES;
  const normalizedQueues =
    rawQueues === undefined ? defaultHostSettings.queues : normalizeQueues(rawQueues);

  return {
    hostAlias: readString(
      source.hostAlias ?? source.hostName ?? source.section ?? source.HOST_ALIAS,
      defaultHostSettings.hostAlias,
    ).trim() || defaultHostSettings.hostAlias,

    schedulerName: readString(
      source.schedulerName ?? source.NAME,
      defaultHostSettings.schedulerName,
    ).trim() || defaultHostSettings.schedulerName,

    mandatory: readBool(
      source.mandatory ?? source.MANDATORY,
      defaultHostSettings.mandatory,
    ),

    parallelCommand: readString(
      source.parallelCommand ?? source.PARALLEL_COMMAND,
      defaultHostSettings.parallelCommand,
    ),

    submitCommand: readString(
      source.submitCommand ?? source.SUBMIT_COMMAND,
      defaultHostSettings.submitCommand,
    ),

    cancelCommand: readString(
      source.cancelCommand ?? source.CANCEL_COMMAND,
      defaultHostSettings.cancelCommand,
    ),

    checkCommand: readString(
      source.checkCommand ?? source.CHECK_COMMAND,
      defaultHostSettings.checkCommand,
    ),

    jobDoneRegex: readString(
      source.jobDoneRegex ?? source.JOB_DONE_REGEX,
      defaultHostSettings.jobDoneRegex,
    ),

    submitTemplate: readString(
      source.submitTemplate ?? source.SUBMIT_TEMPLATE,
      defaultHostSettings.submitTemplate,
    ),

    queues: normalizedQueues.map((queue) => ({
      name: queue.name,
      params: queue.params.map((param) => ({
        variableName: param.variableName,
        value: param.value,
        label: param.label,
        help: param.help,
      })),
    })),
  };
}

function normalizeForCompare(value: HostSettings): HostSettings {
  return {
    hostAlias: value.hostAlias.trim(),
    schedulerName: value.schedulerName.trim(),
    mandatory: Boolean(value.mandatory),
    parallelCommand: value.parallelCommand,
    submitCommand: value.submitCommand,
    cancelCommand: value.cancelCommand,
    checkCommand: value.checkCommand,
    jobDoneRegex: value.jobDoneRegex,
    submitTemplate: value.submitTemplate,
    queues: value.queues.map((queue) => ({
      name: queue.name.trim(),
      params: queue.params.map((param) => ({
        variableName: param.variableName.trim(),
        value: param.value,
        label: param.label,
        help: param.help,
      })),
    })),
  };
}

export function buildHostPatch(
  base: HostSettings,
  next: HostSettings,
): Partial<HostSettings> {
  const patch: Partial<HostSettings> = {};

  if (base.hostAlias !== next.hostAlias) patch.hostAlias = next.hostAlias;
  if (base.schedulerName !== next.schedulerName) {
    patch.schedulerName = next.schedulerName;
  }
  if (base.mandatory !== next.mandatory) patch.mandatory = next.mandatory;
  if (base.parallelCommand !== next.parallelCommand) {
    patch.parallelCommand = next.parallelCommand;
  }
  if (base.submitCommand !== next.submitCommand) {
    patch.submitCommand = next.submitCommand;
  }
  if (base.cancelCommand !== next.cancelCommand) {
    patch.cancelCommand = next.cancelCommand;
  }
  if (base.checkCommand !== next.checkCommand) {
    patch.checkCommand = next.checkCommand;
  }
  if (base.jobDoneRegex !== next.jobDoneRegex) {
    patch.jobDoneRegex = next.jobDoneRegex;
  }
  if (base.submitTemplate !== next.submitTemplate) {
    patch.submitTemplate = next.submitTemplate;
  }

  const baseQueues = JSON.stringify(normalizeForCompare(base).queues);
  const nextQueues = JSON.stringify(normalizeForCompare(next).queues);
  if (baseQueues !== nextQueues) patch.queues = next.queues;

  return patch;
}

function getNextQueueName(queues: HostQueue[]): string {
  let index = 1;
  while (queues.some((queue) => queue.name === `queue${index}`)) {
    index += 1;
  }
  return `queue${index}`;
}

function getNextVariableName(params: HostQueueParam[]): string {
  let index = 1;
  while (params.some((param) => param.variableName === `PARAM_${index}`)) {
    index += 1;
  }
  return `PARAM_${index}`;
}

function getValidationWarnings(value: HostSettings | null): string[] {
  if (!value) return [];

  const warnings: string[] = [];
  const queueNames = value.queues
    .map((queue) => queue.name.trim())
    .filter(Boolean);

  const duplicateQueueNames = queueNames.filter(
    (name, index) => queueNames.indexOf(name) !== index,
  );

  if (!value.submitTemplate.includes("%_(JOB_COMMAND)s")) {
    warnings.push('The submit template does not contain "%_(JOB_COMMAND)s".');
  }

  if (!value.submitCommand.includes("%_(JOB_SCRIPT)s")) {
    warnings.push('The submit command does not contain "%_(JOB_SCRIPT)s".');
  }

  if (value.submitTemplate.includes("%_(JOB_QUEUE)s") && queueNames.length === 0) {
    warnings.push('The template references "%_(JOB_QUEUE)s" but no queues are defined.');
  }

  if (value.mandatory && queueNames.length === 0) {
    warnings.push("Queue usage is mandatory, but there are no queues configured.");
  }

  if (duplicateQueueNames.length > 0) {
    warnings.push("There are duplicate queue names.");
  }

  value.queues.forEach((queue) => {
    const variableNames = queue.params
      .map((param) => param.variableName.trim())
      .filter(Boolean);

    const duplicateVariableNames = variableNames.filter(
      (name, index) => variableNames.indexOf(name) !== index,
    );

    if (duplicateVariableNames.length > 0) {
      warnings.push(`Queue "${queue.name}" has duplicate variable names.`);
    }
  });

  if (!value.parallelCommand.trim()) {
    warnings.push("Parallel command is empty.");
  }

  return Array.from(new Set(warnings));
}

const availablePlaceholders = [
  "%_(JOB_NAME)s",
  "%_(JOB_SCRIPT)s",
  "%_(JOB_COMMAND)s",
  "%_(JOB_QUEUE)s",
  "%_(JOB_ID)s",
  "%_(JOB_NODEFILE)s",
  "%_(JOB_NODES)d",
  "%_(JOB_THREADS)d",
  "%_(JOB_HOURS)d",
  "%_(COMMAND)s",
];

export default function HostSettingsPanel({
  value,
  onChange,
  loading,
  error,
  fieldSx,
  cardSx,
  cardHeaderSx,
  dividerSx,
  colors,
}: HostSettingsPanelProps) {
  const warnings = useMemo(() => getValidationWarnings(value), [value]);

  if (loading && !value) {
    return (
      <Stack spacing={1.75}>
        <Skeleton variant="rounded" height={120} />
        <Skeleton variant="rounded" height={160} />
        <Skeleton variant="rounded" height={280} />
        <Skeleton variant="rounded" height={340} />
      </Stack>
    );
  }

  if (!value) {
    return <Alert severity="warning">Host settings are not available.</Alert>;
  }

  const updateValue = (patch: Partial<HostSettings>) => {
    onChange({ ...value, ...patch });
  };

  const updateQueue = (queueIndex: number, patch: Partial<HostQueue>) => {
    const nextQueues = value.queues.map((queue, index) =>
      index === queueIndex ? { ...queue, ...patch } : queue,
    );
    updateValue({ queues: nextQueues });
  };

  const removeQueue = (queueIndex: number) => {
    updateValue({
      queues: value.queues.filter((_, index) => index !== queueIndex),
    });
  };

  const addQueue = () => {
    updateValue({
      queues: [
        ...value.queues,
        {
          name: getNextQueueName(value.queues),
          params: [],
        },
      ],
    });
  };

  const addQueueParam = (queueIndex: number) => {
    const queue = value.queues[queueIndex];
    if (!queue) return;

    updateQueue(queueIndex, {
      params: [
        ...queue.params,
        {
          variableName: getNextVariableName(queue.params),
          value: "",
          label: "",
          help: "",
        },
      ],
    });
  };

  const updateQueueParam = (
    queueIndex: number,
    paramIndex: number,
    patch: Partial<HostQueueParam>,
  ) => {
    const queue = value.queues[queueIndex];
    if (!queue) return;

    const nextParams = queue.params.map((param, index) =>
      index === paramIndex ? { ...param, ...patch } : param,
    );

    updateQueue(queueIndex, { params: nextParams });
  };

  const removeQueueParam = (queueIndex: number, paramIndex: number) => {
    const queue = value.queues[queueIndex];
    if (!queue) return;

    updateQueue(queueIndex, {
      params: queue.params.filter((_, index) => index !== paramIndex),
    });
  };

  return (
    <Stack spacing={1.75}>
      {error && <Alert severity="error">{error}</Alert>}

      {warnings.length > 0 && (
        <Alert
          severity="warning"
          icon={<CircleAlert size={18} />}
          sx={{
            border: "1px solid",
            borderColor: colors.border,
            bgcolor: colors.hover,
            color: colors.text,
          }}
        >
          <Stack spacing={0.5}>
            {warnings.map((warning) => (
              <Typography
                key={warning}
                sx={{ fontSize: 12.5, color: colors.text }}
              >
                • {warning}
              </Typography>
            ))}
          </Stack>
        </Alert>
      )}

      <Card variant="outlined" sx={cardSx}>
        <CardHeader
          title="General"
          subheader="Host identity, scheduler label, and queue policy."
          sx={cardHeaderSx}
        />
        <CardContent sx={{ pt: 2 }}>
          <Grid container spacing={2} sx={{ width: "100%" }}>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                sx={fieldSx}
                fullWidth
                size="small"
                label="Host alias"
                value={value.hostAlias}
                onChange={(e) => updateValue({ hostAlias: e.target.value })}
                helperText='Example: "localhost" or "cluster"'
              />
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                sx={fieldSx}
                fullWidth
                size="small"
                label="Scheduler name"
                value={value.schedulerName}
                onChange={(e) => updateValue({ schedulerName: e.target.value })}
                helperText='Examples: "PBS/TORQUE", "SLURM", "SGE"'
              />
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={Boolean(value.mandatory)}
                    onChange={(e) => updateValue({ mandatory: e.target.checked })}
                    size="small"
                  />
                }
                label={
                  <Typography
                    sx={{ fontSize: 13.5, fontWeight: 700, color: colors.text }}
                  >
                    Queue required
                  </Typography>
                }
              />
              <Typography sx={{ fontSize: 12, color: colors.muted }}>
                Forces jobs to be submitted through a queue.
              </Typography>
            </Grid>

            <Grid size={{ xs: 12 }}>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip size="small" label={`Queues: ${value.queues.length}`} />
                <Chip size="small" label={value.schedulerName || "Unknown scheduler"} />
              </Stack>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card variant="outlined" sx={cardSx}>
        <CardHeader
          title="Commands"
          subheader="Execution and queue interaction commands."
          sx={cardHeaderSx}
        />
        <CardContent sx={{ pt: 2 }}>
          <Grid container spacing={2} sx={{ width: "100%" }}>
            <Grid size={{ xs: 12 }}>
              <TextField
                sx={fieldSx}
                fullWidth
                size="small"
                label="Parallel command"
                value={value.parallelCommand}
                onChange={(e) => updateValue({ parallelCommand: e.target.value })}
                helperText='Example: mpirun -np %_(JOB_NODES)d %_(COMMAND)s'
              />
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                sx={fieldSx}
                fullWidth
                size="small"
                label="Submit command"
                value={value.submitCommand}
                onChange={(e) => updateValue({ submitCommand: e.target.value })}
                helperText='Usually includes "%_(JOB_SCRIPT)s"'
              />
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                sx={fieldSx}
                fullWidth
                size="small"
                label="Cancel command"
                value={value.cancelCommand}
                onChange={(e) => updateValue({ cancelCommand: e.target.value })}
                helperText='Usually includes "%_(JOB_ID)s"'
              />
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                sx={fieldSx}
                fullWidth
                size="small"
                label="Check command"
                value={value.checkCommand}
                onChange={(e) => updateValue({ checkCommand: e.target.value })}
                helperText='Usually includes "%_(JOB_ID)s"'
              />
            </Grid>

            <Grid size={{ xs: 12 }}>
              <TextField
                sx={fieldSx}
                fullWidth
                size="small"
                label="Job done regex"
                value={value.jobDoneRegex}
                onChange={(e) => updateValue({ jobDoneRegex: e.target.value })}
                helperText="Optional regex used to detect completed jobs."
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card variant="outlined" sx={cardSx}>
        <CardHeader
          title="Submit template"
          subheader="Template used to generate the scheduler submit script."
          sx={cardHeaderSx}
        />
        <CardContent sx={{ pt: 2 }}>
          <Stack spacing={1.5}>
            <Box
              sx={{
                p: 1.25,
                borderRadius: 2,
                bgcolor: colors.hover,
                border: "1px solid",
                borderColor: colors.border,
              }}
            >
              <Typography
                sx={{ fontSize: 12.5, fontWeight: 800, mb: 0.75, color: colors.text }}
              >
                Available placeholders
              </Typography>

              <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                {availablePlaceholders.map((placeholder) => (
                  <Chip
                    key={placeholder}
                    size="small"
                    label={placeholder}
                    sx={{
                      border: "1px solid",
                      borderColor: colors.border,
                      bgcolor: "transparent",
                      color: colors.text,
                      fontFamily:
                        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                    }}
                  />
                ))}
              </Stack>
            </Box>

            <TextField
              sx={fieldSx}
              fullWidth
              multiline
              minRows={18}
              size="small"
              label="Template"
              value={value.submitTemplate}
              onChange={(e) => updateValue({ submitTemplate: e.target.value })}
              inputProps={{
                style: {
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  fontSize: "12px",
                  color: colors.text,
                },
              }}
              helperText="Use placeholders instead of hardcoded job-specific values."
            />
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined" sx={cardSx}>
        <CardHeader
          title="Queues"
          subheader="Queues exposed to the UI and their variable definitions."
          sx={cardHeaderSx}
          action={
            <Button
              variant="outlined"
              size="small"
              onClick={addQueue}
              startIcon={<Plus size={16} />}
              sx={{
                textTransform: "none",
                fontSize: 12,
                color: colors.text,
                borderColor: colors.border,
                backgroundColor: "wheat",
              }}
            >
              Add queue
            </Button>
          }
        />
        <CardContent sx={{ pt: 2 }}>
          {value.queues.length === 0 ? (
            <Alert severity="info">No queues configured.</Alert>
          ) : (
            <Stack spacing={1.5}>
              {value.queues.map((queue, queueIndex) => (
                <Box
                  key={`${queue.name}-${queueIndex}`}
                  sx={{
                    border: "1px solid",
                    borderColor: colors.border,
                    borderRadius: 2,
                    overflow: "hidden",
                  }}
                >
                  <Box
                    sx={{
                      px: 1.5,
                      py: 1.25,
                      bgcolor: colors.surface,
                      borderBottom: "1px solid",
                      borderColor: colors.border,
                    }}
                  >
                    <Stack
                      direction={{ xs: "column", md: "row" }}
                      spacing={1.25}
                      alignItems={{ xs: "stretch", md: "center" }}
                    >
                      <Box sx={{ flex: 1 }}>
                        <TextField
                          sx={{fontSize: 13}}
                          fullWidth
                          size="small"
                          label="Queue name"
                          value={queue.name}
                          onChange={(e) =>
                            updateQueue(queueIndex, { name: e.target.value })
                          }
                          helperText='Examples: "default", "tesla", "gpu-long"'
                        />
                      </Box>

                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => addQueueParam(queueIndex)}
                          startIcon={<Plus size={16} />}
                          sx={{
                            textTransform: "none",
                            fontSize: 12,
                            color: colors.text,
                            borderColor: colors.border,
                            backgroundColor: "wheat",
                          }}
                        >
                          Add variable
                        </Button>

                        <Tooltip title="Delete queue">
                          <IconButton
                            size="small"
                            onClick={() => removeQueue(queueIndex)}
                            sx={{ color: colors.muted }}
                          >
                            <Trash2 size={16} />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </Stack>
                  </Box>

                  <Box sx={{ p: 1.25 }}>
                    {queue.params.length === 0 ? (
                      <Typography sx={{ fontSize: 12, color: colors.muted }}>
                        This queue has no variable definitions.
                      </Typography>
                    ) : (
                      <TableContainer
                        component={Paper}
                        variant="outlined"
                        sx={{
                          bgcolor: "transparent",
                          borderColor: colors.border,
                          borderRadius: 2,
                          overflow: "auto",
                        }}
                      >
                        <MuiTable size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell
                                sx={{
                                  minWidth: 180,
                                  bgcolor: colors.surface,
                                  color: colors.text,
                                  borderColor: colors.border,
                                  fontSize: 12,
                                  fontWeight: 900,
                                }}
                              >
                                Variable name
                              </TableCell>

                              <TableCell
                                sx={{
                                  minWidth: 140,
                                  bgcolor: colors.surface,
                                  color: colors.text,
                                  borderColor: colors.border,
                                  fontSize: 12,
                                  fontWeight: 900,
                                }}
                              >
                                Default value
                              </TableCell>

                              <TableCell
                                sx={{
                                  minWidth: 180,
                                  bgcolor: colors.surface,
                                  color: colors.text,
                                  borderColor: colors.border,
                                  fontSize: 12,
                                  fontWeight: 900,
                                }}
                              >
                                Label
                              </TableCell>

                              <TableCell
                                sx={{
                                  minWidth: 280,
                                  bgcolor: colors.surface,
                                  color: colors.text,
                                  borderColor: colors.border,
                                  fontSize: 12,
                                  fontWeight: 900,
                                }}
                              >
                                Help
                              </TableCell>

                              <TableCell
                                sx={{
                                  width: 60,
                                  bgcolor: colors.surface,
                                  color: colors.text,
                                  borderColor: colors.border,
                                  fontSize: 12,
                                  fontWeight: 900,
                                }}
                              />
                            </TableRow>
                          </TableHead>

                          <TableBody>
                            {queue.params.map((param, paramIndex) => (
                              <TableRow
                                key={`${param.variableName}-${paramIndex}`}
                                hover
                              >
                                <TableCell sx={{ borderColor: colors.border }}>
                                  <TextField
                                    sx={fieldSx}
                                    fullWidth
                                    size="small"
                                    value={param.variableName}
                                    onChange={(e) =>
                                      updateQueueParam(queueIndex, paramIndex, {
                                        variableName: e.target.value,
                                      })
                                    }
                                    placeholder="JOB_MEMORY"
                                  />
                                </TableCell>

                                <TableCell sx={{ borderColor: colors.border }}>
                                  <TextField
                                    sx={fieldSx}
                                    fullWidth
                                    size="small"
                                    value={param.value}
                                    onChange={(e) =>
                                      updateQueueParam(queueIndex, paramIndex, {
                                        value: e.target.value,
                                      })
                                    }
                                    placeholder="8192"
                                  />
                                </TableCell>

                                <TableCell sx={{ borderColor: colors.border }}>
                                  <TextField
                                    sx={fieldSx}
                                    fullWidth
                                    size="small"
                                    value={param.label}
                                    onChange={(e) =>
                                      updateQueueParam(queueIndex, paramIndex, {
                                        label: e.target.value,
                                      })
                                    }
                                    placeholder="Memory (MB)"
                                  />
                                </TableCell>

                                <TableCell sx={{ borderColor: colors.border }}>
                                  <TextField
                                    sx={fieldSx}
                                    fullWidth
                                    multiline
                                    minRows={1}
                                    maxRows={5}
                                    size="small"
                                    value={param.help}
                                    onChange={(e) =>
                                      updateQueueParam(queueIndex, paramIndex, {
                                        help: e.target.value,
                                      })
                                    }
                                    placeholder="Select amount of memory (in megabytes) for this job"
                                  />
                                </TableCell>

                                <TableCell sx={{ borderColor: colors.border }}>
                                  <Tooltip title="Delete variable">
                                    <IconButton
                                      size="small"
                                      onClick={() =>
                                        removeQueueParam(queueIndex, paramIndex)
                                      }
                                      sx={{ color: colors.muted }}
                                    >
                                      <Trash2 size={16} />
                                    </IconButton>
                                  </Tooltip>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </MuiTable>
                      </TableContainer>
                    )}
                  </Box>
                </Box>
              ))}
            </Stack>
          )}

          <Divider sx={{ my: 2, ...dividerSx }} />

          <Typography sx={{ fontSize: 12, color: colors.muted }}>
            Each queue variable is stored as: variable name, default value, label, and help.
          </Typography>
        </CardContent>
      </Card>
    </Stack>
  );
}