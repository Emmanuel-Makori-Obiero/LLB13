export type Unit = { id: string; name: string; code: string; lead: string; progress: number; next: string; color: string }
export type Material = { id: string; title: string; type: string; unit: string; topic: string; date: string; source: string }
export type AssignmentStatus = 'Not Started' | 'In Progress' | 'Submitted' | 'Under Review' | 'Corrections' | 'Completed'
export type Assignment = { id: string; title: string; unit: string; due: string; status: AssignmentStatus; owner: string; reviewer: string; brief: string }
export type Discussion = { id: string; title: string; day: string; time: string; leader: string; status: string; prep: string; topics: string[] }
export type Member = { name: string; initials: string; role: string; units: string; progress: number; tone: string }
