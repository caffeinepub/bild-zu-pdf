# Bild zu PDF

## Current State
CropScreen.tsx implements manual corner dragging for perspective correction. Corners start at fixed 5%/95% positions. No automatic document detection. No visual aid when dragging corners (finger obscures the corner point).

## Requested Changes (Diff)

### Add
- **Automatic document edge detection**: On image load, run a Sobel-based edge detection on a downsampled copy of the image. Find the 4 dominant edge pixels nearest to each image corner (one per quadrant). Map them back to normalized [0,1] coordinates and use them as initial corner positions. If detection produces implausible results (e.g., too close to image border or too far from center), fall back to default 5%/95% positions.
- **Loupe/magnifier overlay**: While the user drags a corner, draw a magnified circular overlay (radius ~70px, 3× zoom) on the canvas showing the area under the finger. The loupe is positioned in the opposite quadrant from the dragged corner (e.g., dragging bottom-right → loupe appears top-left), with a crosshair at its center.
- **`detectDocumentCorners` utility**: Extracted to `src/frontend/src/utils/edgeDetection.ts` for clarity. Uses: downsample → grayscale → Gaussian blur → Sobel magnitude → per-quadrant closest edge pixel.

### Modify
- `CropScreen.tsx`: integrate detection call after image loads; pass loupe state into `draw()`.
- Hint text: update to mention automatic corner detection.

### Remove
- Nothing removed.

## Implementation Plan
1. Create `src/frontend/src/utils/edgeDetection.ts` with `detectDocumentCorners(canvas): Point[] | null`.
2. In `CropScreen.tsx`, after `loadImageToCanvas` resolves, call `detectDocumentCorners` on the source canvas. If result passes a sanity check, apply it as initial corners.
3. Add loupe rendering in the `draw` callback: when `dragging !== null`, clip a circle in the opposite quadrant and drawImage a magnified region of `sourceCanvas` into it, then draw a crosshair.
4. Validate and deploy.
