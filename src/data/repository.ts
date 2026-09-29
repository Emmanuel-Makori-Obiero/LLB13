import { createClient } from '@supabase/supabase-js'
import type { Assignment, AssignmentStatus, Discussion, Material, Member, Unit } from './types'

export type Group13Repository = {
  getUnits: () => Promise<Unit[]>
  getMaterials: () => Promise<Material[]>
  getAssignments: () => Promise<Assignment[]>
  getDiscussions: () => Promise<Discussion[]>
  getMembers: () => Promise<Member[]>
  getStats: () => Promise<{ streak: number; completed: number; total: number; focus: string }>
  updateAssignmentStatus: (id: string, status: AssignmentStatus) => Promise<void>
  createMaterial: (material: Omit<Material, 'id'>, file?: File) => Promise<Material>
  createAssignment: (assignment: Omit<Assignment, 'id'>) => Promise<Assignment>
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)
export const supabase = isSupabaseConfigured ? createClient(supabaseUrl!, supabaseAnonKey!) : null

async function readRequired<T>(
  table: string,
  query: () => Promise<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  if (!supabase) throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local.')
  const { data, error } = await query()
  if (error) throw new Error(`Supabase query failed for ${table}: ${error.message}`)
  return data ?? []
}

const supabaseRepository: Group13Repository = {
  getUnits: () => readRequired<Unit>('units', async () => supabase!.from('units').select('id,name,code,lead,progress,next,color').order('name')),
  getMaterials: () => readRequired<Material>('materials', async () => supabase!.from('materials').select('id,title,type,unit,topic,date,source,url,storage_path').order('date', { ascending: false })),
  getAssignments: () => readRequired<Assignment>('assignments', async () => supabase!.from('assignments').select('id,title,unit,due,status,owner,reviewer,brief').order('due')),
  getDiscussions: () => readRequired<Discussion>('discussions', async () => supabase!.from('discussions').select('id,title,day,time,leader,status,prep,topics').order('day')),
  getMembers: () => readRequired<Member>('members', async () => supabase!.from('members').select('name,initials,role,units,progress,tone').order('name')),
  getStats: async () => ({ streak: 0, completed: 0, total: 0, focus: '' }),
  updateAssignmentStatus: async (id, status) => {
    if (!supabase) throw new Error('Supabase is not configured.')
    const { error } = await supabase.from('assignments').update({ status }).eq('id', id)
    if (error) throw new Error(`Could not update assignment: ${error.message}`)
  },
  createMaterial: async (material, file) => {
    if (!supabase) throw new Error('Supabase is not configured.')
    let record = { id: crypto.randomUUID(), ...material }
    if (file) {
      const path = `${record.id}/${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`
      const upload = await supabase.storage.from('materials').upload(path, file, { upsert: false })
      if (upload.error) throw new Error(`Could not upload material: ${upload.error.message}`)
      record = { ...record, url: supabase.storage.from('materials').getPublicUrl(path).data.publicUrl, storage_path: path }
    }
    const { data, error } = await supabase.from('materials').insert(record).select('id,title,type,unit,topic,date,source,url,storage_path').single()
    if (error) throw new Error(`Could not add material: ${error.message}`)
    return data as Material
  },
  createAssignment: async assignment => {
    if (!supabase) throw new Error('Supabase is not configured.')
    const record = { id: crypto.randomUUID(), ...assignment }
    const { data, error } = await supabase.from('assignments').insert(record).select('id,title,unit,due,status,owner,reviewer,brief').single()
    if (error) throw new Error(`Could not create assignment: ${error.message}`)
    return data as Assignment
  },
}

export const repository: Group13Repository = supabaseRepository
