import { useEffect, useRef, useState } from "react";
import { Box, Button, CircularProgress, Dialog, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { ChevronLeft, ChevronRight, ImageIcon, ImagePlus, Trash2, X } from "lucide-react";

import { fetchFacilityImageUrl, type FacilityImage } from "@/api/facility";
import { FACILITY_TEXT } from "./facilityStyles";

export const IMAGE_TYPES = "image/png,image/jpeg,image/webp";

type Colors = { border: string; text: string; muted: string; hover: string };

function Thumbnail({ image, size, colors, onOpen }: { image: FacilityImage; size: number; colors: Colors; onOpen: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchFacilityImageUrl(image.id).then((loaded) => !cancelled && setUrl(loaded)).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [image.id]);
  return (
    <Tooltip arrow title={image.caption || "Open the image"}>
      <Box component="button" type="button" onClick={onOpen} aria-label={image.caption ? `Image: ${image.caption}` : "Image"}
           sx={{ width: size, height: size, p: 0, borderRadius: 1.5, overflow: "hidden", cursor: "zoom-in", flexShrink: 0,
                 border: `1px solid ${colors.border}`, bgcolor: colors.hover, display: "flex", alignItems: "center",
                 justifyContent: "center" }}>
        {url
          ? <img src={url} alt={image.caption || "Image"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <CircularProgress size={Math.round(size / 3)} />}
      </Box>
    </Tooltip>
  );
}

/**
 * The images of a sample, box or grid as thumbnails: one opens bigger, with its caption. With onAdd, a button adds
 * images (several at once); with onRemove, the bigger view removes the one shown.
 */
export default function ImageStrip({ images, size = 56, colors, onAdd, onRemove, addLabel = "Add images" }: {
  images: FacilityImage[];
  size?: number;
  colors: Colors;
  onAdd?: (files: File[]) => Promise<void>;
  onRemove?: (image: FacilityImage) => Promise<void>;
  addLabel?: string;
}) {
  const [open, setOpen] = useState<FacilityImage | null>(null);
  const [openUrl, setOpenUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setConfirmRemove(false);
    if (!open) {
      setOpenUrl(null);
      return;
    }
    let cancelled = false;
    fetchFacilityImageUrl(open.id).then((url) => !cancelled && setOpenUrl(url)).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } finally {
      setBusy(false);
    }
  };

  const index = open ? images.findIndex((image) => image.id === open.id) : -1;
  const step = (by: number) => {
    if (images.length < 2 || index < 0) return;
    setOpen(images[(index + by + images.length) % images.length]);
  };

  if (!images.length && !onAdd) return null;
  return (
    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexWrap: "wrap", rowGap: 0.75 }}>
      {images.map((image) => (
        <Thumbnail key={image.id} image={image} size={size} colors={colors} onOpen={() => setOpen(image)} />
      ))}
      {onAdd && (
        <>
          <Button size="small" variant="outlined" disabled={busy}
                  sx={{ textTransform: "none", fontSize: FACILITY_TEXT.note, borderRadius: 3, height: size }}
                  startIcon={busy ? <CircularProgress size={14} /> : <ImagePlus size={15} />}
                  onClick={() => inputRef.current?.click()}>
            {addLabel}
          </Button>
          <input ref={inputRef} type="file" accept={IMAGE_TYPES} multiple hidden aria-label={addLabel}
                 onChange={(e) => {
                   const files = Array.from(e.target.files ?? []);
                   e.target.value = "";
                   if (files.length) void run(() => onAdd(files));
                 }} />
        </>
      )}
      <Dialog open={open !== null} onClose={() => setOpen(null)} maxWidth="lg" aria-label={open?.caption || "Image"}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft") step(-1);
                if (e.key === "ArrowRight") step(1);
              }}
              PaperProps={{ sx: { bgcolor: "#0f172a", color: "#f8fafc", borderRadius: 3, overflow: "hidden", minWidth: { sm: 420 } } }}>
        <Stack direction="row" spacing={1.25} alignItems="center" sx={{ px: 2, py: 1.25, borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
          <ImageIcon size={18} style={{ opacity: 0.8, flexShrink: 0 }} />
          <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, fontWeight: 700, flex: 1, minWidth: 0, overflow: "hidden",
                            textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {open?.caption || "Image"}
          </Typography>
          {images.length > 1 && index >= 0 && (
            <Typography sx={{ fontSize: FACILITY_TEXT.note, opacity: 0.75, whiteSpace: "nowrap" }}>
              {index + 1} of {images.length}
            </Typography>
          )}
          <IconButton size="small" aria-label="Close" sx={{ color: "inherit" }} onClick={() => setOpen(null)}>
            <X size={18} />
          </IconButton>
        </Stack>
        <Box sx={{ position: "relative", bgcolor: "#020617", display: "flex", alignItems: "center", justifyContent: "center",
                   minHeight: 240 }}>
          {openUrl
            ? <img src={openUrl} alt={open?.caption || "Image"} style={{ maxWidth: "100%", maxHeight: "74vh", display: "block" }} />
            : <Box sx={{ p: 6 }}><CircularProgress /></Box>}
          {images.length > 1 && (
            <>
              <IconButton aria-label="Previous image" onClick={() => step(-1)}
                          sx={{ position: "absolute", left: 8, color: "#fff", bgcolor: "rgba(15,23,42,0.6)",
                                "&:hover": { bgcolor: "rgba(15,23,42,0.85)" } }}>
                <ChevronLeft size={22} />
              </IconButton>
              <IconButton aria-label="Next image" onClick={() => step(1)}
                          sx={{ position: "absolute", right: 8, color: "#fff", bgcolor: "rgba(15,23,42,0.6)",
                                "&:hover": { bgcolor: "rgba(15,23,42,0.85)" } }}>
                <ChevronRight size={22} />
              </IconButton>
            </>
          )}
        </Box>
        {onRemove && open && (
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="flex-end"
                 sx={{ px: 2, py: 1.25, borderTop: "1px solid rgba(255,255,255,0.12)" }}>
            {confirmRemove ? (
              <>
                <Typography sx={{ fontSize: FACILITY_TEXT.note, flex: 1 }}>Remove this image? It cannot be undone.</Typography>
                <Button size="small" disabled={busy} sx={{ textTransform: "none", fontSize: FACILITY_TEXT.note, color: "#f8fafc" }}
                        onClick={() => setConfirmRemove(false)}>
                  Keep it
                </Button>
                <Button size="small" variant="contained" color="error" disabled={busy}
                        startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <Trash2 size={15} />}
                        sx={{ textTransform: "none", fontSize: FACILITY_TEXT.note, boxShadow: "none", borderRadius: 3 }}
                        onClick={() => void run(async () => {
                          await onRemove(open);
                          setOpen(null);
                        })}>
                  Remove
                </Button>
              </>
            ) : (
              <Button size="small" disabled={busy} startIcon={<Trash2 size={15} />}
                      sx={{ textTransform: "none", fontSize: FACILITY_TEXT.note, color: "#fca5a5" }}
                      onClick={() => setConfirmRemove(true)}>
                Remove image
              </Button>
            )}
          </Stack>
        )}
      </Dialog>
    </Stack>
  );
}
