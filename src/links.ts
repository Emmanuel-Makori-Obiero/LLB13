import { supabase } from './data/repository';
import type { Material } from './data/types';
import { readerPreviewUrl, resolveMaterialLinks } from './lib/material-reader';

export function safeUrl(value?: string | null) {
  try {
    const url = new URL((value ?? '').trim());
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

export function youtubeVideoId(value: string) {
  const url = safeUrl(value);
  if (!url) return '';
  const parsed = new URL(url);
  const host = parsed.hostname.replace(/^(www|m)\./, '');
  if (host === 'youtu.be') return parsed.pathname.slice(1).split('/')[0];
  if (host === 'youtube.com' && parsed.searchParams.get('v')) return parsed.searchParams.get('v') ?? '';
  if (host === 'youtube.com' && parsed.pathname.startsWith('/shorts/')) return parsed.pathname.split('/')[2] ?? '';
  return '';
}

export function toEmbedUrl(value: string) {
  const id = youtubeVideoId(value);
  return id ? `https://www.youtube.com/embed/${id}` : safeUrl(value);
}

function linksFor(material: Material) {
  const storage = material.storage_path && supabase
    ? supabase.storage.from('materials')
    : null;
  const publicUrl = storage
    ? storage.getPublicUrl(material.storage_path!).data.publicUrl
    : '';
  const downloadableUrl = storage
    ? storage.getPublicUrl(material.storage_path!, { download: true }).data.publicUrl
    : '';
  return resolveMaterialLinks(material, publicUrl, downloadableUrl);
}

export function materialSourceUrl(material: Material) {
  return linksFor(material).sourceUrl;
}

export function readerUrl(material: Material) {
  const { sourceUrl } = linksFor(material);
  if (!sourceUrl) return '';
  return toEmbedUrl(readerPreviewUrl(material, sourceUrl));
}

export function downloadInfo(material: Material): { href: string; label: string; file: boolean } | null {
  const links = linksFor(material);
  if (!links.sourceUrl) return null;
  return { href: links.downloadUrl, label: links.label, file: links.file };
}
