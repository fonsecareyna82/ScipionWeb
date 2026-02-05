// src/components/ParamRow.tsx
import { JSX, useState } from "react";
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Link,
} from "@mui/material";
import { CloseIcon, FindIcon, HelpIcon, TrashBinIcon } from "../../icons";
import { FolderOpen as FolderIcon } from "lucide-react";
import styles from "./paramrow.module.css";

type ParamRowLayoutVariant = "standard" | "inline" | "fullWidth";

type ParamRowProps = {
  label: string;
  control: JSX.Element;
  helpText?: string;
  isPointerParam?: boolean;
  onClear?: () => void;
  rowIndex?: number;

  // PointerParam
  onOpenFind?: () => void;

  // PathParam
  isPathParam?: boolean;
  onBrowsePath?: () => void;

  // Layout
  layoutVariant?: ParamRowLayoutVariant;
};

function normalizeHelpText(raw: string): string {
  // normalizeHelpText
  return String(raw ?? "").replace(/\\n/g, "\n");
}

function sanitizeUrlToken(token: string): { display: string; href: string } {
  // sanitizeUrlToken
  const display = token;

  // Trim common trailing punctuation from the URL target, but keep it in display
  let hrefToken = token;
  while (/[.,;:!?)]$/.test(hrefToken)) {
    hrefToken = hrefToken.slice(0, -1);
  }

  const href = hrefToken.startsWith("http") ? hrefToken : `https://${hrefToken}`;
  return { display, href };
}

function renderHelpText(helpText: string): JSX.Element {
  // renderHelpText
  const normalized = normalizeHelpText(helpText);

  // Matches:
  // - *boldText*
  // - http(s)://...
  // - www....
  const tokenRegex = /(\*[^*]+\*|https?:\/\/[^\s<>()]+|www\.[^\s<>()]+)/g;

  const renderLine = (line: string, lineIndex: number) => {
    // renderLine
    const parts: JSX.Element[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let keyIndex = 0;

    while ((match = tokenRegex.exec(line)) !== null) {
      const token = match[0];
      const start = match.index;

      if (start > lastIndex) {
        const text = line.slice(lastIndex, start);
        parts.push(<span key={`t-${lineIndex}-${keyIndex++}`}>{text}</span>);
      }

      // Bold: *text*
      if (token.startsWith("*") && token.endsWith("*") && token.length >= 2) {
        const boldText = token.slice(1, -1);
        parts.push(<strong key={`b-${lineIndex}-${keyIndex++}`}>{boldText}</strong>);
      } else {
        // Link
        const { display, href } = sanitizeUrlToken(token);
        parts.push(
          <Link
            key={`l-${lineIndex}-${keyIndex++}`}
            href={href}
            target="_blank"
            rel="noreferrer"
            underline="hover"
            sx={{ wordBreak: "break-word" }}
          >
            {display}
          </Link>
        );
      }

      lastIndex = tokenRegex.lastIndex;
    }

    if (lastIndex < line.length) {
      parts.push(<span key={`t-${lineIndex}-${keyIndex++}`}>{line.slice(lastIndex)}</span>);
    }

    // Reset regex state for the next line
    tokenRegex.lastIndex = 0;

    return parts;
  };

  const lines = normalized.split("\n");

  return (
    <Typography
      variant="body2"
      component="div"
      sx={{
        lineHeight: 1.6,
        mt: 2,
        whiteSpace: "normal",
        wordBreak: "break-word",
      }}
    >
      {lines.map((line, i) => (
        <span key={`hl-${i}`}>
          {renderLine(line, i)}
          {i < lines.length - 1 ? <br /> : null}
        </span>
      ))}
    </Typography>
  );
}

const ParamRow = ({
  label,
  control,
  helpText,
  isPointerParam,
  onClear,
  rowIndex = 0,
  onOpenFind,
  isPathParam,
  onBrowsePath,
  layoutVariant = "standard",
}: ParamRowProps) => {
  const [openHelp, setOpenHelp] = useState(false);
  const [openSelector, setOpenSelector] = useState(false); // fallback

  const isInline = layoutVariant === "inline";
  const isFullWidth = layoutVariant === "fullWidth";

  const actionIconButtonSx = {
    // actionIconButtonSx
    p: 0.5,
    width: 32,
    height: 32,
  };

  const actionsSlotSx = {
    // actionsSlotSx
    display: "inline-flex",
    alignItems: "center",
    gap: 0,
    flex: "0 0 auto",
    whiteSpace: "nowrap",
    ml: isInline ? 0.25 : 0.0,
  } as const;

  return (
    <>
      <Box
        sx={{
          ...(isInline
            ? {
                display: "inline-flex",
                alignItems: "center",
                gap: 0.75,
                px: 1,
                py: 0.5,
                borderRadius: 1,
                minHeight: 42,
              }
            : isFullWidth
              ? {
                  // fullWidthLayout
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  columnGap: 1,
                  alignItems: "center",
                  mb: 1,
                  mt: rowIndex === 0 ? 1.5 : 0, // firstRowTopMargin
                  position: "relative",
                }
              : {
                  // standardLayout
                  display: "grid",
                  gridTemplateColumns: "210px minmax(0, 1fr) auto",
                  columnGap: 1,
                  alignItems: "center",
                  mb: 1,
                  mt: rowIndex === 0 ? 1.5 : 0, // firstRowTopMargin
                  position: "relative",
                }),
        }}
      >
        <Typography
          variant="body2"
          className={styles.paramRowLabel}
          sx={{
            p: isInline ? 0 : 0.5,
            pr: isInline ? 0.75 : 2,
            fontSize: "0.75rem",
            fontWeight: 300,
            color: "black",
            whiteSpace: isFullWidth ? "normal" : "nowrap",
            overflow: isFullWidth ? "visible" : "hidden",
            textOverflow: isFullWidth ? "clip" : "ellipsis",
            ...(isInline ? { maxWidth: 180 } : null),
          }}
          title={label}
        >
          {label}
        </Typography>

        {!isFullWidth && (
          <Box
            sx={{
              minWidth: 0,
              width: "100%", // allowControlToStretch
              ...(isInline
                ? {
                    display: "flex",
                    alignItems: "center",
                    gap: 0.75,
                    width: "auto",
                  }
                : null),
            }}
          >
            {control}
          </Box>
        )}

        <Box sx={actionsSlotSx}>
          {isPointerParam && (
            <Tooltip title="Find">
              <IconButton
                size="small"
                sx={actionIconButtonSx}
                onClick={onOpenFind ? onOpenFind : () => setOpenSelector(true)}
              >
                <FindIcon className="ml-0" fontSize="1.2rem" />
              </IconButton>
            </Tooltip>
          )}

          {isPathParam && (
            <Tooltip title="Browse files">
              <IconButton size="small" sx={actionIconButtonSx} onClick={onBrowsePath}>
                <FolderIcon className="ml-0" size={18} />
              </IconButton>
            </Tooltip>
          )}

          {onClear && (
            <Tooltip title="Clear">
              <IconButton size="small" sx={actionIconButtonSx} onClick={onClear}>
                <TrashBinIcon className="ml-0" fontSize="1.2rem" />
              </IconButton>
            </Tooltip>
          )}

          {helpText && (
            <Tooltip title="Help">
              <IconButton size="small" sx={actionIconButtonSx} onClick={() => setOpenHelp(true)}>
                <HelpIcon className="ml-0" fontSize="1.2rem" />
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
          slotProps={{
            backdrop: {
              sx: { backgroundColor: "transparent" },
            },
          }}
        >
          <DialogTitle className={styles.formHeader}>Help</DialogTitle>
          <DialogContent sx={{ p: 2 }}>{renderHelpText(helpText)}</DialogContent>
          <DialogActions sx={{ justifyContent: "center" }}>
            <Button
              variant="outlined"
              onClick={() => setOpenHelp(false)}
              startIcon={<CloseIcon />}
              sx={{ textTransform: "none" }}
            >
              Close
            </Button>
          </DialogActions>
        </Dialog>
      )}

      <Dialog open={openSelector} onClose={() => setOpenSelector(false)} maxWidth="sm" fullWidth>
        <DialogTitle className={styles.formHeader}>Select output</DialogTitle>
        <DialogContent sx={{ p: 2 }}>
          <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
            No selector implemented here. Use onOpenFind/onBrowsePath from the parent.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ justifyContent: "center" }}>
          <Button variant="outlined" onClick={() => setOpenSelector(false)} startIcon={<CloseIcon />}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default ParamRow;
