type CompressOptions = {
  maxDimension?: number;
  quality?: number;
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
  return await createImageBitmap(file);
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
  const maxDimension = clampNumber(options?.maxDimension ?? 1600, 320, 4096);
  const quality = clampNumber(options?.quality ?? 0.82, 0.4, 0.95);

  if (!file.type.startsWith('image/')) return file;
  if (file.size < 150 * 1024) return file;

  const bitmap = await fileToImageBitmap(file);
  const srcW = bitmap.width;
  const srcH = bitmap.height;

  const scale = Math.min(1, maxDimension / Math.max(srcW, srcH));
  const targetW = Math.max(1, Math.round(srcW * scale));
  const targetH = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;

  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return file;

  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close?.();

  const outputType = getImageType(file.type);
  const blob = await canvasToBlob(canvas, outputType, quality);

  if (blob.size >= file.size) return file;

  const name = file.name.replace(/\.(png|jpg|jpeg|webp)$/i, '.webp');
  return new File([blob], name, { type: blob.type, lastModified: Date.now() });
}

