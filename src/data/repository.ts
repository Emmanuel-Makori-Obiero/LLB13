import { createClient } from '@supabase/supabase-js'
import type { AdminAccount, Assignment, AssignmentStatus, Discussion, Lesson, Material, MediaResource, Member, Todo, Unit } from './types'

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
  isSuperAdmin: () => Promise<boolean>
  deleteMaterial: (material: Material) => Promise<void>
  createMeeting: (title: string, leader: string) => Promise<Discussion>
  deleteMeeting: (id: string) => Promise<void>
  deleteMyAccount: () => Promise<void>
  adminListAccounts: () => Promise<AdminAccount[]>
  adminRemoveAccount: (id: string) => Promise<void>
  adminUpdateMember: (name: string, changes: Partial<Pick<Member, 'role' | 'units' | 'section' | 'progress'>>) => Promise<void>
  adminCreateMember: (member: Member) => Promise<void>
  adminDeleteMember: (name: string) => Promise<void>
  adminUpdateUnitLead: (id: string, lead: string) => Promise<void>
  getTimetable: () => Promise<Lesson[]>
  createLesson: (lesson: Omit<Lesson, 'id' | 'created_by'>) => Promise<Lesson>
  deleteLesson: (id: string) => Promise<void>
  adminCreateUnit: (unit: Pick<Unit, 'name' | 'code' | 'lead'>) => Promise<Unit>
  adminDeleteUnit: (id: string) => Promise<void>
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

const MATERIAL_COLUMNS = 'id,title,type,unit,topic,date,source,url,storage_path,owner_id'
const DISCUSSION_COLUMNS = 'id,title,day,time,leader,status,prep,topics,instant,created_by'

function db() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

// Removes a person's stored files (library uploads + profile images) before their account is deleted.
async function removeUserFiles(userId: string) {
  const client = db()
  const { data: rows } = await client.from('materials').select('storage_path').eq('owner_id', userId)
  const paths = (rows ?? []).map(row => row.storage_path as string | null).filter((path): path is string => Boolean(path))
  if (paths.length) await client.storage.from('materials').remove(paths)
  const { data: images } = await client.storage.from('profiles').list(userId)
  if (images?.length) await client.storage.from('profiles').remove(images.map(image => `${userId}/${image.name}`))
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
  getTimetable: () => readRequired<Lesson>('timetable', async () => supabase!.from('timetable').select('id,unit,topic,lesson_date,start_time,end_time,representative,venue,created_by').order('lesson_date').order('start_time')),
  createLesson: async lesson => {
    if (!supabase) throw new Error('Not connected.')
    const { data, error } = await supabase.from('timetable').insert(lesson).select('id,unit,topic,lesson_date,start_time,end_time,representative,venue,created_by').single()
    if (error) throw new Error(`Could not add lesson: ${error.message}`)
    return data as Lesson
  },
  deleteLesson: async id => {
    if (!supabase) throw new Error('Not connected.')
    const { error } = await supabase.from('timetable').delete().eq('id', id)
    if (error) throw new Error(`Could not delete lesson: ${error.message}`)
  },
  adminCreateUnit: async unit => {
    if (!supabase) throw new Error('Not connected.')
    const colors = ['#2F5D50', '#C96E52', '#5B6FA6', '#B08A3E', '#7A5C8E', '#3F7F8C']
    const { count } = await supabase.from('units').select('id', { count: 'exact', head: true })
    const { data, error } = await supabase.from('units').insert({ ...unit, progress: 0, next: 'To be scheduled', color: colors[(count ?? 0) % colors.length] }).select('id,name,code,lead,progress,next,color').single()
    if (error) throw new Error(`Could not create unit: ${error.message}`)
    return data as Unit
  },
  adminDeleteUnit: async id => {
    if (!supabase) throw new Error('Not connected.')
    const { error } = await supabase.from('units').delete().eq('id', id)
    if (error) throw new Error(`Could not delete unit: ${error.message}`)
  },
  getUnits: () => readRequired<Unit>('units', async () => supabase!.from('units').select('id,name,code,lead,progress,next,color').order('name')),
  getMaterials: () => readRequired<Material>('materials', async () => supabase!.from('materials').select(MATERIAL_COLUMNS).order('date', { ascending: false })),
  getAssignments: () => readRequired<Assignment>('assignments', async () => supabase!.from('assignments').select('id,title,unit,due,status,owner,reviewer,brief').order('due')),
  getDiscussions: () => readRequired<Discussion>('discussions', async () => supabase!.from('discussions').select(DISCUSSION_COLUMNS).order('day')),
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
    if (record.url && !/^https?:\/\//i.test(record.url.trim())) throw new Error('Links must start with http:// or https://')
    if (file) {
      const path = `${record.id}/${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`
      const upload = await supabase.storage.from('materials').upload(path, file, { upsert: false })
      if (upload.error) throw new Error(`Could not upload material: ${upload.error.message}`)
      record = { ...record, url: supabase.storage.from('materials').getPublicUrl(path).data.publicUrl, storage_path: path }
    }
    const { data, error } = await supabase.from('materials').insert(record).select(MATERIAL_COLUMNS).single()
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
    if (!/^https?:\/\//i.test(record.url.trim())) throw new Error('Links must start with http:// or https://')
    const { data, error } = await supabase.from('media_resources').insert(record).select('id,kind,title,url,topic,source').single()
    if (error) throw new Error(`Could not add media: ${error.message}`)
    return data as MediaResource
  },
  isSuperAdmin: async () => {
    const { data, error } = await db().rpc('is_super_admin')
    return !error && data === true
  },
  deleteMaterial: async material => {
    const client = db()
    if (material.storage_path) {
      const removed = await client.storage.from('materials').remove([material.storage_path])
      if (removed.error) throw new Error(`Could not delete the file: ${removed.error.message}`)
    }
    const { data, error } = await client.from('materials').delete().eq('id', material.id).select('id')
    if (error) throw new Error(`Could not delete material: ${error.message}`)
    if (!data?.length) throw new Error('You can only delete materials you uploaded.')
  },
  createMeeting: async (title, leader) => {
    const now = new Date()
    const record = {
      id: crypto.randomUUID(),
      title,
      day: now.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long' }),
      time: now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      leader,
      status: 'Live now',
      prep: 'Instant room',
      topics: [] as string[],
      instant: true,
    }
    const { data, error } = await db().from('discussions').insert(record).select(DISCUSSION_COLUMNS).single()
    if (error) throw new Error(`Could not start the meeting: ${error.message}`)
    return data as Discussion
  },
  deleteMeeting: async id => {
    const { data, error } = await db().from('discussions').delete().eq('id', id).select('id')
    if (error) throw new Error(`Could not end the meeting: ${error.message}`)
    if (!data?.length) throw new Error('Only the host or the super admin can end this meeting.')
  },
  deleteMyAccount: async () => {
    const client = db()
    const { data: { user } } = await client.auth.getUser()
    if (!user) throw new Error('Please sign in again before deleting your account.')
    await removeUserFiles(user.id)
    const { error } = await client.rpc('delete_my_account')
    if (error) throw new Error(error.message)
    await client.auth.signOut()
  },
  adminListAccounts: async () => {
    const { data, error } = await db().rpc('admin_list_accounts')
    if (error) throw new Error(`Could not load accounts: ${error.message}`)
    return (data ?? []) as AdminAccount[]
  },
  adminRemoveAccount: async id => {
    await removeUserFiles(id)
    const { error } = await db().rpc('admin_remove_account', { target: id })
    if (error) throw new Error(error.message)
  },
  adminUpdateMember: async (name, changes) => {
    const { data, error } = await db().from('members').update(changes).eq('name', name).select('name')
    if (error) throw new Error(`Could not update member: ${error.message}`)
    if (!data?.length) throw new Error('Only the super admin can change the roster.')
  },
  adminCreateMember: async member => {
    const { error } = await db().from('members').insert(member)
    if (error) throw new Error(`Could not add member: ${error.message}`)
  },
  adminDeleteMember: async name => {
    const { data, error } = await db().from('members').delete().eq('name', name).select('name')
    if (error) throw new Error(`Could not remove member: ${error.message}`)
    if (!data?.length) throw new Error('Only the super admin can change the roster.')
  },
  adminUpdateUnitLead: async (id, lead) => {
    const { data, error } = await db().from('units').update({ lead }).eq('id', id).select('id')
    if (error) throw new Error(`Could not update the unit lead: ${error.message}`)
    if (!data?.length) throw new Error('Only the super admin can change unit leads.')
  },
}

export const repository: Group13Repository = supabaseRepository
