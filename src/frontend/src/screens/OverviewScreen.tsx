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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  AlertCircle,
  ArrowLeft,
  Camera,
  Download,
  FileText,
  GripVertical,
  ImageIcon,
  Plus,
  Share2,
  Trash2,
} from "lucide-react";
import { PDFDocument } from "pdf-lib";
import { useRef, useState } from "react";
import { toast } from "sonner";
import type { PageItem } from "../App";

const MAX_PAGES = 100;
// A4 in points (72 DPI): 595.28 x 841.89
const A4_W = 595.28;
const A4_H = 841.89;

interface Props {
  pages: PageItem[];
  setPages: React.Dispatch<React.SetStateAction<PageItem[]>>;
  onImageSelected: (dataUrl: string) => void;
  onBack: () => void;
}

function SortablePage({
  page,
  index,
  onDelete,
}: { page: PageItem; index: number; onDelete: () => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: page.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
    zIndex: isDragging ? 50 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        boxShadow:
          "0 1px 3px 0 oklch(0.52 0.155 188 / 0.08), 0 1px 1px 0 oklch(0.52 0.155 188 / 0.04)",
      }}
      data-ocid={`page.item.${index + 1}`}
      className="relative bg-card rounded-2xl overflow-hidden border border-border animate-scale-in"
    >
      <div className="aspect-[3/4] overflow-hidden bg-muted relative">
        <img
          src={page.thumbnail}
          alt={`Seite ${index + 1}`}
          className="w-full h-full object-cover"
          loading="lazy"
        />
        <span className="absolute top-1.5 left-1.5 bg-black/50 backdrop-blur-sm text-white text-[10px] font-bold leading-none px-1.5 py-1 rounded-md">
          {index + 1}
        </span>
        <button
          type="button"
          data-ocid={`page.drag_handle.${index + 1}`}
          className="absolute top-1 right-1 w-8 h-8 flex items-center justify-center bg-black/40 backdrop-blur-sm rounded-lg text-white/80 touch-none cursor-grab active:cursor-grabbing"
          {...attributes}
          {...listeners}
          aria-label="Seite verschieben"
        >
          <GripVertical className="w-4 h-4" />
        </button>
      </div>

      <button
        type="button"
        data-ocid={`page.delete_button.${index + 1}`}
        onClick={onDelete}
        className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/6 transition-colors"
        aria-label={`Seite ${index + 1} l\u00f6schen`}
      >
        <Trash2 className="w-3.5 h-3.5" />
        L\u00f6schen
      </button>
    </div>
  );
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function getImageDimensions(
  dataUrl: string,
): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 2480, h: 3508 });
    img.src = dataUrl;
  });
}

export function OverviewScreen({
  pages,
  setPages,
  onImageSelected,
  onBack,
}: Props) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showPdfDialog, setShowPdfDialog] = useState(false);
  const [filename, setFilename] = useState("Dokument");
  const [isGenerating, setIsGenerating] = useState(false);

  const isMobile = /Mobi|Android/i.test(navigator.userAgent);
  const canShare = typeof navigator.share === "function";

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
  );

  const handleAddClick = () => {
    if (pages.length >= MAX_PAGES) {
      toast.error(`Maximum von ${MAX_PAGES} Seiten erreicht.`);
      return;
    }
    if (isMobile) {
      setShowAddSheet(true);
    } else {
      galleryInputRef.current?.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      onImageSelected(dataUrl);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setPages((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const deletePage = (id: string) => {
    setPages((prev) => prev.filter((p) => p.id !== id));
    toast.success("Seite gel\u00f6scht");
  };

  const generatePdf = async (download: boolean, share: boolean) => {
    if (pages.length === 0) return;
    setIsGenerating(true);
    try {
      const pdfDoc = await PDFDocument.create();

      for (const pageItem of pages) {
        const imgDataUrl = pageItem.imageDataUrl;
        const isJpeg =
          imgDataUrl.startsWith("data:image/jpeg") ||
          imgDataUrl.startsWith("data:image/jpg");
        const imgBytes = dataUrlToBytes(imgDataUrl);
        const embeddedImg = isJpeg
          ? await pdfDoc.embedJpg(imgBytes)
          : await pdfDoc.embedPng(imgBytes);

        const { w: imgW, h: imgH } = await getImageDimensions(imgDataUrl);
        const aspectRatio = imgW / imgH;

        let drawW = A4_W;
        let drawH = drawW / aspectRatio;
        if (drawH > A4_H) {
          drawH = A4_H;
          drawW = drawH * aspectRatio;
        }
        const x = (A4_W - drawW) / 2;
        const y = (A4_H - drawH) / 2;

        const pdfPage = pdfDoc.addPage([A4_W, A4_H]);
        pdfPage.drawImage(embeddedImg, { x, y, width: drawW, height: drawH });
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], {
        type: "application/pdf",
      });
      const safeFilename = `${filename.trim() || "Dokument"}.pdf`;

      if (share && canShare) {
        const file = new File([blob], safeFilename, {
          type: "application/pdf",
        });
        await navigator.share({ files: [file], title: safeFilename });
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
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              data-ocid="overview.back_button"
              onClick={onBack}
              className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-accent transition-colors -ml-1"
              aria-label="Zur\u00fcck"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center shadow-sm">
              <FileText className="w-4 h-4 text-primary-foreground" />
            </div>
            <h1 className="text-[17px] font-bold font-display tracking-tight">
              Bild zu PDF
            </h1>
          </div>
          {pages.length > 0 && (
            <Button
              data-ocid="app.export_button"
              onClick={() => setShowPdfDialog(true)}
              size="sm"
              className="gap-1.5 rounded-xl font-semibold"
            >
              <Download className="w-3.5 h-3.5" />
              PDF erstellen
            </Button>
          )}
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-5">
        {pages.length === 0 ? (
          <div
            data-ocid="page.empty_state"
            className="flex flex-col items-center justify-center min-h-[calc(100vh-14rem)] text-center animate-fade-in"
          >
            <div className="relative mb-8" aria-hidden="true">
              <div
                className="absolute inset-0 rounded-full blur-3xl opacity-20"
                style={{
                  background: "oklch(0.52 0.155 188)",
                  transform: "scale(1.4)",
                }}
              />
              <div className="relative w-40 h-40 rounded-3xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/20 flex items-center justify-center shadow-card">
                <img
                  src="/assets/generated/empty-state-doc.dim_200x200.png"
                  alt=""
                  className="w-24 h-24 object-contain"
                />
              </div>
            </div>

            <h2 className="text-2xl font-bold font-display text-foreground mb-2">
              Noch keine Seiten
            </h2>
            <p className="text-base text-muted-foreground mb-8 max-w-[260px] leading-relaxed">
              F\u00fcge dein erstes Foto hinzu und erstelle ein PDF in Sekunden.
            </p>

            <Button
              data-ocid="app.add_page_button"
              onClick={handleAddClick}
              size="lg"
              className="w-full max-w-xs gap-2.5 h-14 rounded-2xl text-base font-bold shadow-card"
            >
              <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
                <Plus className="w-4 h-4" />
              </div>
              Seite hinzuf\u00fcgen
            </Button>

            <div className="mt-6 flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Camera className="w-3.5 h-3.5" /> Kamera
              </span>
              <span className="w-px h-3 bg-border" />
              <span className="flex items-center gap-1">
                <ImageIcon className="w-3.5 h-3.5" /> Galerie
              </span>
              <span className="w-px h-3 bg-border" />
              <span>Bis zu {MAX_PAGES} Seiten</span>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-muted-foreground">
                <span className="text-foreground font-bold">
                  {pages.length}
                </span>{" "}
                von {MAX_PAGES} Seiten
              </p>
              {pages.length >= MAX_PAGES && (
                <div className="flex items-center gap-1 text-xs font-medium text-destructive bg-destructive/8 px-2.5 py-1 rounded-full">
                  <AlertCircle className="w-3 h-3" />
                  Maximum erreicht
                </div>
              )}
            </div>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={pages.map((p) => p.id)}
                strategy={rectSortingStrategy}
              >
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {pages.map((page, index) => (
                    <SortablePage
                      key={page.id}
                      page={page}
                      index={index}
                      onDelete={() => deletePage(page.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            {pages.length < MAX_PAGES && (
              <div className="mt-4">
                <Button
                  data-ocid="app.add_page_button"
                  variant="outline"
                  onClick={handleAddClick}
                  className="w-full gap-2 rounded-2xl h-14 border-dashed border-2 text-muted-foreground hover:text-primary hover:border-primary hover:bg-primary/5 transition-all"
                >
                  <Plus className="w-5 h-5" />
                  <span className="font-semibold">Seite hinzuf\u00fcgen</span>
                </Button>
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center text-xs text-muted-foreground py-4 border-t border-border safe-bottom">
        \u00a9 {new Date().getFullYear()}. Erstellt mit{" "}
        <a
          href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground"
        >
          caffeine.ai
        </a>
      </footer>

      {/* Hidden inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Mobile add sheet */}
      <Sheet open={showAddSheet} onOpenChange={setShowAddSheet}>
        <SheetContent side="bottom" className="rounded-t-3xl pb-10 safe-bottom">
          <SheetHeader className="mb-5">
            <SheetTitle className="font-display text-xl">
              Bild hinzuf\u00fcgen
            </SheetTitle>
          </SheetHeader>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                setShowAddSheet(false);
                setTimeout(() => cameraInputRef.current?.click(), 100);
              }}
              className="flex-1 flex flex-col items-center gap-3 p-6 rounded-2xl bg-secondary hover:bg-accent active:bg-accent/80 transition-colors"
            >
              <div className="w-14 h-14 rounded-2xl bg-primary/12 flex items-center justify-center">
                <Camera className="w-7 h-7 text-primary" />
              </div>
              <span className="text-sm font-semibold">Kamera</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAddSheet(false);
                setTimeout(() => galleryInputRef.current?.click(), 100);
              }}
              className="flex-1 flex flex-col items-center gap-3 p-6 rounded-2xl bg-secondary hover:bg-accent active:bg-accent/80 transition-colors"
            >
              <div className="w-14 h-14 rounded-2xl bg-primary/12 flex items-center justify-center">
                <ImageIcon className="w-7 h-7 text-primary" />
              </div>
              <span className="text-sm font-semibold">Galerie</span>
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* PDF Export dialog */}
      <Dialog open={showPdfDialog} onOpenChange={setShowPdfDialog}>
        <DialogContent data-ocid="pdf.dialog" className="max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              PDF erstellen
            </DialogTitle>
          </DialogHeader>
          <div className="py-1">
            <Label
              htmlFor="pdf-filename"
              className="text-sm font-semibold text-foreground mb-2 block"
            >
              Dateiname
            </Label>
            <Input
              id="pdf-filename"
              data-ocid="pdf.input"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              placeholder="Dokument"
              className="rounded-xl h-11 text-base"
            />
            <div className="flex items-center gap-1.5 mt-2">
              <span className="inline-flex items-center gap-1 bg-muted text-muted-foreground text-xs font-medium px-2 py-0.5 rounded-full">
                {pages.length} Seite{pages.length !== 1 ? "n" : ""}
              </span>
              <span className="inline-flex items-center gap-1 bg-muted text-muted-foreground text-xs font-medium px-2 py-0.5 rounded-full">
                DIN A4 \u00b7 300 DPI
              </span>
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col mt-1">
            <Button
              data-ocid="pdf.primary_button"
              onClick={() => generatePdf(true, false)}
              disabled={isGenerating}
              className="w-full gap-2 rounded-xl h-12 font-semibold"
            >
              <Download className="w-4 h-4" />
              {isGenerating ? "Wird erstellt\u2026" : "Herunterladen"}
            </Button>
            {canShare && (
              <Button
                data-ocid="pdf.secondary_button"
                variant="outline"
                onClick={() => generatePdf(false, true)}
                disabled={isGenerating}
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
