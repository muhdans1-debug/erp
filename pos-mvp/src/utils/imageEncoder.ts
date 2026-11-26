/**
 * Zero-Lag Dual-Asset Image Encoder for Retail POS
 * Generates:
 * 1. Master High-Resolution JPEG (max 1200px width/height, 85% quality) - for Large 15" screens, Backoffice & HQ
 * 2. Micro 80x80 WebP (~2 KB, 80% quality) - for Sunmi D2 Mini 0ms Touchscreen rendering
 */

export interface DualEncodedImage {
  masterBlob: Blob;
  thumbBlob: Blob;
  masterBase64: string;
  thumbBase64: string;
  masterSizeKb: number;
  thumbSizeKb: number;
  width: number;
  height: number;
}

export async function encodeDualAssets(fileOrBlob: File | Blob): Promise<DualEncodedImage> {
  const url = URL.createObjectURL(fileOrBlob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load image for encoding'));
      img.src = url;
    });

    const origWidth = img.naturalWidth || img.width;
    const origHeight = img.naturalHeight || img.height;

    // 1. Generate Master HD JPEG (constrained to max 1200px)
    const masterCanvas = document.createElement('canvas');
    const maxDim = 1200;
    const scale = Math.min(1, maxDim / Math.max(origWidth, origHeight));
    const targetW = Math.round(origWidth * scale);
    const targetH = Math.round(origHeight * scale);

    masterCanvas.width = targetW;
    masterCanvas.height = targetH;
    const masterCtx = masterCanvas.getContext('2d');
    if (!masterCtx) throw new Error('Canvas 2D context unavailable');
    masterCtx.imageSmoothingEnabled = true;
    masterCtx.imageSmoothingQuality = 'high';
    masterCtx.drawImage(img, 0, 0, targetW, targetH);

    const masterBlob = await new Promise<Blob>((resolve, reject) => {
      masterCanvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Failed to encode master JPEG'))),
        'image/jpeg',
        0.85
      );
    });

    // 2. Generate Micro 80x80 WebP (Aspect-fill / center cropped square)
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = 80;
    thumbCanvas.height = 80;
    const thumbCtx = thumbCanvas.getContext('2d');
    if (!thumbCtx) throw new Error('Thumb Canvas 2D context unavailable');
    thumbCtx.imageSmoothingEnabled = true;
    thumbCtx.imageSmoothingQuality = 'high';

    const minSide = Math.min(origWidth, origHeight);
    const sx = Math.round((origWidth - minSide) / 2);
    const sy = Math.round((origHeight - minSide) / 2);

    thumbCtx.drawImage(img, sx, sy, minSide, minSide, 0, 0, 80, 80);

    const thumbBlob = await new Promise<Blob>((resolve, reject) => {
      thumbCanvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Failed to encode thumb WebP'))),
        'image/webp',
        0.80
      );
    });

    // Convert both to Base64
    const masterBase64 = await blobToBase64(masterBlob);
    const thumbBase64 = await blobToBase64(thumbBlob);

    return {
      masterBlob,
      thumbBlob,
      masterBase64,
      thumbBase64,
      masterSizeKb: Math.round((masterBlob.size / 1024) * 10) / 10,
      thumbSizeKb: Math.round((thumbBlob.size / 1024) * 10) / 10,
      width: origWidth,
      height: origHeight,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
