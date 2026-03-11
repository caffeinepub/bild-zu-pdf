import type { Point } from "./imageProcessing";

/**
 * Attempt to detect the 4 corners of a document in the given canvas.
 * Returns [TL, TR, BR, BL] in normalized [0,1] coords, or null if detection fails.
 */
export function detectDocumentCorners(
  srcCanvas: HTMLCanvasElement,
): Point[] | null {
  // --- 1. Downsample to max 400px on longest side ---
  const maxDim = 400;
  const scale = Math.min(maxDim / srcCanvas.width, maxDim / srcCanvas.height);
  const sw = Math.round(srcCanvas.width * scale);
  const sh = Math.round(srcCanvas.height * scale);

  const small = document.createElement("canvas");
  small.width = sw;
  small.height = sh;
  const sCtx = small.getContext("2d")!;
  sCtx.drawImage(srcCanvas, 0, 0, sw, sh);
  const imgData = sCtx.getImageData(0, 0, sw, sh);
  const pixels = imgData.data;

  // --- 2. Grayscale float array ---
  const gray = new Float32Array(sw * sh);
  for (let i = 0; i < sw * sh; i++) {
    gray[i] =
      0.299 * pixels[i * 4] +
      0.587 * pixels[i * 4 + 1] +
      0.114 * pixels[i * 4 + 2];
  }

  // --- 3. Gaussian blur 3×3 ---
  const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1];
  const blurred = new Float32Array(sw * sh);
  for (let y = 1; y < sh - 1; y++) {
    for (let x = 1; x < sw - 1; x++) {
      let sum = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          sum +=
            kernel[(ky + 1) * 3 + (kx + 1)] * gray[(y + ky) * sw + (x + kx)];
        }
      }
      blurred[y * sw + x] = sum / 16;
    }
  }

  // --- 4. Sobel edge magnitude ---
  const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
  const mag = new Float32Array(sw * sh);
  for (let y = 1; y < sh - 1; y++) {
    for (let x = 1; x < sw - 1; x++) {
      let gx = 0;
      let gy = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const v = blurred[(y + ky) * sw + (x + kx)];
          gx += sobelX[(ky + 1) * 3 + (kx + 1)] * v;
          gy += sobelY[(ky + 1) * 3 + (kx + 1)] * v;
        }
      }
      mag[y * sw + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }

  // --- 5. Threshold = top 15% edge magnitude ---
  const sorted = Array.from(mag).sort((a, b) => b - a);
  const threshold = sorted[Math.floor(sorted.length * 0.15)];

  // --- 6. Find best edge pixel per quadrant ---
  // Quadrants: TL (x<w/2, y<h/2), TR (x>=w/2, y<h/2), BR (x>=w/2, y>=h/2), BL (x<w/2, y>=h/2)
  const outerCorners: Point[] = [
    { x: 0, y: 0 },
    { x: sw, y: 0 },
    { x: sw, y: sh },
    { x: 0, y: sh },
  ];

  const found: (Point | null)[] = [null, null, null, null];
  const bestDist = [
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  ];

  for (let y = 1; y < sh - 1; y++) {
    for (let x = 1; x < sw - 1; x++) {
      if (mag[y * sw + x] < threshold) continue;

      // Determine quadrant
      const qx = x < sw / 2 ? 0 : 1;
      const qy = y < sh / 2 ? 0 : 1;
      // TL=0, TR=1, BR=2, BL=3
      const _qi = qy * 2 + qx; // 0=TL, 1=TR, 2=BL, 3=BR  — need to reorder
      // qy=0,qx=0 -> TL=0; qy=0,qx=1 -> TR=1; qy=1,qx=1 -> BR=2; qy=1,qx=0 -> BL=3
      const quadIdx = qy === 0 ? qx : qx === 1 ? 2 : 3;

      const oc = outerCorners[quadIdx];
      const dx = x - oc.x;
      const dy = y - oc.y;
      const dist = Math.abs(dx) + Math.abs(dy); // Manhattan
      if (dist < bestDist[quadIdx]) {
        bestDist[quadIdx] = dist;
        found[quadIdx] = { x, y };
      }
    }
  }

  // --- 7. Sanity check ---
  const result: Point[] = [];
  for (let i = 0; i < 4; i++) {
    const pt = found[i];
    if (!pt) return null;

    const nx = pt.x / sw;
    const ny = pt.y / sh;

    // Must be at least 0.05 from image edge
    if (nx < 0.05 || nx > 0.95 || ny < 0.05 || ny > 0.95) return null;

    // Must be at most 0.48 from respective corner (Manhattan in normalized coords)
    const oc = outerCorners[i];
    const ocNx = oc.x / sw;
    const ocNy = oc.y / sh;
    const manDist = Math.abs(nx - ocNx) + Math.abs(ny - ocNy);
    if (manDist > 0.48) return null;

    result.push({ x: nx, y: ny });
  }

  return result;
}
