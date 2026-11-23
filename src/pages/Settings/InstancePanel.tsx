// Settings → Instance: how protocols run, for every user.
import { MenuItem, Select, Stack, Typography } from "@mui/material";
import { Play } from "lucide-react";

import { SETTINGS_TEXT, settingLabelId, SettingRow, SettingsSection, type SectionColors } from "./SettingsSection";

export type InstanceSettingsValue = { defaultQueueName: string; maxConcurrentRunsPerUser: number };

type Props = {
  value: InstanceSettingsValue;
  onChange: (update: (prev: InstanceSettingsValue) => InstanceSettingsValue) => void;
  /** The queues of the Host tab; null while unknown. */
  queueNames: string[] | null;
  colors: SectionColors & { hover: string };
  isDarkMode: boolean;
  fieldSx: object;
  menuPaperSx: object;
};

const RUN_LIMITS = [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 48, 64];

export default function InstancePanel({
  value, onChange, queueNames, colors, isDarkMode, fieldSx, menuPaperSx,
}: Props) {
  const selectSx = { ...fieldSx, minWidth: 240, "& .MuiSelect-select": { fontSize: SETTINGS_TEXT.control,
                                                                       color: colors.text } };
  const menuProps = { PaperProps: { sx: { ...menuPaperSx, maxHeight: 360 } } };

  const limits = RUN_LIMITS.includes(value.maxConcurrentRunsPerUser)
    ? RUN_LIMITS
    : [...RUN_LIMITS, value.maxConcurrentRunsPerUser].sort((a, b) => a - b);

  // The configured queue, or a name no queue has any more (then the first queue is used)
  const queues = queueNames ?? [];
  const unknownQueue = Boolean(value.defaultQueueName) && queueNames !== null && !queues.includes(value.defaultQueueName);

  const queueControl = queueNames !== null && queues.length === 0 ? (
    <Typography sx={{ fontSize: SETTINGS_TEXT.text, color: colors.muted, maxWidth: 320 }}>
      No queues yet. Add them in the Host tab.
    </Typography>
  ) : (
    <Select
      id="instance-default-queue"
      labelId={settingLabelId("instance-default-queue")}
      size="small"
      displayEmpty
      value={value.defaultQueueName}
      onChange={(e) => onChange((prev) => ({ ...prev, defaultQueueName: String(e.target.value) }))}
      renderValue={(name) => (name ? String(name) : queues.length ? `The first one (${queues[0]})` : "The first one")}
      MenuProps={menuProps}
      sx={selectSx}
    >
      <MenuItem value="" sx={{ fontSize: SETTINGS_TEXT.control }}>
        The first one{queues.length ? ` (${queues[0]})` : ""}
      </MenuItem>
      {queues.map((name) => (
        <MenuItem key={name} value={name} sx={{ fontSize: SETTINGS_TEXT.control }}>{name}</MenuItem>
      ))}
      {unknownQueue && (
        <MenuItem value={value.defaultQueueName} sx={{ fontSize: SETTINGS_TEXT.control }}>
          {value.defaultQueueName} (no longer exists)
        </MenuItem>
      )}
    </Select>
  );

  return (
    <Stack spacing={2}>
      <SettingsSection icon={<Play size={19} />} title="Running protocols"
                       subtitle="How protocols are run, for every user of this server." colors={colors}
                       isDarkMode={isDarkMode}>
        <SettingRow
          title="Default queue"
          labelFor="instance-default-queue"
          description="The queue used when a protocol is sent to the cluster and nobody chose one."
          control={queueControl}
          colors={colors}
        />
        <SettingRow
          title="Runs per user at the same time"
          labelFor="instance-run-limit"
          description={"Protocols launched together (Run all, Continue all) count as one. Streaming protocols "
            + "still receiving data never count."}
          control={
            <Select
              id="instance-run-limit"
              labelId={settingLabelId("instance-run-limit")}
              size="small"
              value={value.maxConcurrentRunsPerUser}
              onChange={(e) => onChange((prev) => ({ ...prev, maxConcurrentRunsPerUser: Number(e.target.value) }))}
              renderValue={(limit) => (Number(limit) === 0 ? "No limit" : `${limit} at a time`)}
              MenuProps={menuProps}
              sx={selectSx}
            >
              {limits.map((limit) => (
                <MenuItem key={limit} value={limit} sx={{ fontSize: SETTINGS_TEXT.control }}>
                  {limit === 0 ? "No limit" : limit}
                </MenuItem>
              ))}
            </Select>
          }
          colors={colors}
        />
      </SettingsSection>

    </Stack>
  );
}
