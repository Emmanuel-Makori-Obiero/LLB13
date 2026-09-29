import { createClient } from '@supabase/supabase-js'
import type { Assignment, AssignmentStatus, Discussion, Material, MediaResource, Member, Todo, Unit } from './types'

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
  getTodos: () => Promise<Todo[]>
  createTodo: (todo: Omit<Todo, 'id'>) => Promise<Todo>
  toggleTodo: (id: string, completed: boolean) => Promise<void>
  getMedia: () => Promise<MediaResource[]>
  createMedia: (media: Omit<MediaResource, 'id'>) => Promise<MediaResource>
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)
export const supabase = isSupabaseConfigured ? createClient(supabaseUrl!, supabaseAnonKey!) : null

export async function uploadUserAsset(kind: 'avatar' | 'wallpaper', file: File): Promise<string> {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) throw new Error('Please sign in before uploading profile images.')
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
  const path = `${user.id}/${kind}-${Date.now()}-${safeName}`
  const upload = await supabase.storage.from('profiles').upload(path, file, { upsert: false })
  if (upload.error) throw new Error(`Could not upload ${kind}: ${upload.error.message}`)
  return supabase.storage.from('profiles').getPublicUrl(path).data.publicUrl
}

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
  getMembers: () => readRequired<Member>('members', async () => supabase!.from('members').select('name,initials,role,units,progress,tone,section').order('name')),
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
  getTodos: () => readRequired<Todo>('todos', async () => supabase!.from('todos').select('id,title,completed,due,assignment_id,source').order('created_at')),
  createTodo: async todo => {
    if (!supabase) throw new Error('Supabase is not configured.')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Please sign in before creating a to-do.')
    const record = { id: crypto.randomUUID(), user_id: user.id, ...todo }
    const { data, error } = await supabase.from('todos').insert(record).select('id,title,completed,due,assignment_id,source').single()
    if (error) throw new Error(`Could not create to-do: ${error.message}`)
    return data as Todo
  },
  toggleTodo: async (id, completed) => {
    if (!supabase) throw new Error('Supabase is not configured.')
    const { error } = await supabase.from('todos').update({ completed }).eq('id', id)
    if (error) throw new Error(`Could not update to-do: ${error.message}`)
  },
  getMedia: () => readRequired<MediaResource>('media_resources', async () => supabase!.from('media_resources').select('id,kind,title,url,topic,source').order('title')),
  createMedia: async media => {
    if (!supabase) throw new Error('Supabase is not configured.')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Please sign in before adding media.')
    const record = { id: crypto.randomUUID(), user_id: user.id, ...media }
    const { data, error } = await supabase.from('media_resources').insert(record).select('id,kind,title,url,topic,source').single()
    if (error) throw new Error(`Could not add media: ${error.message}`)
    return data as MediaResource
  },
}

export const repository: Group13Repository = supabaseRepository
