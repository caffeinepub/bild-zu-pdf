import { Toaster } from "@/components/ui/sonner";
import { useState } from "react";
import { CropScreen } from "./screens/CropScreen";
import { FilterScreen } from "./screens/FilterScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { OverviewScreen } from "./screens/OverviewScreen";
import { PdfMergeScreen } from "./screens/PdfMergeScreen";
import { PdfSplitScreen } from "./screens/PdfSplitScreen";

export interface PageItem {
  id: string;
  imageDataUrl: string;
  thumbnail: string;
}

export type Screen =
  | { name: "home" }
  | { name: "overview" }
  | { name: "crop"; imageDataUrl: string }
  | { name: "filter"; imageDataUrl: string }
  | { name: "pdfSplit" }
  | { name: "pdfMerge" };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const [pages, setPages] = useState<PageItem[]>([]);

  const handleImageSelected = (dataUrl: string) => {
    setScreen({ name: "crop", imageDataUrl: dataUrl });
  };

  const handleCropDone = (croppedDataUrl: string) => {
    setScreen({ name: "filter", imageDataUrl: croppedDataUrl });
  };

  const handleCropCancel = () => {
    setScreen({ name: "overview" });
  };

  const handleFilterDone = (finalDataUrl: string, thumbnail: string) => {
    const newPage: PageItem = {
      id: `page-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      imageDataUrl: finalDataUrl,
      thumbnail,
    };
    setPages((prev) => [...prev, newPage]);
    setScreen({ name: "overview" });
  };

  const handleFilterBack = (dataUrl: string) => {
    setScreen({ name: "crop", imageDataUrl: dataUrl });
  };

  return (
    <>
      {screen.name === "home" && (
        <HomeScreen
          onSelectMode={(mode) => setScreen({ name: mode } as Screen)}
        />
      )}
      {screen.name === "overview" && (
        <OverviewScreen
          pages={pages}
          setPages={setPages}
          onImageSelected={handleImageSelected}
          onBack={() => setScreen({ name: "home" })}
        />
      )}
      {screen.name === "crop" && (
        <CropScreen
          imageDataUrl={screen.imageDataUrl}
          onDone={handleCropDone}
          onCancel={handleCropCancel}
        />
      )}
      {screen.name === "filter" && (
        <FilterScreen
          imageDataUrl={screen.imageDataUrl}
          onDone={handleFilterDone}
          onBack={handleFilterBack}
        />
      )}
      {screen.name === "pdfSplit" && (
        <PdfSplitScreen onBack={() => setScreen({ name: "home" })} />
      )}
      {screen.name === "pdfMerge" && (
        <PdfMergeScreen onBack={() => setScreen({ name: "home" })} />
      )}
      <Toaster position="top-center" />
    </>
  );
}
