import { Button } from "@/components/ui/button";
import { ArrowLeft, Check, MoveIcon, ScanLine } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { detectDocumentCorners } from "../utils/edgeDetection";
import type { Point } from "../utils/imageProcessing";
import {
  applyPerspectiveTransform,
  canvasToDataUrl,
  loadImageToCanvas,
} from "../utils/imageProcessing";

interface Props {
  imageDataUrl: string;
  onDone: (croppedDataUrl: string) => void;
  onCancel: () => void;
}

// 300 DPI at DIN A4 (210mm x 297mm)
// 210mm / 25.4mm * 300dpi = 2480px
// 297mm / 25.4mm * 300dpi = 3508px
const A4_W = 2480;
const A4_H = 3508;

const LOUPE_RADIUS = 70;
const LOUPE_ZOOM = 3;

export function CropScreen({ imageDataUrl, onDone, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [sourceCanvas, setSourceCanvas] = useState<HTMLCanvasElement | null>(
    null,
  );
  const [corners, setCorners] = useState<Point[]>([
    { x: 0.05, y: 0.05 },
    { x: 0.95, y: 0.05 },
    { x: 0.95, y: 0.95 },
    { x: 0.05, y: 0.95 },
  ]);
  const [dragging, setDragging] = useState<number | null>(null);
  const [displaySize, setDisplaySize] = useState({ w: 1, h: 1 });
  const [imgNaturalSize, setImgNaturalSize] = useState({ w: 1, h: 1 });
  const [isProcessing, setIsProcessing] = useState(false);
  const [detecting, setDetecting] = useState(false);

  useEffect(() => {
    loadImageToCanvas(imageDataUrl).then((canvas) => {
      setSourceCanvas(canvas);
      setImgNaturalSize({ w: canvas.width, h: canvas.height });
      setDetecting(true);
      // Run edge detection asynchronously so UI can update first
      setTimeout(() => {
        const detected = detectDocumentCorners(canvas);
        if (detected) {
          setCorners(detected);
        }
        setDetecting(false);
      }, 50);
    });
  }, [imageDataUrl]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sourceCanvas) return;
    const ctx = canvas.getContext("2d")!;
    const { w, h } = displaySize;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(sourceCanvas, 0, 0, w, h);

    const pts = corners.map((c) => ({ x: c.x * w, y: c.y * h }));

    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = "#2dd4bf";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.stroke();

    pts.forEach((pt, i) => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 16, 0, Math.PI * 2);
      ctx.fillStyle = dragging === i ? "#14b8a6" : "white";
      ctx.fill();
      ctx.strokeStyle = "#14b8a6";
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.strokeStyle = dragging === i ? "white" : "#14b8a6";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(pt.x - 5, pt.y);
      ctx.lineTo(pt.x + 5, pt.y);
      ctx.moveTo(pt.x, pt.y - 5);
      ctx.lineTo(pt.x, pt.y + 5);
      ctx.stroke();
    });

    // --- Loupe overlay ---
    if (dragging !== null) {
      const draggedCorner = corners[dragging];
      // Position loupe on opposite side from dragged corner
      const loupeX = draggedCorner.x < 0.5 ? w - 90 : 90;
      const loupeY = draggedCorner.y < 0.5 ? h - 90 : 90;
      const radius = LOUPE_RADIUS;
      const zoom = LOUPE_ZOOM;

      // Source region on sourceCanvas
      const srcCX = draggedCorner.x * sourceCanvas.width;
      const srcCY = draggedCorner.y * sourceCanvas.height;
      const halfSrc = radius / zoom;
      const srcX = Math.max(
        0,
        Math.min(sourceCanvas.width - halfSrc * 2, srcCX - halfSrc),
      );
      const srcY = Math.max(
        0,
        Math.min(sourceCanvas.height - halfSrc * 2, srcCY - halfSrc),
      );
      const srcW = Math.min(halfSrc * 2, sourceCanvas.width);
      const srcH = Math.min(halfSrc * 2, sourceCanvas.height);

      ctx.save();

      // White background circle
      ctx.beginPath();
      ctx.arc(loupeX, loupeY, radius + 3, 0, Math.PI * 2);
      ctx.fillStyle = "white";
      ctx.fill();

      // Clip to circle
      ctx.beginPath();
      ctx.arc(loupeX, loupeY, radius, 0, Math.PI * 2);
      ctx.clip();

      // Draw magnified source region
      ctx.drawImage(
        sourceCanvas,
        srcX,
        srcY,
        srcW,
        srcH,
        loupeX - radius,
        loupeY - radius,
        radius * 2,
        radius * 2,
      );

      ctx.restore();

      // Teal border ring
      ctx.beginPath();
      ctx.arc(loupeX, loupeY, radius, 0, Math.PI * 2);
      ctx.strokeStyle = "#2dd4bf";
      ctx.lineWidth = 3;
      ctx.stroke();

      // Red crosshair at center
      const ch = 14;
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(loupeX - ch, loupeY);
      ctx.lineTo(loupeX + ch, loupeY);
      ctx.moveTo(loupeX, loupeY - ch);
      ctx.lineTo(loupeX, loupeY + ch);
      ctx.stroke();
    }
  }, [corners, dragging, displaySize, sourceCanvas]);

  useEffect(() => {
    if (!containerRef.current || !sourceCanvas) return;
    const ro = new ResizeObserver(() => {
      if (!containerRef.current) return;
      const maxW = containerRef.current.clientWidth;
      const maxH = containerRef.current.clientHeight;
      const ratio = sourceCanvas.width / sourceCanvas.height;
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
  }, [sourceCanvas]);

  useEffect(() => {
    if (canvasRef.current) {
      canvasRef.current.width = displaySize.w;
      canvasRef.current.height = displaySize.h;
    }
    draw();
  }, [displaySize, draw]);

  const getPos = (e: React.MouseEvent | React.TouchEvent): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
    };
  };

  const getCornerIndex = (pos: Point): number => {
    let closest = -1;
    let minDist = 32;
    corners.forEach((c, i) => {
      const dx = (pos.x - c.x) * displaySize.w;
      const dy = (pos.y - c.y) * displaySize.h;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 32 && dist < minDist) {
        minDist = dist;
        closest = i;
      }
    });
    return closest;
  };

  const onPointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    const pos = getPos(e);
    const idx = getCornerIndex(pos);
    if (idx >= 0) setDragging(idx);
  };

  const onPointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (dragging === null) return;
    e.preventDefault();
    const pos = getPos(e);
    setCorners((prev) => prev.map((c, i) => (i === dragging ? pos : c)));
  };

  const onPointerUp = () => setDragging(null);

  const handleConfirm = () => {
    if (!sourceCanvas || isProcessing) return;
    setIsProcessing(true);
    // Use setTimeout to allow UI to update (show loading state) before heavy computation
    setTimeout(() => {
      const naturalCorners = corners.map((c) => ({
        x: c.x * imgNaturalSize.w,
        y: c.y * imgNaturalSize.h,
      }));
      // Output at full 300 DPI A4 resolution
      const result = applyPerspectiveTransform(
        sourceCanvas,
        naturalCorners,
        A4_W,
        A4_H,
      );
      // Encode at high quality — 0.95 JPEG is near-lossless for document scans
      onDone(canvasToDataUrl(result, 0.95));
      setIsProcessing(false);
    }, 30);
  };

  return (
    <div className="h-screen bg-foreground flex flex-col overflow-hidden">
      <header className="flex items-center justify-between px-4 py-3 bg-foreground/95">
        <button
          type="button"
          data-ocid="crop.cancel_button"
          onClick={onCancel}
          disabled={isProcessing}
          className="flex items-center gap-1.5 text-background/80 hover:text-background transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="text-sm font-medium">Zurück</span>
        </button>
        <h2 className="text-sm font-semibold text-background/90 font-display">
          Ecken anpassen
        </h2>
        <Button
          data-ocid="crop.confirm_button"
          onClick={handleConfirm}
          disabled={isProcessing}
          size="sm"
          className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Check className="w-4 h-4" />
          {isProcessing ? "Verarbeite…" : "Weiter"}
        </Button>
      </header>

      <div className="flex items-center gap-2 px-4 py-2 bg-primary/10">
        {detecting ? (
          <>
            <ScanLine className="w-3.5 h-3.5 text-primary flex-shrink-0 animate-pulse" />
            <p className="text-xs text-primary">Erkennung läuft…</p>
          </>
        ) : (
          <>
            <MoveIcon className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            <p className="text-xs text-primary">
              Ecken werden automatisch erkannt – bei Bedarf feinjustieren
            </p>
          </>
        )}
      </div>

      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center p-4 overflow-hidden"
      >
        <canvas
          ref={canvasRef}
          data-ocid="crop.canvas_target"
          className="max-w-full max-h-full rounded-lg"
          style={{
            cursor: dragging !== null ? "grabbing" : "crosshair",
            touchAction: "none",
          }}
          onMouseDown={onPointerDown}
          onMouseMove={onPointerMove}
          onMouseUp={onPointerUp}
          onMouseLeave={onPointerUp}
          onTouchStart={onPointerDown}
          onTouchMove={onPointerMove}
          onTouchEnd={onPointerUp}
        />
      </div>
    </div>
  );
}
