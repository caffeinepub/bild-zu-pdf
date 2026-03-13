import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  GripVertical,
  Loader2,
  RotateCcw,
  RotateCw,
  Scissors,
  Share2,
  Upload,
} from "lucide-react";
import { PDFDocument, degrees } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.js?url";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

interface Props {
  onBack: () => void;
}

interface PageThumb {
  pageNum: number;
  dataUrl: string;
  selected: boolean;
  rotation: number;
}

function SortableThumbItem({
  thumb,
  index,
  onRotateLeft,
  onRotateRight,
}: {
  thumb: PageThumb;
  index: number;
  onRotateLeft: () => void;
  onRotateRight: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `order-${thumb.pageNum}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
    zIndex: isDragging ? 50 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-ocid={`split.order.item.${index + 1}`}
      className="relative bg-card border border-border rounded-xl overflow-hidden"
    >
      <div className="aspect-[3/4] bg-muted">
        <img
          src={thumb.dataUrl}
          alt={`Seite ${thumb.pageNum}`}
          className="w-full h-full object-cover transition-transform duration-200"
          style={{ transform: `rotate(${thumb.rotation}deg)` }}
          loading="lazy"
        />
      </div>
      <span className="absolute top-1 left-1 bg-black/55 backdrop-blur-sm text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">
        {thumb.pageNum}
      </span>
      <button
        type="button"
        data-ocid={`split.order.drag_handle.${index + 1}`}
        className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center bg-black/50 rounded-md text-white touch-none cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
        aria-label="Verschieben"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      <div className="flex items-center justify-center gap-1 p-1 bg-background/90 border-t border-border">
        <button
          type="button"
          data-ocid={`split.order.rotate_left.${index + 1}`}
          onClick={onRotateLeft}
          className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          aria-label="Links drehen"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          data-ocid={`split.order.rotate_right.${index + 1}`}
          onClick={onRotateRight}
          className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          aria-label="Rechts drehen"
        >
          <RotateCw className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export function PdfSplitScreen({ onBack }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pdfBytes, setPdfBytes] = useState<ArrayBuffer | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [thumbs, setThumbs] = useState<PageThumb[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [rangeInput, setRangeInput] = useState("");
  const [orderedSelection, setOrderedSelection] = useState<number[]>([]);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [filename, setFilename] = useState("Auswahl");
  const [isExporting, setIsExporting] = useState(false);

  const canShare = typeof navigator.share === "function";

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
  );

  // Sync orderedSelection when thumbs selection changes
  useEffect(() => {
    const selectedNums = thumbs.filter((t) => t.selected).map((t) => t.pageNum);
    setOrderedSelection((prev) => {
      const kept = prev.filter((n) => selectedNums.includes(n));
      const added = selectedNums.filter((n) => !prev.includes(n));
      return [...kept, ...added];
    });
  }, [thumbs]);

  // Sync range input -> selection
  const applyRangeInput = useCallback(
    (value: string) => {
      if (!value.trim()) return;
      const pages = new Set<number>();
      const parts = value.split(",");
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed.includes("-")) {
          const [start, end] = trimmed.split("-").map(Number);
          if (!Number.isNaN(start) && !Number.isNaN(end)) {
            for (let i = start; i <= end && i <= totalPages; i++) {
              if (i >= 1) pages.add(i);
            }
          }
        } else {
          const n = Number(trimmed);
          if (!Number.isNaN(n) && n >= 1 && n <= totalPages) pages.add(n);
        }
      }
      setThumbs((prev) =>
        prev.map((t) => ({ ...t, selected: pages.has(t.pageNum) })),
      );
    },
    [totalPages],
  );

  // Sync selection -> range input
  useEffect(() => {
    if (thumbs.length === 0) return;
    const selected = thumbs
      .filter((t) => t.selected)
      .map((t) => t.pageNum)
      .sort((a, b) => a - b);
    if (selected.length === 0) {
      setRangeInput("");
      return;
    }
    const ranges: string[] = [];
    let start = selected[0];
    let end = selected[0];
    for (let i = 1; i < selected.length; i++) {
      if (selected[i] === end + 1) {
        end = selected[i];
      } else {
        ranges.push(start === end ? `${start}` : `${start}-${end}`);
        start = selected[i];
        end = selected[i];
      }
    }
    ranges.push(start === end ? `${start}` : `${start}-${end}`);
    setRangeInput(ranges.join(", "));
  }, [thumbs]);

  const loadPdf = async (file: File) => {
    setIsLoading(true);
    setThumbs([]);
    setOrderedSelection([]);
    try {
      const buffer = await file.arrayBuffer();
      setPdfBytes(buffer);
      const pdf = await pdfjsLib.getDocument({ data: buffer.slice(0) }).promise;
      setTotalPages(pdf.numPages);

      const newThumbs: PageThumb[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 0.4 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport }).promise;
        newThumbs.push({
          pageNum: i,
          dataUrl: canvas.toDataURL("image/jpeg", 0.7),
          selected: false,
          rotation: 0,
        });
      }
      setThumbs(newThumbs);
    } catch (err) {
      console.error(err);
      toast.error("Fehler beim Laden der PDF.");
    } finally {
      setIsLoading(false);
    }
  };

  const togglePage = (pageNum: number) => {
    setThumbs((prev) =>
      prev.map((t) =>
        t.pageNum === pageNum ? { ...t, selected: !t.selected } : t,
      ),
    );
  };

  const rotatePageInOrder = (pageNum: number, dir: 1 | -1) => {
    setThumbs((prev) =>
      prev.map((t) =>
        t.pageNum === pageNum
          ? { ...t, rotation: (((t.rotation + dir * 90) % 360) + 360) % 360 }
          : t,
      ),
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setOrderedSelection((prev) => {
        const oldIndex = prev.findIndex((n) => `order-${n}` === active.id);
        const newIndex = prev.findIndex((n) => `order-${n}` === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  };

  const orderedThumbs = orderedSelection
    .map((n) => thumbs.find((t) => t.pageNum === n))
    .filter(Boolean) as PageThumb[];

  const exportPdf = async (download: boolean, share: boolean) => {
    if (!pdfBytes || orderedSelection.length === 0) return;
    setIsExporting(true);
    try {
      const srcDoc = await PDFDocument.load(pdfBytes);
      const newDoc = await PDFDocument.create();
      const indices = orderedSelection.map((p) => p - 1);
      const copied = await newDoc.copyPages(srcDoc, indices);
      for (let i = 0; i < copied.length; i++) {
        const page = copied[i];
        const thumb = thumbs.find((t) => t.pageNum === orderedSelection[i]);
        if (thumb && thumb.rotation !== 0) {
          page.setRotation(degrees(thumb.rotation));
        }
        newDoc.addPage(page);
      }
      const bytes = await newDoc.save();
      const blob = new Blob([bytes.buffer as ArrayBuffer], {
        type: "application/pdf",
      });
      const safeFilename = `${filename.trim() || "Auswahl"}.pdf`;

      if (share && canShare) {
        const fileObj = new File([blob], safeFilename, {
          type: "application/pdf",
        });
        await navigator.share({ files: [fileObj], title: safeFilename });
        toast.success("PDF wird geteilt");
      } else if (download) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = safeFilename;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("PDF gespeichert");
      }
    } catch (err) {
      console.error(err);
      toast.error("Fehler beim Erstellen des PDFs");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              data-ocid="split.back_button"
              onClick={onBack}
              className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-accent transition-colors -ml-1"
              aria-label="Zurück"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
                <Scissors className="w-4 h-4 text-primary" />
              </div>
              <h1 className="text-[17px] font-bold font-display tracking-tight">
                PDF aufteilen
              </h1>
            </div>
          </div>
          {orderedSelection.length > 0 && (
            <Button
              data-ocid="split.export_button"
              size="sm"
              onClick={() => setShowExportDialog(true)}
              className="gap-1.5 rounded-xl font-semibold"
            >
              <Download className="w-3.5 h-3.5" />
              {orderedSelection.length} Seite
              {orderedSelection.length !== 1 ? "n" : ""}
            </Button>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-5">
        {!pdfBytes ? (
          <div
            data-ocid="split.empty_state"
            className="flex flex-col items-center justify-center min-h-[calc(100vh-14rem)] text-center animate-fade-in"
          >
            <div className="w-20 h-20 rounded-3xl bg-accent flex items-center justify-center mb-6">
              <Scissors className="w-10 h-10 text-primary" />
            </div>
            <h2 className="text-xl font-bold font-display mb-2">
              PDF hochladen
            </h2>
            <p className="text-muted-foreground text-sm mb-8 max-w-xs">
              Wähle eine PDF-Datei, um einzelne Seiten auszuwählen und als neues
              Dokument zu speichern.
            </p>
            <Button
              data-ocid="split.upload_button"
              size="lg"
              onClick={() => fileInputRef.current?.click()}
              className="gap-2.5 h-14 rounded-2xl text-base font-bold px-8"
            >
              <Upload className="w-5 h-5" />
              PDF auswählen
            </Button>
          </div>
        ) : isLoading ? (
          <div
            data-ocid="split.loading_state"
            className="flex flex-col items-center justify-center min-h-[calc(100vh-14rem)] gap-4"
          >
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-muted-foreground font-medium">
              Seiten werden geladen…
            </p>
          </div>
        ) : (
          <>
            {/* Selection grid */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-muted-foreground">
                  <span className="text-foreground font-bold">
                    {totalPages}
                  </span>{" "}
                  Seiten gesamt ·{" "}
                  <span className="text-primary font-bold">
                    {orderedSelection.length}
                  </span>{" "}
                  ausgewählt
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    data-ocid="split.select_all_button"
                    onClick={() =>
                      setThumbs((prev) =>
                        prev.map((t) => ({ ...t, selected: true })),
                      )
                    }
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    Alle
                  </button>
                  <span className="text-border">·</span>
                  <button
                    type="button"
                    data-ocid="split.deselect_all_button"
                    onClick={() =>
                      setThumbs((prev) =>
                        prev.map((t) => ({ ...t, selected: false })),
                      )
                    }
                    className="text-xs font-semibold text-muted-foreground hover:underline"
                  >
                    Keine
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 mb-4">
                <Label
                  htmlFor="range-input"
                  className="text-sm font-semibold whitespace-nowrap"
                >
                  Seiten:
                </Label>
                <Input
                  id="range-input"
                  data-ocid="split.input"
                  value={rangeInput}
                  onChange={(e) => setRangeInput(e.target.value)}
                  onBlur={(e) => applyRangeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") applyRangeInput(rangeInput);
                  }}
                  placeholder="z.B. 1, 3, 5-7"
                  className="rounded-xl h-10 text-sm"
                />
              </div>

              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {thumbs.map((thumb) => (
                  <button
                    key={thumb.pageNum}
                    type="button"
                    data-ocid={`split.item.${thumb.pageNum}`}
                    onClick={() => togglePage(thumb.pageNum)}
                    className={`relative rounded-2xl overflow-hidden border-2 transition-all ${
                      thumb.selected
                        ? "border-primary ring-2 ring-primary/30"
                        : "border-border"
                    }`}
                  >
                    <div className="aspect-[3/4] bg-muted">
                      <img
                        src={thumb.dataUrl}
                        alt={`Seite ${thumb.pageNum}`}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <span className="absolute top-1.5 left-1.5 bg-black/50 backdrop-blur-sm text-white text-[10px] font-bold px-1.5 py-1 rounded-md">
                      {thumb.pageNum}
                    </span>
                    {thumb.selected && (
                      <div className="absolute inset-0 bg-primary/10 flex items-center justify-center">
                        <CheckCircle2 className="w-8 h-8 text-primary drop-shadow" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Reihenfolge section */}
            {orderedSelection.length > 0 && (
              <div className="mt-6">
                <Separator className="mb-4" />
                <div className="flex items-center gap-2 mb-3">
                  <GripVertical className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-semibold text-foreground">
                    Reihenfolge
                  </span>
                  <span className="text-xs text-muted-foreground ml-1">
                    Ziehen zum Sortieren · Drehen per Knopf
                  </span>
                </div>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={orderedSelection.map((n) => `order-${n}`)}
                    strategy={rectSortingStrategy}
                  >
                    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                      {orderedThumbs.map((thumb, i) => (
                        <SortableThumbItem
                          key={`order-${thumb.pageNum}`}
                          thumb={thumb}
                          index={i}
                          onRotateLeft={() =>
                            rotatePageInOrder(thumb.pageNum, -1)
                          }
                          onRotateRight={() =>
                            rotatePageInOrder(thumb.pageNum, 1)
                          }
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            )}

            <div className="mt-6">
              <Button
                data-ocid="split.upload_button"
                variant="outline"
                onClick={() => {
                  setPdfBytes(null);
                  setThumbs([]);
                  setTimeout(() => fileInputRef.current?.click(), 50);
                }}
                className="w-full gap-2 rounded-2xl h-12 border-dashed border-2 text-muted-foreground hover:text-primary hover:border-primary"
              >
                <Upload className="w-4 h-4" />
                Andere PDF laden
              </Button>
            </div>
          </>
        )}
      </main>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        data-ocid="split.dropzone"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) loadPdf(file);
          e.target.value = "";
        }}
      />

      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent
          data-ocid="split.dialog"
          className="max-w-sm rounded-3xl"
        >
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              PDF exportieren
            </DialogTitle>
          </DialogHeader>
          <div className="py-1">
            <Label
              htmlFor="split-filename"
              className="text-sm font-semibold text-foreground mb-2 block"
            >
              Dateiname
            </Label>
            <Input
              id="split-filename"
              data-ocid="split.export_input"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              placeholder="Auswahl"
              className="rounded-xl h-11 text-base"
            />
            <p className="text-xs text-muted-foreground mt-2">
              {orderedSelection.length} Seite
              {orderedSelection.length !== 1 ? "n" : ""} ausgewählt
            </p>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col mt-1">
            <Button
              data-ocid="split.primary_button"
              onClick={() => exportPdf(true, false)}
              disabled={isExporting}
              className="w-full gap-2 rounded-xl h-12 font-semibold"
            >
              {isExporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {isExporting ? "Wird erstellt…" : "Herunterladen"}
            </Button>
            {canShare && (
              <Button
                data-ocid="split.secondary_button"
                variant="outline"
                onClick={() => exportPdf(false, true)}
                disabled={isExporting}
                className="w-full gap-2 rounded-xl h-12 font-semibold"
              >
                <Share2 className="w-4 h-4" />
                Teilen
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
