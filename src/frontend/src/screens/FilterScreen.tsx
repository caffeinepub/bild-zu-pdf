import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle2, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyFilter,
  canvasToDataUrl,
  createThumbnail,
  loadImageToCanvas,
  scaleCanvas,
} from "../utils/imageProcessing";
import type { FilterType } from "../utils/imageProcessing";

interface Props {
  imageDataUrl: string;
  onDone: (finalDataUrl: string, thumbnail: string) => void;
  onBack: (originalDataUrl: string) => void;
}

const FILTERS: { id: FilterType; label: string; desc: string }[] = [
  { id: "farbe", label: "Farbe", desc: "Auto-Korrektur" },
  { id: "graustufen", label: "Graustufen", desc: "Ohne Farbe" },
  { id: "sw", label: "S/W", desc: "Schwarz/Weiß" },
  { id: "text", label: "Text", desc: "Textverstärkung" },
];

const FILTER_SWATCHES: Record<FilterType, { bg: string; label: string }> = {
  farbe: {
    bg: "linear-gradient(135deg, #f87171 0%, #4ade80 50%, #60a5fa 100%)",
    label: "RGB",
  },
  graustufen: {
    bg: "linear-gradient(135deg, #374151 0%, #9ca3af 50%, #e5e7eb 100%)",
    label: "G",
  },
  sw: {
    bg: "linear-gradient(135deg, #000 0%, #000 45%, #fff 55%, #fff 100%)",
    label: "B/W",
  },
  text: {
    bg: "linear-gradient(135deg, #111 0%, #fff 55%, #111 100%)",
    label: "Aa",
  },
};

// Max resolution for the interactive preview canvas — avoids janky UI on large images
const PREVIEW_MAX_PX = 1200;

export function FilterScreen({ imageDataUrl, onDone, onBack }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Full-resolution source canvas — used only for final export
  const [sourceCanvas, setSourceCanvas] = useState<HTMLCanvasElement | null>(
    null,
  );
  // Downscaled preview canvas — used for interactive filter preview
  const [previewCanvas, setPreviewCanvas] = useState<HTMLCanvasElement | null>(
    null,
  );
  const [activeFilter, setActiveFilter] = useState<FilterType>("farbe");
  const [displaySize, setDisplaySize] = useState({ w: 300, h: 424 });

  useEffect(() => {
    loadImageToCanvas(imageDataUrl).then((canvas) => {
      setSourceCanvas(canvas);
      // Create a downscaled copy for fast preview rendering
      setPreviewCanvas(scaleCanvas(canvas, PREVIEW_MAX_PX));
    });
  }, [imageDataUrl]);

  useEffect(() => {
    if (!containerRef.current || !previewCanvas) return;
    const ro = new ResizeObserver(() => {
      if (!containerRef.current) return;
      const maxW = containerRef.current.clientWidth;
      const maxH = containerRef.current.clientHeight;
      const ratio = previewCanvas.width / previewCanvas.height;
      let w = maxW;
      let h = w / ratio;
      if (h > maxH) {
        h = maxH;
        w = h * ratio;
      }
      setDisplaySize({ w: Math.floor(w), h: Math.floor(h) });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [previewCanvas]);

  // Preview: apply filter to the small preview canvas and draw scaled to display size
  const drawFiltered = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !previewCanvas) return;
    canvas.width = displaySize.w;
    canvas.height = displaySize.h;
    const ctx = canvas.getContext("2d")!;
    const filtered = applyFilter(previewCanvas, activeFilter);
    ctx.drawImage(filtered, 0, 0, displaySize.w, displaySize.h);
  }, [previewCanvas, activeFilter, displaySize]);

  useEffect(() => {
    drawFiltered();
  }, [drawFiltered]);

  const handleConfirm = () => {
    // Export always uses the full-resolution sourceCanvas
    if (!sourceCanvas) return;
    const filtered = applyFilter(sourceCanvas, activeFilter);
    // High quality JPEG for the stored page image
    const finalDataUrl = canvasToDataUrl(filtered, 0.95);
    // Small thumbnail for the overview grid
    const thumbnail = createThumbnail(filtered, 200);
    onDone(finalDataUrl, thumbnail);
  };

  return (
    <div className="h-screen bg-[#111] flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between px-4 py-3 safe-top">
        <button
          type="button"
          data-ocid="filter.cancel_button"
          onClick={() => onBack(imageDataUrl)}
          className="flex items-center gap-2 text-white/70 hover:text-white active:text-white/50 transition-colors min-h-[44px] pr-3"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="text-sm font-medium">Zurück</span>
        </button>
        <h2 className="text-sm font-bold text-white font-display">
          Filter wählen
        </h2>
        <Button
          data-ocid="filter.confirm_button"
          onClick={handleConfirm}
          size="sm"
          className="gap-1.5 bg-primary text-white font-semibold rounded-xl min-h-[44px] px-4"
        >
          <Plus className="w-4 h-4" />
          Hinzufügen
        </Button>
      </header>

      {/* Canvas preview */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center px-4 py-2 overflow-hidden min-h-0"
      >
        <canvas
          ref={canvasRef}
          className="max-w-full max-h-full rounded-xl"
          style={{ boxShadow: "0 8px 40px rgba(0,0,0,0.6)" }}
        />
      </div>

      {/* Filter strip */}
      <div className="flex-shrink-0 px-3 pb-6 pt-3 safe-bottom">
        <div className="grid grid-cols-4 gap-2">
          {FILTERS.map((f) => {
            const active = activeFilter === f.id;
            const swatch = FILTER_SWATCHES[f.id];
            return (
              <button
                key={f.id}
                type="button"
                data-ocid="filter.tab"
                onClick={() => setActiveFilter(f.id)}
                className={[
                  "relative flex flex-col items-center gap-2 py-3.5 px-1 rounded-2xl transition-colors duration-150",
                  active
                    ? "bg-primary/20 ring-2 ring-primary ring-offset-1 ring-offset-[#111]"
                    : "bg-white/8 hover:bg-white/12 active:bg-white/15",
                ].join(" ")}
              >
                <div
                  className="w-10 h-7 rounded-lg flex-shrink-0 shadow-sm"
                  style={{ background: swatch.bg }}
                />
                <span className="text-xs font-bold text-white leading-none">
                  {f.label}
                </span>
                <span
                  className="text-[11px] leading-none"
                  style={{
                    color: active
                      ? "oklch(0.75 0.12 188)"
                      : "rgba(255,255,255,0.45)",
                  }}
                >
                  {f.desc}
                </span>
                {active && (
                  <CheckCircle2
                    className="absolute top-1.5 right-1.5 w-3.5 h-3.5 text-primary"
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
