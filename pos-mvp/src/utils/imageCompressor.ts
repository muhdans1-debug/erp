/**
 * Ultra-fast, zero-crash image compressor for Android POS & Handheld Terminals (Feitian F100).
 * Prevents GPU memory exhaustion and SIGTRAP crash in Chrome_InProcGp.
 */

export interface CompressedImageResult {
  dataUrl: string;
  file: File;
  width: number;
  height: number;
  sizeBytes: number;
}

/**
 * Convert base64 dataUrl to File safely in memory
 */
export function dataUrlToFile(dataUrl: string, filename: string = 'barcode.jpg'): File {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
}

export async function compressImageFile(
  file: File,
  maxDimension: number = 800,
  quality: number = 0.7
): Promise<CompressedImageResult> {
  if (!file || !file.type.startsWith('image/')) {
    throw new Error('Provided file is not a valid image.');
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    // 1. Attempt native hardware-accelerated decode using createImageBitmap if supported
    if (typeof window !== 'undefined' && 'createImageBitmap' in window) {
      try {
        const bitmap = await createImageBitmap(file);
        let { width, height } = bitmap;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });

        if (ctx) {
          ctx.drawImage(bitmap, 0, 0, width, height);
          bitmap.close();

          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, 'image/jpeg', quality)
          );

          const compressedFile = new File([blob || file], file.name.replace(/\.[^/.]+$/, '') + '.jpg', {
            type: 'image/jpeg',
            lastModified: Date.now()
          });

          return {
            dataUrl,
            file: compressedFile,
            width,
            height,
            sizeBytes: blob ? blob.size : dataUrl.length
          };
        }
      } catch (bitmapErr) {
        // Fallback to standard Image element if createImageBitmap fails
      }
    }

    // 2. Standard HTMLImageElement Fallback
    return await new Promise<CompressedImageResult>((resolve, reject) => {
      const img = new Image();
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Failed to load image for compression.'));
      };

      img.onload = async () => {
        URL.revokeObjectURL(objectUrl);
        let { width, height } = img;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { alpha: false });

        if (!ctx) {
          reject(new Error('Unable to create canvas 2D context.'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);

        canvas.toBlob(
          (blob) => {
            const compressedFile = new File(
              [blob || file],
              file.name.replace(/\.[^/.]+$/, '') + '.jpg',
              { type: 'image/jpeg', lastModified: Date.now() }
            );

            resolve({
              dataUrl,
              file: compressedFile,
              width,
              height,
              sizeBytes: blob ? blob.size : dataUrl.length
            });
          },
          'image/jpeg',
          quality
        );
      };

      img.src = objectUrl;
    });
  } catch (err) {
    URL.revokeObjectURL(objectUrl);
    throw err;
  }
}

