export type Unit = { id: string; name: string; code: string; lead: string; progress: number; next: string; color: string }
export type Material = { id: string; title: string; type: string; unit: string; topic: string; date: string; source: string }
export type AssignmentStatus = 'Not Started' | 'In Progress' | 'Submitted' | 'Under Review' | 'Corrections' | 'Completed'
export type Assignment = { id: string; title: string; unit: string; due: string; status: AssignmentStatus; owner: string; reviewer: string; brief: string }
export type Discussion = { id: string; title: string; day: string; time: string; leader: string; status: string; prep: string; topics: string[] }
export type Member = { name: string; initials: string; role: string; units: string; progress: number; tone: string }

export const units: Unit[] = [
  { id: 'criminal', name: 'Criminal Law I', code: 'LAW 111', lead: 'Joan W.', progress: 72, next: 'Mens rea · Thu 7:00 PM', color: '#8F3E32' },
  { id: 'constitutional', name: 'Constitutional Law I', code: 'LAW 113', lead: 'Lesty A.', progress: 64, next: 'Separation of powers · Tue 7:00 PM', color: '#163A34' },
  { id: 'contracts', name: 'Law of Contracts I', code: 'LAW 115', lead: 'Eliud K.', progress: 48, next: 'Consideration · Fri 10:00 AM', color: '#C96E52' },
  { id: 'systems', name: 'Legal Systems & Methods', code: 'LAW 117', lead: 'Bianca N.', progress: 81, next: 'Citation clinic · Wed 6:00 PM', color: '#6E7D63' },
  { id: 'research', name: 'Legal Research & Writing', code: 'LAW 119', lead: 'Julie M.', progress: 55, next: 'Authority mapping · Mon 4:00 PM', color: '#6E6257' },
  { id: 'communication', name: 'Communication Skills for Lawyers', code: 'LAW 121', lead: 'Everyone', progress: 39, next: 'Advocacy workshop · Fri 2:00 PM', color: '#9E7C46' },
  { id: 'torts', name: 'Torts I', code: 'LAW 123', lead: 'To be assigned', progress: 28, next: 'Negligence primer · Thu 7:00 PM', color: '#536C75' }
]

export const materials: Material[] = [
  { id: 'm1', title: 'Separation of powers — lecture notes', type: 'Lecture notes', unit: 'Constitutional Law I', topic: 'State structure', date: '29 Sep 2026', source: 'Lesty A.' },
  { id: 'm2', title: 'Republic v Big M — case brief', type: 'Case brief', unit: 'Constitutional Law I', topic: 'Judicial review', date: '28 Sep 2026', source: 'Group 13' },
  { id: 'm3', title: 'Kenya Constitution, 2010 — Chapter 10', type: 'Statute', unit: 'Constitutional Law I', topic: 'Judiciary', date: '27 Sep 2026', source: 'Shared library' },
  { id: 'm4', title: 'The law of contract in Kenya (4th ed.)', type: 'Textbook', unit: 'Law of Contracts I', topic: 'Formation', date: '25 Sep 2026', source: 'Eliud K.' },
  { id: 'm5', title: 'How to read a judgment quickly', type: 'Guide', unit: 'Legal Systems & Methods', topic: 'Legal method', date: '24 Sep 2026', source: 'Bianca N.' },
  { id: 'm6', title: 'Past paper: Criminal Law I — 2024', type: 'Past paper', unit: 'Criminal Law I', topic: 'Revision', date: '22 Sep 2026', source: 'Shared library' }
]

export const assignments: Assignment[] = [
  { id: 'a1', title: 'The limits of judicial review in Kenya', unit: 'Constitutional Law I', due: '02 Oct 2026', status: 'In Progress', owner: 'You', reviewer: 'Lesty A.', brief: 'Assess how Kenyan courts balance institutional deference with constitutional supremacy. Use two authorities and one counterargument.' },
  { id: 'a2', title: 'Problem question: mens rea', unit: 'Criminal Law I', due: '05 Oct 2026', status: 'Not Started', owner: 'You', reviewer: 'Joan W.', brief: 'Apply the principles of intention, recklessness, and transferred malice to the supplied fact pattern.' },
  { id: 'a3', title: 'Case note: Carlill v Carbolic Smoke Ball', unit: 'Law of Contracts I', due: '28 Sep 2026', status: 'Under Review', owner: 'You', reviewer: 'Eliud K.', brief: 'Write a structured case note explaining offer, acceptance, and unilateral contracts.' },
  { id: 'a4', title: 'Citation clinic — authorities map', unit: 'Legal Research & Writing', due: '24 Sep 2026', status: 'Completed', owner: 'You', reviewer: 'Julie M.', brief: 'Map primary and secondary authorities for the research question.' }
]

export const discussions: Discussion[] = [
  { id: 'd1', title: 'Constitutional Law I', day: 'Tuesday, 29 September', time: '7:00–8:15 PM', leader: 'Lesty A.', status: 'Next up', prep: 'Prepare 3 questions by Monday, 8:00 PM', topics: ['Separation of powers', 'Judicial review', 'Constitutional supremacy'] },
  { id: 'd2', title: 'Criminal Law I', day: 'Thursday, 01 October', time: '7:00–8:15 PM', leader: 'Joan W.', status: 'Upcoming', prep: 'Read the mens rea primer', topics: ['Intention', 'Recklessness', 'Transferred malice'] },
  { id: 'd3', title: 'Legal Systems & Methods', day: 'Tuesday, 06 October', time: '7:00–8:15 PM', leader: 'Bianca N.', status: 'Scheduled', prep: 'Bring one difficult authority', topics: ['Precedent', 'Ratio decidendi', 'Obiter dicta'] }
]

export const members: Member[] = [
  { name: 'Lesty A.', initials: 'LA', role: 'Group Leader · Constitutional Law lead', units: 'Constitutional Law I · Research & Writing', progress: 86, tone: '#8F3E32' },
  { name: 'Joan W.', initials: 'JW', role: 'Unit Lead · Criminal Law I', units: 'Criminal Law I · Communication Skills', progress: 78, tone: '#163A34' },
  { name: 'Bianca N.', initials: 'BN', role: 'Unit Lead · Legal Systems & Methods', units: 'Legal Systems & Methods', progress: 73, tone: '#6E7D63' },
  { name: 'Eliud K.', initials: 'EK', role: 'Unit Lead · Law of Contracts I', units: 'Law of Contracts I', progress: 69, tone: '#C96E52' },
  { name: 'Julie M.', initials: 'JM', role: 'Research coordinator', units: 'Research & Writing · Torts I', progress: 61, tone: '#536C75' },
  { name: 'Mumo O.', initials: 'MO', role: 'Member', units: 'Communication Skills · Torts I', progress: 57, tone: '#9E7C46' }
]

export const stats = { streak: 6, completed: 18, total: 27, focus: 'Constitutional Law I' }
