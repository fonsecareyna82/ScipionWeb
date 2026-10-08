import { LogChannel } from "@/hooks/useProtocolLogs";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { Box, Button, Tab, Tabs, Typography, TextField, InputAdornment, IconButton } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import type { RefObject } from "react";
import { JSX, useEffect, useRef, useState } from "react";

type ProtocolLogsPanelProps = {
  sortedLogChannels: LogChannel[];
  activeLogChannelId: string;
  setActiveLogChannelId: (id: string) => void;
  activeLogText: string;
  logsError: string | null;
  logsContainerRef: RefObject<HTMLDivElement | null>;
  updateStickToBottom: () => void;
  onSearchAll?: (channel: string, query: string) => Promise<{
    matches: Array<{ offset: number; text: string }>;
    complete: boolean;
  }>;
  onNavigateToOffset?: (offset: number) => Promise<void>;
  onClearLogSearch?: () => Promise<void>;
  onLoadFullLog?: (channel: string) => Promise<Blob>;
};

function useAncestorDarkMode<T extends HTMLElement>() {
  const rootRef = useRef<T | null>(null);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const updateDarkMode = () => {
      setIsDark(Boolean(rootRef.current?.closest(".dark")));
    };

    updateDarkMode();

    const observer = new MutationObserver(updateDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  return { rootRef, isDark };
}

function parseAnsi(line: string): JSX.Element[] {
  const regex = /\x1b\[(\d+)m/g;
  const parts: JSX.Element[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let currentColor: string | null = null;
  let key = 0;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <span key={key++} style={{ color: currentColor ?? "inherit" }}>
          {line.slice(lastIndex, match.index)}
        </span>
      );
    }

    const code = Number.parseInt(match[1], 10);
    switch (code) {
      case 31:
        currentColor = "#f87171";
        break;
      case 32:
        currentColor = "#4ade80";
        break;
      case 33:
        currentColor = "#fbbf24";
        break;
      case 35:
        currentColor = "#e879f9";
        break;
      case 0:
        currentColor = null;
        break;
      default:
        currentColor = null;
        break;
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < line.length) {
    parts.push(
      <span key={key++} style={{ color: currentColor ?? "inherit" }}>
        {line.slice(lastIndex)}
      </span>
    );
  }

  return parts;
}

export default function ProtocolLogsPanel({
  sortedLogChannels,
  activeLogChannelId,
  setActiveLogChannelId,
  activeLogText,
  logsError,
  logsContainerRef,
  updateStickToBottom,
  onSearchAll,
  onNavigateToOffset,
  onClearLogSearch,
  onLoadFullLog,
}: ProtocolLogsPanelProps) {
  const { rootRef, isDark } = useAncestorDarkMode<HTMLDivElement>();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMatch, setSelectedMatch] = useState(0);
  const searchRequestRef = useRef(0);
  const [serverResults, setServerResults] = useState<{
    key: string;
    matches: Array<{ offset: number; text: string }>;
    complete: boolean;
  } | null>(null);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchFailure, setSearchFailure] = useState<string | null>(null);
  const [copyBusy, setCopyBusy] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  // Brief confirmation, then restore the normal Copy label.
  // Cleanup also prevents a delayed reset after a new copy or unmount.
  useEffect(() => {
    if (copyMessage !== "Copied") return;
    const timeoutId = window.setTimeout(() => setCopyMessage(null), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [copyMessage]);
  const [copyError, setCopyError] = useState<string | null>(null);

  const copyFullLog = async () => {
    if (!onLoadFullLog || !activeLogChannelId || copyBusy) return;
    setCopyBusy(true);
    setCopyMessage(null);
    setCopyError(null);
    try {
      // Start clipboard.write during the user gesture. Its Blob promise may
      // resolve only after the full log has streamed from the server.
      const blobPromise = onLoadFullLog(activeLogChannelId).then(
        blob => new Blob([blob], { type: "text/plain" }),
      );
      // Ensure the fetch rejection is always observed, including when a
      // clipboard implementation rejects before inspecting the Blob promise.
      void blobPromise.catch(() => undefined);
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({ "text/plain": blobPromise }),
        ]);
        await blobPromise;
      } else if (navigator.clipboard?.writeText) {
        // Fallback for older browsers; large logs need Blob clipboard support.
        const blob = await blobPromise;
        await navigator.clipboard.writeText(await blob.text());
      } else {
        throw new Error("Clipboard access is unavailable (HTTPS is required)");
      }
      setCopyMessage("Copied");
    } catch (error) {
      setCopyError(error instanceof Error ? error.message : "Could not copy full log");
    } finally {
      setCopyBusy(false);
    }
  };
  const normalizedQuery = searchQuery.toLocaleLowerCase();
  const lines = activeLogText.split(/\r\n|\r|\n/);
  const matches: Array<{ line: number; start: number }> = [];
  if (normalizedQuery) {
    lines.forEach((line, index) => {
      const lower = line.toLocaleLowerCase();
      let start = 0;
      while (start <= lower.length - normalizedQuery.length) {
        const hit = lower.indexOf(normalizedQuery, start);
        if (hit < 0) break;
        matches.push({ line: index, start: hit });
        start = hit + normalizedQuery.length;
      }
    });
  }
  const currentMatch = matches.length ? Math.min(selectedMatch, matches.length - 1) : 0;
  const globalKey = `${activeLogChannelId}\u0000${searchQuery}`;
  const globalActive = Boolean(onSearchAll && onNavigateToOffset && searchQuery.trim());
  const validServerResults = globalActive && serverResults?.key === globalKey ? serverResults : null;
  const navigationMatchCount = validServerResults ? validServerResults.matches.length : matches.length;
  const navigationIndex = validServerResults
    ? (navigationMatchCount ? Math.min(selectedMatch, navigationMatchCount - 1) : 0)
    : currentMatch;

  const performGlobalSearch = async () => {
    if (!onSearchAll || !onNavigateToOffset || !searchQuery.trim()) return;
    const key = globalKey;
    const generation = ++searchRequestRef.current;
    setSearchBusy(true);
    setSearchFailure(null);
    try {
      const result = await onSearchAll(activeLogChannelId, searchQuery);
      if (generation !== searchRequestRef.current) return;
      setServerResults({ key, matches: result.matches, complete: result.complete });
      setSelectedMatch(0);
      if (result.matches.length > 0) await onNavigateToOffset(result.matches[0].offset);
    } catch (error) {
      if (generation === searchRequestRef.current) {
        setSearchFailure(error instanceof Error ? error.message : 'Failed to search logs');
      }
    } finally {
      if (generation === searchRequestRef.current) setSearchBusy(false);
    }
  };

  const moveMatch = (direction: number) => {
    if (globalActive) {
      if (!validServerResults) {
        void performGlobalSearch();
        return;
      }
      if (!validServerResults.matches.length) return;
      const next = (navigationIndex + direction + validServerResults.matches.length)
        % validServerResults.matches.length;
      setSelectedMatch(next);
      void onNavigateToOffset?.(validServerResults.matches[next].offset);
      return;
    }
    if (!matches.length) return;
    const next = (currentMatch + direction + matches.length) % matches.length;
    setSelectedMatch(next);
    const el = logsContainerRef.current?.querySelectorAll('[data-testid="log-search-match"]')[next];
    if (el && 'scrollIntoView' in el) {
      (el as HTMLElement).scrollIntoView({ block: 'nearest' });
    }
  };
  const renderHighlightedLine = (line: string, lineIndex: number) => {
    const clean = line.replace(/\x08/g, "");
    if (!normalizedQuery) return parseAnsi(clean);
    const lower = clean.toLocaleLowerCase();
    const parts: JSX.Element[] = [];
    let cursor = 0;
    let matchIndex = 0;
    while (cursor <= clean.length - normalizedQuery.length) {
      const start = lower.indexOf(normalizedQuery, cursor);
      if (start < 0) break;
      if (start > cursor) parts.push(<span key={`text-${cursor}`}>{parseAnsi(clean.slice(cursor, start))}</span>);
      const ordinal = matches.findIndex(match => match.line === lineIndex && match.start === start);
      parts.push(
        <mark
          key={`match-${matchIndex++}`}
          data-testid="log-search-match"
          style={{
            background: ordinal === currentMatch ? '#f59e0b' : '#fef08a',
            color: '#111827',
          }}
        >
          {clean.slice(start, start + searchQuery.length)}
        </mark>
      );
      cursor = start + searchQuery.length;
    }
    if (cursor < clean.length) parts.push(<span key={`rest-${cursor}`}>{parseAnsi(clean.slice(cursor))}</span>);
    return parts;
  };

  const panelBg = isDark ? "rgba(2, 6, 23, 0.72)" : "#f5f5f5";
  const panelText = isDark ? "#e5e7eb" : "#111827";
  const panelBorder = isDark ? "rgba(148, 163, 184, 0.26)" : "#e5e7eb";
  const panelShadow = isDark
    ? "inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 12px 28px rgba(0, 0, 0, 0.18)"
    : "none";

  return (
    <Box
      ref={rootRef}
      sx={{
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <Tabs
        value={activeLogChannelId}
        onChange={(_, val) => {
          searchRequestRef.current += 1;
          setServerResults(null);
          setSelectedMatch(0);
          setActiveLogChannelId(String(val));
        }}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        sx={{
          flex: "0 0 auto",
          mb: 0.5,
          "& .MuiTab-root": {
            textTransform: "none",
            fontSize: "0.8rem",
            fontWeight: 500,
          },
        }}
      >
        {sortedLogChannels.map((ch) => (
          <Tab key={ch.id} value={ch.id} label={ch.label} />
        ))}
      </Tabs>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          p: 1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <TextField
            size="small"
            fullWidth
            inputProps={{ 'aria-label': 'Search logs' }}
            placeholder="Search logs..."
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 17, color: "text.secondary" }} />
                </InputAdornment>
              ),
            }}
            sx={{
              "& .MuiOutlinedInput-root": { borderRadius: "12px" },
              "& .MuiInputBase-input": { fontSize: "0.8rem" },
              "& .MuiInputBase-input::placeholder": { fontSize: "0.78rem" },
            }}
            value={searchQuery}
            onChange={event => {
              searchRequestRef.current += 1;
              setSearchQuery(event.target.value);
              if (!event.target.value.trim()) void onClearLogSearch?.();
              setSelectedMatch(0);
              setServerResults(null);
              setSearchFailure(null);
              setSearchBusy(false);
            }}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault();
                moveMatch(event.shiftKey ? -1 : 1);
              }
            }}
          />
          <Typography variant="caption" sx={{ whiteSpace: 'nowrap' }}>
            {searchQuery ? `${navigationMatchCount ? navigationIndex + 1 : 0} of ${navigationMatchCount}${validServerResults && !validServerResults.complete ? '+' : ''}` : ''}
          </Typography>
          <IconButton
            size="small"
            aria-label="Previous log match"
            title="Previous match (Shift+Enter)"
            disabled={searchBusy || (!navigationMatchCount && !(globalActive && !validServerResults))}
            onClick={() => moveMatch(-1)}
          >
            <KeyboardArrowUpIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            aria-label="Next log match"
            title="Next match (Enter)"
            disabled={searchBusy || (!navigationMatchCount && !(globalActive && !validServerResults))}
            onClick={() => moveMatch(1)}
          >
            <KeyboardArrowDownIcon fontSize="small" />
          </IconButton>
          <Button
            size="small"
            variant="outlined"
            aria-label="Copy full log"
            title={`Copy entire ${activeLogChannelId} log`}
            onClick={() => void copyFullLog()}
            disabled={!onLoadFullLog || !activeLogChannelId || copyBusy}
            startIcon={<ContentCopyIcon sx={{ fontSize: 15 }} />}
            sx={{
              textTransform: "none", whiteSpace: "nowrap", flex: "0 0 auto",
              minWidth: 0, px: 1, height: 32, fontSize: "0.76rem", borderRadius: "10px",
            }}
          >
            <span role="status" aria-live="polite">
              {copyBusy ? "Copying..." : copyMessage ? "Copied" : "Copy"}
            </span>
          </Button>
        </Box>
        {copyError && (
          <Typography role="alert" variant="caption" color="error" sx={{ mb: 0.5 }}>
            {copyError}
          </Typography>
        )}
        {searchFailure && (
          <Typography variant="caption" color="error" sx={{ mb: 0.5 }}>
            {searchFailure}
          </Typography>
        )}
        {logsError && (
          <Typography variant="body2" color="error" sx={{ mb: 1 }}>
            {logsError}
          </Typography>
        )}

        <Box
          ref={logsContainerRef}
          onScroll={updateStickToBottom}
          sx={{
            flex: 1,
            minHeight: 0,
            minWidth: 0,
            backgroundColor: panelBg,
            color: panelText,
            borderRadius: 2,
            border: "1px solid",
            borderColor: panelBorder,
            boxShadow: panelShadow,
            p: 1.5,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: 12,
            lineHeight: 1.4,
            overflowY: "auto",
            overflowX: "auto",
            whiteSpace: "pre",
            scrollbarColor: isDark
              ? "rgba(148, 163, 184, 0.45) rgba(15, 23, 42, 0.55)"
              : undefined,
          }}
        >
          {activeLogText && activeLogText.length > 0 ? (
            lines.map((rawLine, idx) => {
              const line = rawLine.replace(/\x08/g, "");
              const lineNoColor = activeLogChannelId === "stderr" ? "#f87171" : "#60a5fa";

              return (
                <div key={idx} style={{ display: "flex", minWidth: 0 }}>
                  <span
                    style={{
                      color: lineNoColor,
                      userSelect: "none",
                      marginRight: 8,
                      flex: "0 0 auto",
                    }}
                  >
                    {String(idx + 1).padStart(5, "0")}:
                  </span>
                  <span style={{ flex: "1 1 auto", minWidth: 0 }}>{renderHighlightedLine(line, idx)}</span>
                </div>
              );
            })
          ) : (
            <Typography variant="body2" sx={{ opacity: 0.7, color: isDark ? "#94a3b8" : "#6b7280" }}>
              No logs yet.
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
}
