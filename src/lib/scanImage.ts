const MAX_DIMENSION = 1800;
const JPEG_QUALITY = 0.82;

function imageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not read ${file.name}. Try a JPEG, PNG or WebP image.`));
    };
    image.src = url;
  });
}

export async function optimizeScanImage(file: File): Promise<File> {
  const image = await imageFromFile(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
  const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
  const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
  if (scale === 1 && file.size <= 3 * 1024 * 1024) return file;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return file;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  canvas.width = 1;
  canvas.height = 1;
  if (!blob || blob.size >= file.size) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/i, ".jpg"), { type: "image/jpeg", lastModified: file.lastModified });
}
