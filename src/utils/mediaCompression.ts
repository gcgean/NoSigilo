type CompressOptions = {
  maxDimension?: number;
  quality?: number;
  maxBytes?: number;
};

function clampNumber(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function getImageType(originalType: string) {
  if (originalType === 'image/png' || originalType === 'image/jpeg' || originalType === 'image/webp') {
    return 'image/webp';
  }
  return 'image/webp';
}

async function fileToImageBitmap(file: File) {
  if (typeof createImageBitmap === 'function') {
    return await createImageBitmap(file);
  }
  throw new Error('createImageBitmap is not available');
}

async function fileToHtmlImage(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Failed to load image'));
      image.src = objectUrl;
    });
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function loadImageSource(file: File): Promise<{ width: number; height: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; close?: () => void }> {
  try {
    const bitmap = await fileToImageBitmap(file);
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
      close: () => bitmap.close?.(),
    };
  } catch {
    const image = await fileToHtmlImage(file);
    return {
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
      draw: (ctx, w, h) => ctx.drawImage(image, 0, 0, w, h),
    };
  }
}

async function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to create blob'));
          return;
        }
        resolve(blob);
      },
      type,
      quality
    );
  });
}

export async function compressImageFile(file: File, options?: CompressOptions): Promise<File> {
  const maxDimension = clampNumber(options?.maxDimension ?? 1280, 320, 4096);
  const quality = clampNumber(options?.quality ?? 0.8, 0.35, 0.95);
  const maxBytes = clampNumber(options?.maxBytes ?? 900 * 1024, 120 * 1024, 10 * 1024 * 1024);

  if (!file.type.startsWith('image/')) return file;
  if (file.size < 150 * 1024) return file;

  const imageSource = await loadImageSource(file);
  const srcW = imageSource.width;
  const srcH = imageSource.height;

  const scale = Math.min(1, maxDimension / Math.max(srcW, srcH));
  const targetW = Math.max(1, Math.round(srcW * scale));
  const targetH = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;

  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return file;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetW, targetH);
  imageSource.draw(ctx, targetW, targetH);
  imageSource.close?.();

  const outputType = getImageType(file.type);
  let nextQuality = quality;
  let blob = await canvasToBlob(canvas, outputType, nextQuality);

  while (blob.size > maxBytes && nextQuality > 0.4) {
    nextQuality = clampNumber(nextQuality - 0.08, 0.35, 0.95);
    blob = await canvasToBlob(canvas, outputType, nextQuality);
  }

  if (blob.size >= file.size && file.size <= maxBytes) return file;

  const name = file.name.replace(/\.(png|jpg|jpeg|webp)$/i, '.webp');
  return new File([blob], name, { type: blob.type, lastModified: Date.now() });
}
