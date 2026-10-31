import type { Material } from "../data/types";

type ReaderMaterial = Pick<Material, "title" | "url" | "storage_path" | "mime_type">;

function safeHttpUrl(value?: string | null) {
  try {
    const url = new URL((value ?? "").trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function pathHint(value?: string | null) {
  if (!value) return "";
  try {
    return new URL(value).pathname.toLowerCase();
  } catch {
    return value.split(/[?#]/, 1)[0].toLowerCase();
  }
}

function hasExtension(material: ReaderMaterial, expression: RegExp) {
  return [material.storage_path, material.url, material.title].some((value) => expression.test(pathHint(value)));
}

function mimeType(material: ReaderMaterial) {
  return (material.mime_type ?? "").split(";", 1)[0].trim().toLowerCase();
}

export function isPdfMaterial(material: ReaderMaterial) {
  return mimeType(material) === "application/pdf" || hasExtension(material, /\.pdf$/i);
}

export function isDocxMaterial(material: ReaderMaterial) {
  return mimeType(material) === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || hasExtension(material, /\.docx$/i);
}

export function isOfficeMaterial(material: ReaderMaterial) {
  return isDocxMaterial(material)
    || /(?:application\/msword|wordprocessingml|presentationml|spreadsheetml|vnd\.ms-(?:word|powerpoint|excel))/i.test(mimeType(material))
    || hasExtension(material, /\.(?:doc|ppt|pptx|xls|xlsx)$/i);
}

function isFileMaterial(material: ReaderMaterial) {
  return Boolean(material.storage_path)
    || isPdfMaterial(material)
    || isOfficeMaterial(material)
    || hasExtension(material, /\.(?:zip|epub|txt|rtf)$/i)
    || /^application\//i.test(mimeType(material));
}

function withoutDownloadDirective(value: string) {
  const url = safeHttpUrl(value);
  if (!url) return "";
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("download");
    return parsed.toString();
  } catch {
    return url;
  }
}

export type ResolvedMaterialLinks = {
  sourceUrl: string;
  downloadUrl: string;
  label: "Download" | "Open link";
  file: boolean;
};

/** Prefer an inline/public storage URL for reading; keep attachment URLs only for explicit downloads. */
export function resolveMaterialLinks(
  material: ReaderMaterial,
  publicStorageUrl = "",
  downloadableStorageUrl = "",
): ResolvedMaterialLinks {
  const storedInlineUrl = safeHttpUrl(publicStorageUrl);
  const fallbackUrl = safeHttpUrl(material.url);
  const sourceUrl = material.storage_path
    ? storedInlineUrl || withoutDownloadDirective(fallbackUrl)
    : fallbackUrl;
  const file = isFileMaterial(material);
  const downloadUrl = material.storage_path
    ? safeHttpUrl(downloadableStorageUrl) || sourceUrl
    : sourceUrl;

  return { sourceUrl, downloadUrl, label: file ? "Download" : "Open link", file };
}

/** Build the source URL used by the in-app reader, never by the Download action. */
export function readerPreviewUrl(material: ReaderMaterial, sourceUrl: string) {
  const url = safeHttpUrl(sourceUrl);
  if (!url) return "";
  if (isPdfMaterial(material)) return `${url.split("#")[0]}#page=1&zoom=page-width`;
  if (isOfficeMaterial(material)) return `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(url)}`;
  return url;
}
