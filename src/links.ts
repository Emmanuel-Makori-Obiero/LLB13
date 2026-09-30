import { supabase } from './data/repository'
import type { Material } from './data/types'

/** Returns the URL only if it is a real http(s) link. Blocks javascript:, data:, etc. */
export function safeUrl(url?: string | null): string {
  if (!url) return ''
  try {
    const parsed = new URL(url.trim())
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : ''
  } catch {
    return ''
  }
}

const parse = (url: string) => { try { return new URL(url) } catch { return null } }

function driveFileId(url: string): string | null {
  const u = parse(url)
  if (!u || u.hostname !== 'drive.google.com') return null
  return u.pathname.match(/^\/file\/d\/([\w-]+)/)?.[1] ?? u.searchParams.get('id')
}

/** Turns YouTube watch/short links into embeddable URLs. Other URLs are returned unchanged. */
export function toEmbedUrl(raw: string): string {
  const url = safeUrl(raw)
  const u = url ? parse(url) : null
  if (!u) return ''
  const host = u.hostname.replace(/^(www|m)\./, '')
  if (host === 'youtu.be' && u.pathname.length > 1) return `https://www.youtube.com/embed/${u.pathname.slice(1)}`
  if (host === 'youtube.com') {
    const v = u.searchParams.get('v')
    if (u.pathname === '/watch' && v) return `https://www.youtube.com/embed/${v}`
    const m = u.pathname.match(/^\/(shorts|live|embed)\/([\w-]+)/)
    if (m) return `https://www.youtube.com/embed/${m[2]}`
  }
  return url
}

const OFFICE = /\.(docx?|pptx?|xlsx?)$/i

/** The URL to put inside the in-app reader iframe. */
export function readerUrl(material: Material): string {
  const url = safeUrl(material.url)
  if (!url) return ''
  const id = driveFileId(url)
  if (id) return `https://drive.google.com/file/d/${id}/preview`
  const docs = url.match(/^https:\/\/docs\.google\.com\/(document|presentation|spreadsheets)\/d\/([\w-]+)/)
  if (docs) return `https://docs.google.com/${docs[1]}/d/${docs[2]}/preview`
  const name = material.storage_path ?? parse(url)?.pathname ?? ''
  if (OFFICE.test(name)) return `https://docs.google.com/viewer?embedded=true&url=${encodeURIComponent(url)}`
  return toEmbedUrl(url)
}

/**
 * Download target for a material.
 * - Files uploaded to Supabase Storage: forced download with the original file name.
 * - Google Drive files: direct download link.
 * - Direct file links (.pdf, .docx ...): the link itself.
 * - Anything else (web pages): just opens the link, since browsers cannot download a web page as a file.
 */
export function downloadInfo(material: Material): { href: string; label: string; file: boolean } | null {
  const url = safeUrl(material.url)
  if (!url) return null
  if (material.storage_path && supabase) {
    const fileName = material.storage_path.split('/').pop() || material.title
    const href = supabase.storage.from('materials').getPublicUrl(material.storage_path, { download: fileName }).data.publicUrl
    return { href, label: 'Download', file: true }
  }
  const id = driveFileId(url)
  if (id) return { href: `https://drive.google.com/uc?export=download&id=${id}`, label: 'Download', file: true }
  if (/\.(pdf|docx?|pptx?|xlsx?|zip|epub|txt|rtf)(\?|#|$)/i.test(url)) return { href: url, label: 'Download', file: true }
  return { href: url, label: 'Open link', file: false }
}
