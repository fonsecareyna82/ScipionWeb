import React, { useMemo, useRef } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  IconButton,
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
import { useTheme, type SxProps, type Theme } from "@mui/material/styles";
import { CircleAlert, FileCode, ListChecks, Network, Plus, SquareTerminal, Trash2 } from "lucide-react";

import { SETTINGS_TEXT, SettingRow, SettingsSection } from "./SettingsSection";
import { useSettingsStyles } from "./useSettingsStyles";
import HostAutoSetup from "./HostAutoSetup";

const MONO = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
const SCHEDULERS = ["SLURM", "PBS/TORQUE", "SGE", "LSF", "HTCondor"];

/** A command word in a sentence. */
function Code({ children }: { children: React.ReactNode }) {
  return <Box component="code" sx={{ fontFamily: MONO, fontSize: "0.95em" }}>{children}</Box>;
}

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
  cardSx?: SxProps<Theme>;
  cardHeaderSx?: SxProps<Theme>;
  dividerSx?: SxProps<Theme>;
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
  colors,
}: HostSettingsPanelProps) {
  const warnings = useMemo(() => getValidationWarnings(value), [value]);
  const isDarkMode = useTheme().palette.mode === "dark";
  const settings = useSettingsStyles(isDarkMode);
  const templateRef = useRef<HTMLTextAreaElement | null>(null);

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

  const sectionColors = { ...colors, card: settings.colors.card, primary: settings.colors.primary,
                          hover: settings.colors.hover };
  const note = { fontSize: SETTINGS_TEXT.text, color: colors.muted } as const;
  const codeFieldSx = {
    ...(fieldSx as object),
    "& .MuiInputBase-input": { fontFamily: MONO, fontSize: SETTINGS_TEXT.control, color: colors.text },
  };
  const wideField = { width: { xs: "100%", md: 480 } };

  const insertPlaceholder = (placeholder: string) => {
    // At the cursor of the template (or at its end)
    const area = templateRef.current;
    const text = value.submitTemplate;
    const start = area?.selectionStart ?? text.length;
    const end = area?.selectionEnd ?? text.length;
    updateValue({ submitTemplate: text.slice(0, start) + placeholder + text.slice(end) });
    window.requestAnimationFrame(() => {
      if (!area) return;
      area.focus();
      area.setSelectionRange(start + placeholder.length, start + placeholder.length);
    });
  };

  const command = (key: "parallelCommand" | "submitCommand" | "cancelCommand" | "checkCommand" | "jobDoneRegex",
                   title: string, description: React.ReactNode, placeholder: string) => (
    <SettingRow
      key={key}
      title={title}
      labelFor={`host-${key}`}
      description={description}
      colors={sectionColors}
      control={
        <TextField id={`host-${key}`} size="small" sx={{ ...codeFieldSx, ...wideField }} value={value[key]}
                   placeholder={placeholder} onChange={(e) => updateValue({ [key]: e.target.value })} />
      }
    />
  );

  const headCellSx = { fontSize: SETTINGS_TEXT.text, fontWeight: 700, color: colors.muted, borderColor: colors.border,
                       bgcolor: "transparent", whiteSpace: "nowrap" } as const;

  return (
    <Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}

      {warnings.length > 0 && (
        <Alert severity="warning" icon={<CircleAlert size={18} />} sx={{ alignItems: "flex-start" }}>
          <Typography sx={{ fontSize: SETTINGS_TEXT.control, fontWeight: 700, mb: 0.5 }}>Check before saving</Typography>
          <Stack component="ul" spacing={0.25} sx={{ m: 0, pl: 2.5 }}>
            {warnings.map((warning) => (
              <Typography component="li" key={warning} sx={{ fontSize: SETTINGS_TEXT.text }}>{warning}</Typography>
            ))}
          </Stack>
        </Alert>
      )}

      <SettingsSection icon={<Network size={19} />} title="Cluster"
                       subtitle="How this server sends protocols to a cluster's scheduler. Detect fills the form from what this server has."
                       colors={sectionColors} isDarkMode={isDarkMode}
                       actions={<HostAutoSetup value={value} onChange={onChange} colors={colors}
                                               actionButtonSx={settings.actionButtonSx}
                                               saveButtonSx={settings.saveButtonSx} />}>
        <SettingRow
          title="Host name"
          labelFor="host-alias"
          description='How protocols name this host, e.g. "localhost" or "cluster".'
          colors={sectionColors}
          control={<TextField id="host-alias" size="small" sx={{ ...(fieldSx as object), ...wideField }}
                              value={value.hostAlias} onChange={(e) => updateValue({ hostAlias: e.target.value })} />}
        />
        <SettingRow
          title="Scheduler"
          labelFor="host-scheduler"
          description="The name of the cluster's scheduler, as shown to the users."
          colors={sectionColors}
          control={
            <Autocomplete
              freeSolo
              options={SCHEDULERS}
              value={value.schedulerName}
              onInputChange={(_, next) => updateValue({ schedulerName: next })}
              sx={wideField}
              renderInput={(params) => <TextField {...params} id="host-scheduler" size="small" sx={fieldSx} />}
            />
          }
        />
        <SettingRow
          title="Queue required"
          labelFor="host-mandatory"
          description="Every protocol must go through a queue: running directly on this server is not offered."
          colors={sectionColors}
          control={<Switch id="host-mandatory" checked={Boolean(value.mandatory)}
                           onChange={(e) => updateValue({ mandatory: e.target.checked })} />}
        />
      </SettingsSection>

      <SettingsSection icon={<SquareTerminal size={19} />} title="Commands"
                       subtitle="How jobs are started, sent, stopped and followed. Words like %_(JOB_ID)s are filled in for each job."
                       colors={sectionColors} isDarkMode={isDarkMode}>
        {command("parallelCommand", "Parallel command",
          <>Runs a program on several processors. Uses <Code>%_(JOB_NODES)d</Code> and <Code>%_(COMMAND)s</Code>.</>,
          "mpirun -np %_(JOB_NODES)d %_(COMMAND)s")}
        {command("submitCommand", "Send a job",
          <>Sends the job's script to the queue. Uses <Code>%_(JOB_SCRIPT)s</Code>.</>, "sbatch %_(JOB_SCRIPT)s")}
        {command("cancelCommand", "Cancel a job", <>Stops a job. Uses <Code>%_(JOB_ID)s</Code>.</>,
          "scancel %_(JOB_ID)s")}
        {command("checkCommand", "Check a job", <>Asks how a job is doing. Uses <Code>%_(JOB_ID)s</Code>.</>,
          "squeue -h -j %_(JOB_ID)s")}
        {command("jobDoneRegex", "Job finished when",
          "Optional. A pattern that, found in the check command's answer, means the job has ended.", "")}
      </SettingsSection>

      <SettingsSection icon={<FileCode size={19} />} title="Job script"
                       subtitle="The script sent to the scheduler for every job. Click a word below to put it where the cursor is."
                       colors={sectionColors} isDarkMode={isDarkMode} plain>
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
            {availablePlaceholders.map((placeholder) => (
              <Button key={placeholder} size="small" onClick={() => insertPlaceholder(placeholder)}
                      aria-label={`Insert ${placeholder}`}
                      sx={{ ...settings.actionButtonSx, minHeight: 30, px: 1.25, fontFamily: MONO, fontSize: 13,
                            fontWeight: 500 }}>
                {placeholder}
              </Button>
            ))}
          </Stack>
          <TextField
            fullWidth
            multiline
            minRows={18}
            size="small"
            value={value.submitTemplate}
            inputRef={templateRef}
            onChange={(e) => updateValue({ submitTemplate: e.target.value })}
            inputProps={{ "aria-label": "Job script", spellCheck: false }}
            sx={{ ...codeFieldSx, "& .MuiInputBase-input": { fontFamily: MONO, fontSize: 13.5, lineHeight: 1.6,
                                                              color: colors.text } }}
          />
        </Stack>
      </SettingsSection>

      <SettingsSection
        icon={<ListChecks size={19} />}
        title="Queues"
        subtitle="The queues users can choose, each with the values they may set (memory, time…)."
        colors={sectionColors}
        isDarkMode={isDarkMode}
        plain
        actions={
          <Button size="small" sx={settings.actionButtonSx} startIcon={<Plus size={15} />} onClick={addQueue}>
            Add queue
          </Button>
        }
      >
        {value.queues.length === 0 ? (
          <Typography sx={note}>No queues: protocols can only run directly on this server.</Typography>
        ) : (
          <Stack spacing={1.5}>
            {value.queues.map((queue, queueIndex) => (
              <Box key={queueIndex} data-testid={`queue-${queueIndex}`}
                   sx={{ border: "1px solid", borderColor: colors.border, borderRadius: 2, p: 2 }}>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25} alignItems={{ sm: "center" }}>
                  <TextField size="small" label="Queue name" value={queue.name} sx={{ ...(fieldSx as object), flex: 1 }}
                             onChange={(e) => updateQueue(queueIndex, { name: e.target.value })} />
                  <Stack direction="row" spacing={1}>
                    <Button size="small" sx={settings.actionButtonSx} startIcon={<Plus size={15} />}
                            onClick={() => addQueueParam(queueIndex)}>
                      Add value
                    </Button>
                    <Button size="small" sx={{ ...settings.actionButtonSx, color: "#dc2626" }}
                            startIcon={<Trash2 size={15} />} onClick={() => removeQueue(queueIndex)}
                            aria-label={`Delete the queue ${queue.name}`}>
                      Delete
                    </Button>
                  </Stack>
                </Stack>

                {queue.params.length === 0 ? (
                  <Typography sx={{ ...note, mt: 1.5 }}>Users set nothing for this queue.</Typography>
                ) : (
                  <TableContainer sx={{ mt: 1.5, overflowX: "auto" }}>
                    <MuiTable size="small" aria-label={`Values of the queue ${queue.name}`}>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ ...headCellSx, minWidth: 170 }}>Variable</TableCell>
                          <TableCell sx={{ ...headCellSx, minWidth: 120 }}>Default</TableCell>
                          <TableCell sx={{ ...headCellSx, minWidth: 170 }}>Label shown</TableCell>
                          <TableCell sx={{ ...headCellSx, minWidth: 260 }}>Help shown</TableCell>
                          <TableCell sx={{ ...headCellSx, width: 48 }} />
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {queue.params.map((param, paramIndex) => (
                          <TableRow key={paramIndex}>
                            <TableCell sx={{ borderColor: colors.border, pl: 0 }}>
                              <TextField size="small" fullWidth sx={codeFieldSx} value={param.variableName}
                                         placeholder="JOB_MEMORY" inputProps={{ "aria-label": "Variable" }}
                                         onChange={(e) => updateQueueParam(queueIndex, paramIndex,
                                                                           { variableName: e.target.value })} />
                            </TableCell>
                            <TableCell sx={{ borderColor: colors.border }}>
                              <TextField size="small" fullWidth sx={fieldSx} value={param.value} placeholder="8192"
                                         inputProps={{ "aria-label": "Default" }}
                                         onChange={(e) => updateQueueParam(queueIndex, paramIndex,
                                                                           { value: e.target.value })} />
                            </TableCell>
                            <TableCell sx={{ borderColor: colors.border }}>
                              <TextField size="small" fullWidth sx={fieldSx} value={param.label}
                                         placeholder="Memory (MB)" inputProps={{ "aria-label": "Label shown" }}
                                         onChange={(e) => updateQueueParam(queueIndex, paramIndex,
                                                                           { label: e.target.value })} />
                            </TableCell>
                            <TableCell sx={{ borderColor: colors.border }}>
                              <TextField size="small" fullWidth multiline minRows={1} maxRows={5} sx={fieldSx}
                                         value={param.help} placeholder="Memory for this job, in megabytes"
                                         inputProps={{ "aria-label": "Help shown" }}
                                         onChange={(e) => updateQueueParam(queueIndex, paramIndex,
                                                                           { help: e.target.value })} />
                            </TableCell>
                            <TableCell sx={{ borderColor: colors.border, pr: 0 }}>
                              <Tooltip title="Delete this value">
                                <IconButton size="small" onClick={() => removeQueueParam(queueIndex, paramIndex)}
                                            sx={{ color: colors.muted }} aria-label="Delete this value">
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
            ))}
          </Stack>
        )}
      </SettingsSection>
    </Stack>
  );
}
