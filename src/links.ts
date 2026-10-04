import { supabase } from './data/repository'
import type { Material } from './data/types'

export function safeUrl(value?: string | null) { try { const url = new URL((value ?? '').trim()); return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '' } catch { return '' } }
export function youtubeVideoId(value: string) { const url = safeUrl(value); if (!url) return ''; const parsed = new URL(url); const host = parsed.hostname.replace(/^(www|m)\./, ''); if (host === 'youtu.be') return parsed.pathname.slice(1).split('/')[0]; if (host === 'youtube.com' && parsed.searchParams.get('v')) return parsed.searchParams.get('v') ?? ''; if (host === 'youtube.com' && parsed.pathname.startsWith('/shorts/')) return parsed.pathname.split('/')[2] ?? ''; return ''; }
export function toEmbedUrl(value: string) { const id = youtubeVideoId(value); return id ? `https://www.youtube.com/embed/${id}` : safeUrl(value) }
export function readerUrl(material: Material) {
  const url = safeUrl(material.url)
  if (!url) return ''
  const path = new URL(url).pathname
  if (/\.pdf(\?|$)/i.test(path)) return `${url.split('#')[0]}#page=1&zoom=page-width`
  if (/\.(docx?|pptx?|xlsx?)(\?|$)/i.test(path) || (material.storage_path && !/\.pdf(\?|$)/i.test(material.storage_path))) return `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(url)}`
  return toEmbedUrl(url)
}
export function downloadInfo(material: Material): { href: string; label: string; file: boolean } | null { const url = safeUrl(material.url); if (!url) return null; if (material.storage_path && supabase) return { href: supabase.storage.from('materials').getPublicUrl(material.storage_path, { download: true }).data.publicUrl, label: 'Download', file: true }; return { href: url, label: /\.(pdf|docx?|pptx?|xlsx?|zip)(\?|#|$)/i.test(url) ? 'Download' : 'Open link', file: true } }
