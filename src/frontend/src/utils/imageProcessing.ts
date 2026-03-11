// Perspective transform using homography

export interface Point {
  x: number;
  y: number;
}

// Solve 8x8 linear system for homography matrix using Gaussian elimination
function solve8x8(A: number[][], b: number[]): number[] {
  const n = 8;
  const mat = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(mat[row][col]) > Math.abs(mat[maxRow][col])) maxRow = row;
    }
    [mat[col], mat[maxRow]] = [mat[maxRow], mat[col]];
    const pivot = mat[col][col];
    if (Math.abs(pivot) < 1e-10) continue;
    for (let row = col + 1; row < n; row++) {
      const factor = mat[row][col] / pivot;
      for (let j = col; j <= n; j++) {
        mat[row][j] -= factor * mat[col][j];
      }
    }
  }

  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = mat[i][n];
    for (let j = i + 1; j < n; j++) {
      x[i] -= mat[i][j] * x[j];
    }
    x[i] /= mat[i][i];
  }
  return x;
}

export function computeHomography(src: Point[], dst: Point[]): number[] {
  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const { x: sx, y: sy } = src[i];
    const { x: dx, y: dy } = dst[i];
    A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy]);
    b.push(dx);
    A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy]);
    b.push(dy);
  }

  const h = solve8x8(A, b);
  return [...h, 1];
}

export function applyPerspectiveTransform(
  sourceCanvas: HTMLCanvasElement,
  corners: Point[],
  outputWidth: number,
  outputHeight: number,
): HTMLCanvasElement {
  const dst = [
    { x: 0, y: 0 },
    { x: outputWidth, y: 0 },
    { x: outputWidth, y: outputHeight },
    { x: 0, y: outputHeight },
  ];

  const H = computeHomography(dst, corners);

  const outCanvas = document.createElement("canvas");
  outCanvas.width = outputWidth;
  outCanvas.height = outputHeight;
  const ctx = outCanvas.getContext("2d")!;

  const srcCtx = sourceCanvas.getContext("2d")!;
  const srcData = srcCtx.getImageData(
    0,
    0,
    sourceCanvas.width,
    sourceCanvas.height,
  );
  const outData = ctx.createImageData(outputWidth, outputHeight);

  const sw = sourceCanvas.width;
  const sh = sourceCanvas.height;

  for (let y = 0; y < outputHeight; y++) {
    for (let x = 0; x < outputWidth; x++) {
      const w = H[6] * x + H[7] * y + H[8];
      const sx = (H[0] * x + H[1] * y + H[2]) / w;
      const sy = (H[3] * x + H[4] * y + H[5]) / w;

      // Bilinear interpolation for smoother output
      const ix = Math.floor(sx);
      const iy = Math.floor(sy);
      const fx = sx - ix;
      const fy = sy - iy;

      if (ix >= 0 && ix < sw - 1 && iy >= 0 && iy < sh - 1) {
        const di = (y * outputWidth + x) * 4;
        for (let c = 0; c < 3; c++) {
          const tl = srcData.data[(iy * sw + ix) * 4 + c];
          const tr = srcData.data[(iy * sw + ix + 1) * 4 + c];
          const bl = srcData.data[((iy + 1) * sw + ix) * 4 + c];
          const br = srcData.data[((iy + 1) * sw + ix + 1) * 4 + c];
          outData.data[di + c] = Math.round(
            tl * (1 - fx) * (1 - fy) +
              tr * fx * (1 - fy) +
              bl * (1 - fx) * fy +
              br * fx * fy,
          );
        }
        outData.data[di + 3] = 255;
      } else if (ix >= 0 && ix < sw && iy >= 0 && iy < sh) {
        const si = (iy * sw + ix) * 4;
        const di = (y * outputWidth + x) * 4;
        outData.data[di] = srcData.data[si];
        outData.data[di + 1] = srcData.data[si + 1];
        outData.data[di + 2] = srcData.data[si + 2];
        outData.data[di + 3] = 255;
      }
    }
  }

  ctx.putImageData(outData, 0, 0);
  return outCanvas;
}

export type FilterType = "farbe" | "graustufen" | "sw" | "text";

export function applyFilter(
  sourceCanvas: HTMLCanvasElement,
  filter: FilterType,
): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = sourceCanvas.width;
  out.height = sourceCanvas.height;
  const ctx = out.getContext("2d")!;
  ctx.drawImage(sourceCanvas, 0, 0);

  const imageData = ctx.getImageData(0, 0, out.width, out.height);
  const data = imageData.data;
  const len = data.length;

  if (filter === "farbe") {
    // Auto brightness/contrast + mild sharpening
    let min = 255;
    let max = 0;
    for (let i = 0; i < len; i += 4) {
      const v = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const range = max - min || 1;
    const factor = 255 / range;
    for (let i = 0; i < len; i += 4) {
      data[i] = Math.min(255, Math.max(0, (data[i] - min) * factor));
      data[i + 1] = Math.min(255, Math.max(0, (data[i + 1] - min) * factor));
      data[i + 2] = Math.min(255, Math.max(0, (data[i + 2] - min) * factor));
    }
    ctx.putImageData(imageData, 0, 0);
    sharpen(ctx, out.width, out.height, 0.3);
  } else if (filter === "graustufen") {
    // Grayscale + auto levels + sharpening
    for (let i = 0; i < len; i += 4) {
      const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      data[i] = data[i + 1] = data[i + 2] = g;
    }
    // Auto-levels
    let minG = 255;
    let maxG = 0;
    for (let i = 0; i < len; i += 4) {
      if (data[i] < minG) minG = data[i];
      if (data[i] > maxG) maxG = data[i];
    }
    const rangeG = maxG - minG || 1;
    for (let i = 0; i < len; i += 4) {
      const v = Math.min(255, Math.max(0, ((data[i] - minG) * 255) / rangeG));
      data[i] = data[i + 1] = data[i + 2] = v;
    }
    ctx.putImageData(imageData, 0, 0);
    sharpen(ctx, out.width, out.height, 0.5);
  } else if (filter === "sw") {
    // Grayscale + Otsu threshold
    const gray = new Uint8Array(len / 4);
    for (let i = 0; i < len; i += 4) {
      gray[i / 4] = Math.round(
        0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2],
      );
    }
    const threshold = otsuThreshold(gray);
    for (let i = 0; i < len; i += 4) {
      const v = gray[i / 4] > threshold ? 255 : 0;
      data[i] = data[i + 1] = data[i + 2] = v;
    }
    ctx.putImageData(imageData, 0, 0);
  } else if (filter === "text") {
    // High contrast grayscale + aggressive sharpening + threshold tuning
    for (let i = 0; i < len; i += 4) {
      const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      data[i] = data[i + 1] = data[i + 2] = g;
    }
    ctx.putImageData(imageData, 0, 0);
    sharpen(ctx, out.width, out.height, 1.0);
    // High contrast S-curve
    const enhanced = ctx.getImageData(0, 0, out.width, out.height);
    const ed = enhanced.data;
    for (let i = 0; i < ed.length; i += 4) {
      const v = ed[i];
      // S-curve: dark areas darker, light areas lighter
      const norm = v / 255;
      const curved =
        norm < 0.5 ? 2 * norm * norm : 1 - (-2 * norm + 2) ** 2 / 2;
      const out2 = Math.min(255, Math.max(0, curved * 255));
      ed[i] = ed[i + 1] = ed[i + 2] = out2;
    }
    ctx.putImageData(enhanced, 0, 0);
  }

  return out;
}

function sharpen(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  amount: number,
) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const copy = new Uint8ClampedArray(data);

  // Unsharp mask with 3x3 Laplacian
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const center = copy[idx + c];
        const neighbors =
          copy[((y - 1) * width + x) * 4 + c] +
          copy[((y + 1) * width + x) * 4 + c] +
          copy[(y * width + x - 1) * 4 + c] +
          copy[(y * width + x + 1) * 4 + c];
        const laplacian = center * 4 - neighbors;
        data[idx + c] = Math.min(255, Math.max(0, center + amount * laplacian));
      }
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

function otsuThreshold(gray: Uint8Array): number {
  const hist = new Array(256).fill(0);
  for (const v of gray) hist[v]++;
  const total = gray.length;

  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];

  let sumB = 0;
  let wB = 0;
  let wF = 0;
  let maxVar = 0;
  let threshold = 128;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const variance = wB * wF * (mB - mF) * (mB - mF);
    if (variance > maxVar) {
      maxVar = variance;
      threshold = t;
    }
  }
  return threshold;
}

/**
 * Encode canvas as high-quality JPEG data URL.
 * quality: 0–1, default 0.95 for near-lossless output.
 */
export function canvasToDataUrl(
  canvas: HTMLCanvasElement,
  quality = 0.95,
): string {
  return canvas.toDataURL("image/jpeg", quality);
}

/**
 * Create a downscaled canvas for preview/thumbnail purposes.
 * Does NOT encode to a data URL — returns a canvas element.
 */
export function scaleCanvas(
  canvas: HTMLCanvasElement,
  maxSize: number,
): HTMLCanvasElement {
  const ratio = Math.min(maxSize / canvas.width, maxSize / canvas.height);
  if (ratio >= 1) return canvas; // already small enough
  const thumb = document.createElement("canvas");
  thumb.width = Math.round(canvas.width * ratio);
  thumb.height = Math.round(canvas.height * ratio);
  const ctx = thumb.getContext("2d")!;
  ctx.drawImage(canvas, 0, 0, thumb.width, thumb.height);
  return thumb;
}

export function createThumbnail(
  canvas: HTMLCanvasElement,
  maxSize = 200,
): string {
  return scaleCanvas(canvas, maxSize).toDataURL("image/jpeg", 0.75);
}

export function loadImageToCanvas(src: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      resolve(canvas);
    };
    img.onerror = reject;
    img.src = src;
  });
}
