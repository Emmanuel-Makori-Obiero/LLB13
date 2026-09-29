import { createClient } from '@supabase/supabase-js'
import { assignments, discussions, materials, members, stats, units } from './seed'
import type { Assignment, Discussion, Material, Member, Unit } from './seed'

export type Group13Repository = {
  getUnits: () => Promise<Unit[]>
  getMaterials: () => Promise<Material[]>
  getAssignments: () => Promise<Assignment[]>
  getDiscussions: () => Promise<Discussion[]>
  getMembers: () => Promise<Member[]>
  getStats: () => Promise<typeof stats>
}

export const mockRepository: Group13Repository = {
  getUnits: async () => units,
  getMaterials: async () => materials,
  getAssignments: async () => assignments,
  getDiscussions: async () => discussions,
  getMembers: async () => members,
  getStats: async () => stats
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)
const supabase = isSupabaseConfigured ? createClient(supabaseUrl!, supabaseAnonKey!) : null

async function readWithFallback<T>(
  table: string,
  query: () => Promise<{ data: T[] | null; error: { message: string } | null }>,
  fallback: T[],
): Promise<T[]> {
  if (!supabase) return fallback
  const { data, error } = await query()
  if (error) {
    console.warn(`Supabase query failed for ${table}; using seeded fallback.`, error.message)
    return fallback
  }
  return data ?? fallback
}

const supabaseRepository: Group13Repository = {
  getUnits: () => readWithFallback<Unit>('units', async () => supabase!.from('units').select('id,name,code,lead,progress,next,color').order('name'), units),
  getMaterials: () => readWithFallback<Material>('materials', async () => supabase!.from('materials').select('id,title,type,unit,topic,date,source').order('date', { ascending: false }), materials),
  getAssignments: () => readWithFallback<Assignment>('assignments', async () => supabase!.from('assignments').select('id,title,unit,due,status,owner,reviewer,brief').order('due'), assignments),
  getDiscussions: () => readWithFallback<Discussion>('discussions', async () => supabase!.from('discussions').select('id,title,day,time,leader,status,prep,topics').order('day'), discussions),
  getMembers: () => readWithFallback<Member>('members', async () => supabase!.from('members').select('name,initials,role,units,progress,tone').order('name'), members),
  getStats: async () => stats,
}

// UI components depend on this interface, not on the SDK. With VITE_SUPABASE_* present,
// Supabase is the source of truth; without it, the app stays usable in demo mode.
export const repository: Group13Repository = isSupabaseConfigured ? supabaseRepository : mockRepository
