export type Priority = 'low' | 'medium' | 'high'

export interface Issue {
  id: number
  title: string
  priority: Priority
  done: boolean
}

export type Route = 'board' | 'new' | 'stats'
