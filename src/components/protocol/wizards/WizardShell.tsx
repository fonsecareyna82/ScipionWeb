// The frame of every wizard dialog: the web's dialog frame with the wand.
import type { ReactNode } from "react";
import { Wand2 } from "lucide-react";

import DialogFrame, { DialogButton, DIALOG_TEXT } from "@/components/ui/DialogFrame";

export const WIZARD_TEXT = DIALOG_TEXT;

export function WizardButton({ primary = false, children, onClick, disabled }: {
  primary?: boolean; children: ReactNode; onClick?: () => void; disabled?: boolean;
}) {
  return <DialogButton kind={primary ? "primary" : "secondary"} onClick={onClick} disabled={disabled}>{children}</DialogButton>;
}

export default function WizardShell({
  title, subtitle, children, actions, onClose, busy = false, closable = true, maxWidth = "sm", height, contentSx,
  inFrontOfResults = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
  onClose?: () => void;
  /** A bar under the header while the wizard works on the server. */
  busy?: boolean;
  closable?: boolean;
  maxWidth?: "xs" | "sm" | "md" | "lg" | "xl";
  height?: string;
  contentSx?: Record<string, unknown>;
  /** Results it opens go in floating windows in front of it (see FloatingWindow.css). */
  inFrontOfResults?: boolean;
}) {
  return (
    <DialogFrame icon={<Wand2 size={20} color="white" />} title={title} subtitle={subtitle} actions={actions}
      onClose={onClose} busy={busy} closable={closable} maxWidth={maxWidth} height={height} contentSx={contentSx}
      className={inFrontOfResults ? "sfw-launcher-dialog" : undefined}>
      {children}
    </DialogFrame>
  );
}
