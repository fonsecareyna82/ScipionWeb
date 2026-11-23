// Settings → Host: fill the form from what this server has (its scheduler and queues), and send a test job with the
// form as it is, to see it works before a protocol needs it.
import { useEffect, useRef, useState } from "react";
import { Box, Button, Checkbox, MenuItem, Select, Stack, Typography } from "@mui/material";
import { FlaskConical, Radar } from "lucide-react";
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

export default function HostAutoSetup({ value, onChange, actionButtonSx, saveButtonSx, colors }: Props) {
  const note = { fontSize: 13.5, color: colors.muted } as const;

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
          onConfirm={useProposal}
          onClose={() => setDetection(null)}
        >
          {detection.settings ? (
            <Stack spacing={1.5}>
              <Typography sx={note}>
                The queues to offer to the users. Nothing changes until you save the form.
              </Typography>
              {detection.queues.map((queue) => (
                <Stack key={queue.name} direction="row" spacing={1} alignItems="flex-start"
                       component="label" sx={{ cursor: "pointer" }}>
                  <Checkbox size="small" checked={chosen.has(queue.name)} sx={{ p: 0.5 }}
                            inputProps={{ "aria-label": `Offer the queue ${queue.name}` }}
                            onChange={(e) => setChosen((previous) => {
                              const next = new Set(previous);
                              if (e.target.checked) next.add(queue.name); else next.delete(queue.name);
                              return next;
                            })} />
                  <Box>
                    <Typography sx={{ fontSize: 15, fontWeight: 700, color: colors.text }}>
                      {queue.name}{queue.default ? " (the scheduler's default)" : ""}
                    </Typography>
                    <Typography sx={note}>{describeQueue(queue)}</Typography>
                  </Box>
                </Stack>
              ))}
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
          onConfirm={() => void sendTest()}
          onClose={() => void closeTest()}
        >
          <Stack spacing={1.75}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Typography component="label" htmlFor="host-test-queue" sx={{ fontSize: 15, fontWeight: 700 }}>
                Queue
              </Typography>
              <Select id="host-test-queue" size="small" value={testQueue} sx={{ minWidth: 220 }}
                      inputProps={{ "aria-label": "Queue" }}
                      disabled={waiting}
                      onChange={(e) => setTestQueue(String(e.target.value))}>
                {value.queues.map((queue) => (
                  <MenuItem key={queue.name} value={queue.name}>{queue.name}</MenuItem>
                ))}
              </Select>
            </Stack>

            {test && (
              <Box role="status" data-testid="host-test-result">
                <Typography sx={{ fontSize: 15, fontWeight: 700, color: stateColor }}>
                  {testStateText[test.state]}
                </Typography>
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
            )}
          </Stack>
        </SettingsDialog>
      )}
    </>
  );
}
