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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  GripVertical,
  Layers,
  Loader2,
  Plus,
  RotateCcw,
  RotateCw,
  Share2,
  Trash2,
} from "lucide-react";
import { PDFDocument, degrees } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.js?url";
import { useRef, useState } from "react";
import { toast } from "sonner";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

interface PageEntry {
  id: string;
  fileId: string;
  fileShortName: string;
  pageIndex: number;
  pageNum: number;
  dataUrl: string;
  selected: boolean;
  rotation: number;
}

interface PdfFile {
  id: string;
  name: string;
  bytes: ArrayBuffer;
  pages: PageEntry[];
  expanded: boolean;
}

interface Props {
  onBack: () => void;
}

// Sortable row for the global Reihenfolge list
function SortableOrderItem({
  page,
  index,
  onRotateLeft,
  onRotateRight,
}: {
  page: PageEntry;
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
      style={style}
      data-ocid={`merge.order.item.${index + 1}`}
      className="flex items-center gap-2 bg-card border border-border rounded-xl px-2 py-2 animate-scale-in"
    >
      <button
        type="button"
        data-ocid={`merge.order.drag_handle.${index + 1}`}
        className="w-7 h-7 flex items-center justify-center text-muted-foreground/60 hover:text-muted-foreground touch-none cursor-grab active:cursor-grabbing flex-shrink-0"
        {...attributes}
        {...listeners}
        aria-label="Verschieben"
      >
        <GripVertical className="w-4 h-4" />
      </button>

      <div className="w-10 flex-shrink-0 rounded-lg overflow-hidden border border-border aspect-[3/4] bg-muted">
        <img
          src={page.dataUrl}
          alt={`Seite ${page.pageNum}`}
          className="w-full h-full object-cover transition-transform duration-200"
          style={{ transform: `rotate(${page.rotation}deg)` }}
          loading="lazy"
        />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-foreground truncate">
          {page.fileShortName}
        </p>
        <p className="text-[11px] text-muted-foreground">
          Seite {page.pageNum}
        </p>
      </div>

      <div className="flex items-center gap-0.5 flex-shrink-0">
        <button
          type="button"
          data-ocid={`merge.order.rotate_left.${index + 1}`}
          onClick={onRotateLeft}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          aria-label="Links drehen"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          data-ocid={`merge.order.rotate_right.${index + 1}`}
          onClick={onRotateRight}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          aria-label="Rechts drehen"
        >
          <RotateCw className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export function PdfMergeScreen({ onBack }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<PdfFile[]>([]);
  const [orderedSelection, setOrderedSelection] = useState<string[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [filename, setFilename] = useState("Zusammengefuegt");
  const [isExporting, setIsExporting] = useState(false);

  const canShare = typeof navigator.share === "function";

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
  );

  const allPages = files.flatMap((f) => f.pages);
  const selectedCount = orderedSelection.length;

  // Sync orderedSelection when pages selection changes
  const syncOrder = (updatedFiles: PdfFile[]) => {
    const allSelected = updatedFiles.flatMap((f) =>
      f.pages.filter((p) => p.selected).map((p) => p.id),
    );
    setOrderedSelection((prev) => {
      const kept = prev.filter((id) => allSelected.includes(id));
      const added = allSelected.filter((id) => !prev.includes(id));
      return [...kept, ...added];
    });
    return updatedFiles;
  };

  const addFiles = async (fileList: FileList) => {
    setIsAdding(true);
    try {
      const newFiles: PdfFile[] = [];
      for (const file of Array.from(fileList)) {
        if (file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
          toast.error(`"${file.name}" ist keine PDF-Datei.`);
          continue;
        }
        const bytes = await file.arrayBuffer();
        const fileId = `pdf-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const shortName = file.name.replace(/\.pdf$/i, "");

        // Load pdfjs for thumbnails
        const pdfDoc = await pdfjsLib.getDocument({ data: bytes.slice(0) })
          .promise;
        const pages: PageEntry[] = [];
        for (let i = 0; i < pdfDoc.numPages; i++) {
          const page = await pdfDoc.getPage(i + 1);
          const viewport = page.getViewport({ scale: 0.3 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d")!;
          await page.render({ canvasContext: ctx, viewport }).promise;
          pages.push({
            id: `${fileId}-p${i}`,
            fileId,
            fileShortName:
              shortName.length > 16 ? `${shortName.slice(0, 14)}…` : shortName,
            pageIndex: i,
            pageNum: i + 1,
            dataUrl: canvas.toDataURL("image/jpeg", 0.6),
            selected: true,
            rotation: 0,
          });
        }

        newFiles.push({
          id: fileId,
          name: shortName,
          bytes,
          pages,
          expanded: false,
        });
      }

      if (newFiles.length > 0) {
        setFiles((prev) => {
          const updated = [...prev, ...newFiles];
          // Add newly selected pages to orderedSelection
          const newPageIds = newFiles.flatMap((f) => f.pages.map((p) => p.id));
          setOrderedSelection((prevOrder) => [...prevOrder, ...newPageIds]);
          return updated;
        });
        toast.success(
          `${newFiles.length} Datei${newFiles.length !== 1 ? "en" : ""} hinzugefügt`,
        );
      }
    } catch (err) {
      console.error(err);
      toast.error("Fehler beim Laden einer PDF-Datei.");
    } finally {
      setIsAdding(false);
    }
  };

  const togglePageSelection = (fileId: string, pageId: string) => {
    const updated = files.map((f) =>
      f.id === fileId
        ? {
            ...f,
            pages: f.pages.map((p) =>
              p.id === pageId ? { ...p, selected: !p.selected } : p,
            ),
          }
        : f,
    );
    syncOrder(updated);
    setFiles(updated);
  };

  const toggleFileExpanded = (fileId: string) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === fileId ? { ...f, expanded: !f.expanded } : f)),
    );
  };

  const removeFile = (fileId: string) => {
    const file = files.find((f) => f.id === fileId);
    if (file) {
      const pageIds = file.pages.map((p) => p.id);
      setOrderedSelection((prev) => prev.filter((id) => !pageIds.includes(id)));
    }
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  const rotatePageInOrder = (pageId: string, dir: 1 | -1) => {
    setFiles((prev) =>
      prev.map((f) => ({
        ...f,
        pages: f.pages.map((p) =>
          p.id === pageId
            ? { ...p, rotation: (((p.rotation + dir * 90) % 360) + 360) % 360 }
            : p,
        ),
      })),
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setOrderedSelection((prev) => {
        const oldIndex = prev.indexOf(active.id as string);
        const newIndex = prev.indexOf(over.id as string);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  };

  const orderedPages = orderedSelection
    .map((id) => allPages.find((p) => p.id === id))
    .filter(Boolean) as PageEntry[];

  const mergePdf = async (download: boolean, share: boolean) => {
    if (orderedSelection.length === 0) return;
    setIsExporting(true);
    try {
      const merged = await PDFDocument.create();
      // Group by fileId for efficient loading
      const fileMap = new Map(files.map((f) => [f.id, f]));
      const srcDocs = new Map<string, PDFDocument>();
      for (const fileId of new Set(orderedPages.map((p) => p.fileId))) {
        const f = fileMap.get(fileId);
        if (f) srcDocs.set(fileId, await PDFDocument.load(f.bytes));
      }
      for (const page of orderedPages) {
        const src = srcDocs.get(page.fileId);
        if (!src) continue;
        const [copied] = await merged.copyPages(src, [page.pageIndex]);
        if (page.rotation !== 0) copied.setRotation(degrees(page.rotation));
        merged.addPage(copied);
      }
      const bytes = await merged.save();
      const blob = new Blob([bytes.buffer as ArrayBuffer], {
        type: "application/pdf",
      });
      const safeFilename = `${filename.trim() || "Zusammengefuegt"}.pdf`;

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
      toast.error("Fehler beim Zusammenfügen.");
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
              data-ocid="merge.back_button"
              onClick={onBack}
              className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-accent transition-colors -ml-1"
              aria-label="Zurück"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center">
                <Layers className="w-4 h-4 text-secondary-foreground" />
              </div>
              <h1 className="text-[17px] font-bold font-display tracking-tight">
                PDF zusammenfügen
              </h1>
            </div>
          </div>
          {selectedCount > 0 && files.length >= 1 && (
            <Button
              data-ocid="merge.export_button"
              size="sm"
              onClick={() => setShowExportDialog(true)}
              className="gap-1.5 rounded-xl font-semibold"
            >
              <Download className="w-3.5 h-3.5" />
              Zusammenfügen
            </Button>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-5">
        {files.length === 0 ? (
          <div
            data-ocid="merge.empty_state"
            className="flex flex-col items-center justify-center min-h-[calc(100vh-14rem)] text-center animate-fade-in"
          >
            <div className="w-20 h-20 rounded-3xl bg-secondary flex items-center justify-center mb-6">
              <Layers className="w-10 h-10 text-secondary-foreground" />
            </div>
            <h2 className="text-xl font-bold font-display mb-2">
              PDFs hinzufügen
            </h2>
            <p className="text-muted-foreground text-sm mb-8 max-w-xs">
              Wähle mindestens eine PDF-Datei aus, um Seiten auszuwählen und
              zusammenzufügen.
            </p>
            <Button
              data-ocid="merge.upload_button"
              size="lg"
              onClick={() => fileInputRef.current?.click()}
              className="gap-2.5 h-14 rounded-2xl text-base font-bold px-8"
            >
              <Plus className="w-5 h-5" />
              PDFs auswählen
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-muted-foreground">
                <span className="text-foreground font-bold">
                  {files.length}
                </span>{" "}
                Dateien ·{" "}
                <span className="text-primary font-bold">{selectedCount}</span>{" "}
                Seiten ausgewählt
              </p>
            </div>

            {/* Collapsible PDF files */}
            <div className="flex flex-col gap-2 mb-4">
              {files.map((file, fileIndex) => (
                <div
                  key={file.id}
                  data-ocid={`merge.item.${fileIndex + 1}`}
                  className="bg-card border border-border rounded-2xl overflow-hidden"
                >
                  {/* File header */}
                  <div className="flex items-center gap-3 px-4 py-3.5">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-primary" />
                    </div>
                    <button
                      type="button"
                      data-ocid={`merge.item.toggle.${fileIndex + 1}`}
                      onClick={() => toggleFileExpanded(file.id)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <p className="font-semibold text-sm text-foreground truncate">
                        {file.name}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {file.pages.length} Seite
                        {file.pages.length !== 1 ? "n" : ""} ·{" "}
                        {file.pages.filter((p) => p.selected).length} ausgewählt
                      </p>
                    </button>
                    <button
                      type="button"
                      data-ocid={`merge.item.toggle.${fileIndex + 1}`}
                      onClick={() => toggleFileExpanded(file.id)}
                      className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                      aria-label={file.expanded ? "Einklappen" : "Aufklappen"}
                    >
                      {file.expanded ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      data-ocid={`merge.delete_button.${fileIndex + 1}`}
                      onClick={() => removeFile(file.id)}
                      className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                      aria-label="Entfernen"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Expanded page thumbnails */}
                  {file.expanded && (
                    <div className="px-4 pb-4 border-t border-border pt-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-muted-foreground">
                          Seiten auswählen
                        </span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            data-ocid={`merge.item.select_all.${fileIndex + 1}`}
                            onClick={() => {
                              const updated = files.map((f) =>
                                f.id === file.id
                                  ? {
                                      ...f,
                                      pages: f.pages.map((p) => ({
                                        ...p,
                                        selected: true,
                                      })),
                                    }
                                  : f,
                              );
                              syncOrder(updated);
                              setFiles(updated);
                            }}
                            className="text-xs font-semibold text-primary hover:underline"
                          >
                            Alle
                          </button>
                          <span className="text-border">·</span>
                          <button
                            type="button"
                            data-ocid={`merge.item.deselect_all.${fileIndex + 1}`}
                            onClick={() => {
                              const updated = files.map((f) =>
                                f.id === file.id
                                  ? {
                                      ...f,
                                      pages: f.pages.map((p) => ({
                                        ...p,
                                        selected: false,
                                      })),
                                    }
                                  : f,
                              );
                              syncOrder(updated);
                              setFiles(updated);
                            }}
                            className="text-xs font-semibold text-muted-foreground hover:underline"
                          >
                            Keine
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {file.pages.map((page) => (
                          <button
                            key={page.id}
                            type="button"
                            data-ocid={`merge.page.toggle.${page.pageNum}`}
                            onClick={() =>
                              togglePageSelection(file.id, page.id)
                            }
                            className={`relative rounded-xl overflow-hidden border-2 transition-all ${
                              page.selected
                                ? "border-primary ring-2 ring-primary/30"
                                : "border-border"
                            }`}
                          >
                            <div className="aspect-[3/4] bg-muted">
                              <img
                                src={page.dataUrl}
                                alt={`Seite ${page.pageNum}`}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            </div>
                            <span className="absolute top-1 left-1 bg-black/50 backdrop-blur-sm text-white text-[10px] font-bold px-1 py-0.5 rounded-md">
                              {page.pageNum}
                            </span>
                            {page.selected && (
                              <div className="absolute inset-0 bg-primary/10 flex items-center justify-center">
                                <CheckCircle2 className="w-6 h-6 text-primary drop-shadow" />
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <Button
              data-ocid="merge.upload_button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isAdding}
              className="w-full gap-2 rounded-2xl h-14 border-dashed border-2 text-muted-foreground hover:text-primary hover:border-primary mb-6"
            >
              {isAdding ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Plus className="w-5 h-5" />
              )}
              <span className="font-semibold">
                {isAdding ? "Wird geladen…" : "Weitere PDFs hinzufügen"}
              </span>
            </Button>

            {/* Reihenfolge section */}
            {orderedSelection.length > 0 && (
              <div>
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
                    items={orderedSelection}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="flex flex-col gap-2">
                      {orderedPages.map((page, i) => (
                        <SortableOrderItem
                          key={page.id}
                          page={page}
                          index={i}
                          onRotateLeft={() => rotatePageInOrder(page.id, -1)}
                          onRotateRight={() => rotatePageInOrder(page.id, 1)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            )}
          </>
        )}
      </main>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        multiple
        className="hidden"
        data-ocid="merge.dropzone"
        onChange={(e) => {
          if (e.target.files?.length) addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent
          data-ocid="merge.dialog"
          className="max-w-sm rounded-3xl"
        >
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              PDFs zusammenfügen
            </DialogTitle>
          </DialogHeader>
          <div className="py-1">
            <Label
              htmlFor="merge-filename"
              className="text-sm font-semibold text-foreground mb-2 block"
            >
              Dateiname
            </Label>
            <Input
              id="merge-filename"
              data-ocid="merge.export_input"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              placeholder="Zusammengefuegt"
              className="rounded-xl h-11 text-base"
            />
            <p className="text-xs text-muted-foreground mt-2">
              {selectedCount} Seite{selectedCount !== 1 ? "n" : ""} ausgewählt
            </p>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col mt-1">
            <Button
              data-ocid="merge.primary_button"
              onClick={() => mergePdf(true, false)}
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
                data-ocid="merge.secondary_button"
                variant="outline"
                onClick={() => mergePdf(false, true)}
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
