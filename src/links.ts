import { supabase } from './data/repository'
import type { Material } from './data/types'

export function safeUrl(value?: string | null) { try { const url = new URL((value ?? '').trim()); return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '' } catch { return '' } }
export function toEmbedUrl(value: string) { const url = safeUrl(value); if (!url) return ''; const parsed = new URL(url); const host = parsed.hostname.replace(/^(www|m)\./, ''); if (host === 'youtu.be') return `https://www.youtube.com/embed/${parsed.pathname.slice(1)}`; if (host === 'youtube.com' && parsed.searchParams.get('v')) return `https://www.youtube.com/embed/${parsed.searchParams.get('v')}`; return url }
export function readerUrl(material: Material) {
  const url = safeUrl(material.url)
  if (!url) return ''
  const path = new URL(url).pathname
  if (/\.(pdf|docx?|pptx?|xlsx?)(\?|$)/i.test(path) || material.storage_path) return `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(url)}`
  return toEmbedUrl(url)
}
export function downloadInfo(material: Material): { href: string; label: string; file: boolean } | null { const url = safeUrl(material.url); if (!url) return null; if (material.storage_path && supabase) return { href: supabase.storage.from('materials').getPublicUrl(material.storage_path, { download: true }).data.publicUrl, label: 'Download', file: true }; return { href: url, label: /\.(pdf|docx?|pptx?|xlsx?|zip)(\?|#|$)/i.test(url) ? 'Download' : 'Open link', file: true } }
