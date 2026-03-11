import { Toaster } from "@/components/ui/sonner";
import { useState } from "react";
import { CropScreen } from "./screens/CropScreen";
import { FilterScreen } from "./screens/FilterScreen";
import { OverviewScreen } from "./screens/OverviewScreen";

export interface PageItem {
  id: string;
  imageDataUrl: string;
  thumbnail: string;
}

export type Screen =
  | { name: "overview" }
  | { name: "crop"; imageDataUrl: string }
  | { name: "filter"; imageDataUrl: string };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: "overview" });
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
      {screen.name === "overview" && (
        <OverviewScreen
          pages={pages}
          setPages={setPages}
          onImageSelected={handleImageSelected}
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
      <Toaster position="top-center" />
    </>
  );
}
