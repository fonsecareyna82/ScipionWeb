// Settings → Host: fill the form from what this server has (its scheduler and queues), and send a test job with the
// form as it is, to see it works before a protocol needs it.
import { useEffect, useRef, useState } from "react";
import {
  Box, Button, Checkbox, MenuItem, Select, Stack, ToggleButton, ToggleButtonGroup, Typography,
} from "@mui/material";
import { Check, CircleCheck, CircleX, FlaskConical, Radar, Server } from "lucide-react";

import { useIsDark } from "@/context/ThemeContext";
import { choiceButtonsSx, sectionTint } from "./SettingsSection";
import toast from "react-hot-toast";

import {
  cancelHostTest, detectHostSettings, getHostTest, startHostTest, type HostDetection, type HostTest,
} from "@/api/settings";
import type { HostSettings } from "./HostSettingsPanel";
import SettingsDialog from "./SettingsDialog";

const MONO = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
const ENDED = new Set(["finished", "failed", "cancelled"]);

type Props = {
  value: HostSettings;
  onChange: (next: HostSettings) => void;
  actionButtonSx: object;
  saveButtonSx: object;
  colors: { text: string; muted: string; border: string };
};

function describeQueue(queue: HostDetection["queues"][number]): string {
  if (queue.unknown) {
    return [
      "Its machines are off: what they have is not known, check memory and GPUs by hand",
      queue.hours ? `up to ${queue.hours} h` : "no time limit",
    ].join(" · ");
  }
  return [
    `${queue.cpus} cores`,
    queue.memoryMb ? `${Math.round(queue.memoryMb / 1024)} GB` : "",
    queue.gpus ? `${queue.gpus} GPU${queue.gpus === 1 ? "" : "s"}` : "no GPUs",
    queue.hours ? `up to ${queue.hours} h` : "no time limit",
    `${queue.nodes} machine${queue.nodes === 1 ? "" : "s"}`,
    queue.up ? "" : "down now",
    queue.asleep ? "machines start when a job comes" : "",
  ].filter(Boolean).join(" · ");
}

// The steps a test job goes through, in order
const TEST_STEPS: { states: HostTest["state"][]; label: string }[] = [
  { states: ["starting"], label: "Prepared" },
  { states: ["submitting"], label: "Sent" },
  { states: ["queued"], label: "Queued" },
  { states: ["running"], label: "Running" },
  { states: ["finished", "failed", "cancelled"], label: "Ended" },
];

function Pill({ color, children }: { color: string; children: string }) {
  return (
    <Box component="span" sx={{ px: 1, borderRadius: 10, lineHeight: 1.7, fontSize: 13, fontWeight: 700, whiteSpace: "nowrap",
                                color, bgcolor: `${color}1f` }}>
      {children}
    </Box>
  );
}

export default function HostAutoSetup({ value, onChange, actionButtonSx, saveButtonSx, colors }: Props) {
  const note = { fontSize: 13.5, color: colors.muted } as const;
  const isDark = useIsDark();
  const tint = sectionTint(isDark);
  const primary = isDark ? "#60a5fa" : "#2563eb";

  // Detecting --------------------------------------------------------------------------------------------------
  const [detecting, setDetecting] = useState(false);
  const [detection, setDetection] = useState<HostDetection | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  const detect = async () => {
    setDetecting(true);
    try {
      const found = await detectHostSettings();
      setDetection(found);
      setChosen(new Set(found.queues.filter((queue) => queue.up).map((queue) => queue.name)));
    } catch (e: any) {
      toast.error(String(e?.message || "Failed to look for a scheduler"));
    } finally {
      setDetecting(false);
    }
  };

  const useProposal = () => {
    const proposal = detection?.settings;
    if (!proposal) return;
    onChange({
      ...value,
      ...proposal,
      // Keep the name protocols already use for this host
      hostAlias: value.hostAlias || proposal.hostAlias,
      queues: (proposal.queues ?? []).filter((queue: { name: string }) => chosen.has(queue.name)),
    });
    setDetection(null);
    toast.success("The form is filled in. Check it and save.");
  };

  // Testing ----------------------------------------------------------------------------------------------------
  const [testOpen, setTestOpen] = useState(false);
  const [testQueue, setTestQueue] = useState("");
  const [test, setTest] = useState<HostTest | null>(null);
  const [sending, setSending] = useState(false);
  const poll = useRef<number | null>(null);

  const stopPolling = () => {
    if (poll.current != null) window.clearInterval(poll.current);
    poll.current = null;
  };
  useEffect(() => stopPolling, []);

  const openTest = () => {
    setTest(null);
    setTestQueue(value.queues[0]?.name ?? "");
    setTestOpen(true);
  };

  const sendTest = async () => {
    setSending(true);
    try {
      const started = await startHostTest(value, testQueue);
      setTest(started);
      stopPolling();
      poll.current = window.setInterval(async () => {
        try {
          const next = await getHostTest(started.id);
          setTest(next);
          if (ENDED.has(next.state)) stopPolling();
        } catch {
          stopPolling();
        }
      }, 2000);
    } catch (e: any) {
      toast.error(String(e?.message || "Failed to send the test job"));
    } finally {
      setSending(false);
    }
  };

  const closeTest = async () => {
    stopPolling();
    if (test && !ENDED.has(test.state)) {
      try {
        await cancelHostTest(test.id);
      } catch {
        // The job ends by itself
      }
    }
    setTestOpen(false);
  };

  const testStateText: Record<HostTest["state"], string> = {
    starting: "Preparing the job…",
    submitting: "Sending it to the queue…",
    queued: "Waiting in the queue…",
    running: "Running…",
    finished: "It works.",
    failed: "It did not work.",
    cancelled: "Cancelled.",
  };
  const waiting = Boolean(test && !ENDED.has(test.state));
  const stateColor = test?.state === "finished" ? "#16a34a" : test?.state === "failed" ? "#dc2626" : colors.text;

  return (
    <>
      <Stack direction="row" spacing={1}>
        <Button size="small" sx={actionButtonSx} startIcon={<Radar size={15} />} disabled={detecting}
                onClick={() => void detect()}>
          {detecting ? "Looking…" : "Detect"}
        </Button>
        <Button size="small" sx={actionButtonSx} startIcon={<FlaskConical size={15} />}
                disabled={value.queues.length === 0} onClick={openTest}
                title={value.queues.length === 0 ? "Add a queue first" : undefined}>
          Send a test job
        </Button>
      </Stack>

      {detection && (
        <SettingsDialog
          title={detection.scheduler ? `${detection.scheduler} on this server` : "No scheduler on this server"}
          description={detection.message}
          icon={<Radar size={20} color="#93c5fd" />}
          confirmLabel="Use this"
          confirmDisabled={!detection.settings || chosen.size === 0}
          footerNote={detection.settings ? `${chosen.size} of ${detection.queues.length} queues` : undefined}
          maxWidth="sm"
          actionButtonSx={actionButtonSx}
          saveButtonSx={saveButtonSx}
          closeButton
          onConfirm={useProposal}
          onClose={() => setDetection(null)}
        >
          {detection.settings ? (
            <Stack spacing={1.5}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                <Typography sx={note}>
                  The queues to offer to the users. Nothing changes until you save the form.
                </Typography>
                <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                  <Button size="small" sx={{ textTransform: "none", fontSize: 13.5 }}
                          onClick={() => setChosen(new Set(detection.queues.map((queue) => queue.name)))}>
                    All
                  </Button>
                  <Button size="small" sx={{ textTransform: "none", fontSize: 13.5 }} onClick={() => setChosen(new Set())}>
                    None
                  </Button>
                </Stack>
              </Stack>
              {detection.queues.map((queue) => {
                const on = chosen.has(queue.name);
                return (
                  <Stack key={queue.name} direction="row" spacing={1} alignItems="flex-start" component="label"
                         sx={{ cursor: "pointer", border: "1px solid", borderColor: on ? primary : colors.border,
                               bgcolor: on ? tint : "transparent", borderRadius: 2, px: 1, py: 1,
                               transition: "background-color 120ms, border-color 120ms" }}>
                    <Checkbox size="small" checked={on} sx={{ p: 0.5 }}
                              inputProps={{ "aria-label": `Offer the queue ${queue.name}` }}
                              onChange={(e) => setChosen((previous) => {
                                const next = new Set(previous);
                                if (e.target.checked) next.add(queue.name); else next.delete(queue.name);
                                return next;
                              })} />
                    <Box sx={{ minWidth: 0, flex: 1, pt: 0.25 }}>
                      <Stack direction="row" spacing={0.75} alignItems="center" useFlexGap flexWrap="wrap">
                        <Server size={15} style={{ color: colors.muted }} />
                        <Typography sx={{ fontSize: 15, fontWeight: 700, color: colors.text, fontFamily: MONO }}>{queue.name}</Typography>
                        {queue.default && <Pill color="#2563eb">the scheduler's default</Pill>}
                        {!queue.up && <Pill color="#dc2626">down now</Pill>}
                        {queue.asleep && <Pill color="#7c3aed">starts on demand</Pill>}
                        {queue.unknown && <Pill color="#b45309">check by hand</Pill>}
                      </Stack>
                      <Typography sx={{ ...note, mt: 0.25 }}>{describeQueue(queue)}</Typography>
                    </Box>
                  </Stack>
                );
              })}
              <Typography sx={note}>
                Each queue gets memory, time{detection.queues.some((queue) => queue.gpus) ? ", GPUs" : ""} and "use
                queue for jobs" within its limits. Things only your cluster knows (an account, a QoS, modules to load)
                go in the job script by hand.
              </Typography>
            </Stack>
          ) : null}
        </SettingsDialog>
      )}

      {testOpen && (
        <SettingsDialog
          title="Send a test job"
          description={"A tiny job, sent with the form as it is now (saved or not), that only says where it ran. " +
                       "On a cluster that starts its machines when a job comes, the first one can wait several " +
                       "minutes."}
          icon={<FlaskConical size={20} color="#93c5fd" />}
          // Closing stays possible while the job waits in the queue (it is cancelled then)
          confirmLabel={waiting ? "Waiting…" : test ? "Send again" : "Send"}
          busy={sending}
          busyLabel="Sending…"
          confirmDisabled={!testQueue || waiting}
          maxWidth="sm"
          actionButtonSx={actionButtonSx}
          saveButtonSx={saveButtonSx}
          closeButton
          onConfirm={() => void sendTest()}
          onClose={() => void closeTest()}
        >
          <Stack spacing={2}>
            <Box>
              <Typography sx={{ fontSize: 15, fontWeight: 700, color: colors.text, mb: 0.75 }}>Queue</Typography>
              {value.queues.length <= 6 ? (
                <ToggleButtonGroup exclusive size="small" value={testQueue} aria-label="Queue" disabled={waiting}
                                   onChange={(_, next) => next && setTestQueue(String(next))}
                                   sx={choiceButtonsSx({ ...colors, card: "", primary, hover: tint }, isDark)}>
                  {value.queues.map((queue) => (
                    <ToggleButton key={queue.name} value={queue.name} sx={{ fontFamily: MONO }}>{queue.name}</ToggleButton>
                  ))}
                </ToggleButtonGroup>
              ) : (
                <Select id="host-test-queue" size="small" value={testQueue} sx={{ minWidth: 220 }}
                        inputProps={{ "aria-label": "Queue" }} disabled={waiting}
                        onChange={(e) => setTestQueue(String(e.target.value))}>
                  {value.queues.map((queue) => (
                    <MenuItem key={queue.name} value={queue.name}>{queue.name}</MenuItem>
                  ))}
                </Select>
              )}
            </Box>

            {test && (() => {
              const current = TEST_STEPS.findIndex((step) => step.states.includes(test.state));
              const ended = ENDED.has(test.state);
              const endColor = test.state === "finished" ? "#16a34a" : test.state === "failed" ? "#dc2626" : colors.muted;
              return (
                <Stack spacing={1.5}>
                  <Stack direction="row" alignItems="center" aria-label="How the test job goes">
                    {TEST_STEPS.map((step, index) => {
                      const done = index < current || (ended && index === current);
                      const now = index === current && !ended;
                      const color = done ? (index === TEST_STEPS.length - 1 ? endColor : "#16a34a") : now ? primary : colors.border;
                      return (
                        <Stack key={step.label} direction="row" alignItems="center" sx={{ flex: index < TEST_STEPS.length - 1 ? 1 : "none" }}>
                          <Stack alignItems="center" spacing={0.4} sx={{ minWidth: 58 }}>
                            <Box sx={{ width: 24, height: 24, borderRadius: "50%", display: "grid", placeItems: "center",
                                       border: `2px solid ${color}`, bgcolor: done ? color : "transparent", color: "white" }}>
                              {done && <Check size={14} />}
                              {now && <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: primary,
                                                  animation: "pulse 1.2s ease-in-out infinite",
                                                  "@keyframes pulse": { "50%": { opacity: 0.3 } } }} />}
                            </Box>
                            <Typography sx={{ fontSize: 13, color: now || done ? colors.text : colors.muted, fontWeight: now ? 700 : 400 }}>
                              {step.label}
                            </Typography>
                          </Stack>
                          {index < TEST_STEPS.length - 1 && (
                            <Box sx={{ flex: 1, height: 2, bgcolor: index < current ? "#16a34a" : colors.border, mb: 2.25 }} />
                          )}
                        </Stack>
                      );
                    })}
                  </Stack>
                  <Box role="status" data-testid="host-test-result"
                       sx={{ borderRadius: 2, border: "1px solid", borderColor: ended ? `${endColor}66` : colors.border,
                             bgcolor: ended ? `${endColor}10` : "transparent", px: 1.5, py: 1.25 }}>
                    <Stack direction="row" spacing={0.75} alignItems="center">
                      {test.state === "finished" && <CircleCheck size={18} color="#16a34a" />}
                      {test.state === "failed" && <CircleX size={18} color="#dc2626" />}
                      <Typography sx={{ fontSize: 15, fontWeight: 700, color: stateColor }}>
                        {testStateText[test.state]}
                      </Typography>
                    </Stack>
                    <Typography sx={note}>
                      {[test.jobId ? `Job ${test.jobId}` : "", test.message].filter(Boolean).join(" · ")}
                    </Typography>
                    {test.output && (
                      <Box component="pre" sx={{ mt: 1, p: 1.25, borderRadius: 2, border: "1px solid",
                                                  borderColor: colors.border, fontFamily: MONO, fontSize: 13,
                                                  whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 220,
                                                  overflow: "auto", m: 0 }}>
                        {test.output}
                      </Box>
                    )}
                  </Box>
                </Stack>
              );
            })()}
          </Stack>
        </SettingsDialog>
      )}
    </>
  );
}
