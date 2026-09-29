export type Unit = { id: string; name: string; code: string; lead: string; progress: number; next: string; color: string }
export type Material = { id: string; title: string; type: string; unit: string; topic: string; date: string; source: string; url?: string; storage_path?: string }
export type AssignmentStatus = 'Not Started' | 'In Progress' | 'Submitted' | 'Under Review' | 'Corrections' | 'Completed'
export type Assignment = { id: string; title: string; unit: string; due: string; status: AssignmentStatus; owner: string; reviewer: string; brief: string }
export type Discussion = { id: string; title: string; day: string; time: string; leader: string; status: string; prep: string; topics: string[] }
export type Member = { name: string; initials: string; role: string; units: string; progress: number; tone: string; section?: 'A' | 'B' }
export type Todo = { id: string; title: string; completed: boolean; due?: string; assignment_id?: string; source?: 'manual' | 'assignment' }
export type MediaResource = { id: string; kind: 'movie' | 'youtube' | 'music' | 'court'; title: string; url: string; topic: string; source: string }
