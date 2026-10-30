import { useEffect, useRef, useState } from "react";
import { Box, Button, CircularProgress, Dialog, DialogContent, Stack, Tooltip, Typography } from "@mui/material";
import { ImagePlus, Trash2 } from "lucide-react";

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
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
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
      <Dialog open={open !== null} onClose={() => setOpen(null)} maxWidth="lg">
        <DialogContent sx={{ p: 1.5 }}>
          {openUrl
            ? <img src={openUrl} alt={open?.caption || "Image"} style={{ maxWidth: "100%", maxHeight: "78vh", display: "block" }} />
            : <Box sx={{ p: 6 }}><CircularProgress /></Box>}
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1 }}>
            <Typography sx={{ fontSize: FACILITY_TEXT.itemLine, flex: 1 }}>{open?.caption}</Typography>
            {onRemove && open && (
              <Button size="small" color="error" disabled={busy} startIcon={<Trash2 size={15} />}
                      sx={{ textTransform: "none", fontSize: FACILITY_TEXT.note }}
                      onClick={() => void run(async () => {
                        await onRemove(open);
                        setOpen(null);
                      })}>
                Remove image
              </Button>
            )}
          </Stack>
        </DialogContent>
      </Dialog>
    </Stack>
  );
}
