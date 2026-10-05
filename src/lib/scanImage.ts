const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.76;
const RETURN_ORIGINAL_BELOW = 1.5 * 1024 * 1024;

type DecodedImage = {
  width: number;
  height: number;
  draw: (context: CanvasRenderingContext2D, width: number, height: number) => void;
  close: () => void;
};

async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (context, width, height) => context.drawImage(bitmap, 0, 0, width, height),
        close: () => bitmap.close(),
      };
    } catch {
      // Fall through to the Image element for browsers with partial bitmap support.
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
        draw: (context, width, height) => context.drawImage(image, 0, 0, width, height),
        close: () => {
          image.src = "";
        },
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not read ${file.name}. Try a JPEG, PNG or WebP image.`));
    };
    image.src = url;
  });
}

export async function optimizeScanImage(file: File): Promise<File> {
  const image = await decodeImage(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  if (scale === 1 && file.size <= RETURN_ORIGINAL_BELOW) {
    image.close();
    return file;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false, willReadFrequently: false });
  if (!context) {
    image.close();
    return file;
  }
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  image.draw(context, width, height);
  image.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  canvas.width = 1;
  canvas.height = 1;
  if (!blob || blob.size >= file.size) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/i, ".jpg"), { type: "image/jpeg", lastModified: file.lastModified });
}
