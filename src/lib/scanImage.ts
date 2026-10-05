const DEFAULT_MAX_DIMENSION = 1600;
const LOW_MEMORY_MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.78;
const LOW_MEMORY_OUTPUT_BYTES = 2.5 * 1024 * 1024;
const HEADER_BYTES = 128 * 1024;

type NavigatorWithDeviceMemory = Navigator & { deviceMemory?: number };
type ImageSource = HTMLImageElement | ImageBitmap;
type ImageDimensions = { width: number; height: number };

function maxDimension() {
  const deviceMemory = (navigator as NavigatorWithDeviceMemory).deviceMemory;
  if (typeof deviceMemory === "number" && deviceMemory <= 2) {
    return LOW_MEMORY_MAX_DIMENSION;
  }
  return DEFAULT_MAX_DIMENSION;
}

function readJpegDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) break;
    const isFrameMarker = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
    if (isFrameMarker && offset + 7 < bytes.length) {
      return {
        height: (bytes[offset + 3] << 8) | bytes[offset + 4],
        width: (bytes[offset + 5] << 8) | bytes[offset + 6],
      };
    }
    offset += length;
  }
  return null;
}

function readPngDimensions(bytes: Uint8Array): ImageDimensions | null {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((value, index) => bytes[index] === value) || bytes.length < 24) return null;
  return {
    width: new DataView(bytes.buffer, bytes.byteOffset).getUint32(16),
    height: new DataView(bytes.buffer, bytes.byteOffset).getUint32(20),
  };
}

function readWebpDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 30 || String.fromCharCode(...bytes.slice(0, 4)) !== "RIFF" || String.fromCharCode(...bytes.slice(8, 12)) !== "WEBP") return null;
  const kind = String.fromCharCode(...bytes.slice(12, 16));
  if (kind === "VP8X") {
    return {
      width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
      height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16),
    };
  }
  if (kind === "VP8 " && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return {
      width: (bytes[26] | (bytes[27] << 8)) & 0x3fff,
      height: (bytes[28] | (bytes[29] << 8)) & 0x3fff,
    };
  }
  return null;
}

async function readHeaderDimensions(file: File): Promise<ImageDimensions | null> {
  const bytes = new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer());
  if (file.type === "image/jpeg") return readJpegDimensions(bytes);
  if (file.type === "image/png") return readPngDimensions(bytes);
  if (file.type === "image/webp") return readWebpDimensions(bytes);
  return null;
}

function imageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.decoding = "async";
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

async function sourceFromFile(file: File, limit: number): Promise<ImageSource> {
  const dimensions = await readHeaderDimensions(file);
  if (dimensions && typeof globalThis.createImageBitmap === "function") {
    const scale = Math.min(1, limit / Math.max(dimensions.width, dimensions.height));
    const width = Math.max(1, Math.round(dimensions.width * scale));
    const height = Math.max(1, Math.round(dimensions.height * scale));
    try {
      return await globalThis.createImageBitmap(file, {
        resizeWidth: width,
        resizeHeight: height,
        resizeQuality: "high",
        imageOrientation: "from-image",
      });
    } catch {
      // Older browsers may expose createImageBitmap without resize options.
    }
  }
  return imageFromFile(file);
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", quality);
  });
}

/**
 * Decode and immediately reduce a source photo before it reaches OCR or storage.
 * Keeping the output bounded is important on phones: a 12 MP camera image can
 * occupy tens of megabytes once decoded even when its File is only a few MB.
 */
export async function optimizeScanImage(file: File): Promise<File> {
  const limit = maxDimension();
  let image: ImageSource | null = null;
  let canvas: HTMLCanvasElement | null = null;
  try {
    image = await sourceFromFile(file, limit);
    const sourceWidth = image instanceof ImageBitmap ? image.width : image.naturalWidth || image.width;
    const sourceHeight = image instanceof ImageBitmap ? image.height : image.naturalHeight || image.height;
    if (!sourceWidth || !sourceHeight) {
      throw new Error(`Could not determine the size of ${file.name}. Try another image.`);
    }

    const scale = Math.min(1, limit / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false, willReadFrequently: false });
    if (!context) {
      throw new Error(`This browser cannot prepare ${file.name} for scanning.`);
    }
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    let blob = await canvasBlob(canvas, JPEG_QUALITY);
    if (blob && blob.size > LOW_MEMORY_OUTPUT_BYTES) {
      blob = await canvasBlob(canvas, 0.62);
    }
    if (!blob) {
      throw new Error(`Could not compress ${file.name}. Try taking the photo again.`);
    }

    return new File(
      [blob],
      file.name.replace(/\.[^.]+$/i, ".jpg"),
      { type: "image/jpeg", lastModified: file.lastModified },
    );
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Image preparation failed.";
    if (/memory|allocation|out of memory|maximum call stack/i.test(message)) {
      throw new Error(`${file.name} is too large for this phone's available memory. Use the live camera or choose one page at a time.`);
    }
    throw cause instanceof Error ? cause : new Error(message);
  } finally {
    if (canvas) {
      canvas.width = 1;
      canvas.height = 1;
    }
    if (image instanceof ImageBitmap) {
      image.close();
    } else if (image) {
      image.onload = null;
      image.onerror = null;
      image.removeAttribute("src");
    }
  }
}
