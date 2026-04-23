export interface NoteFolder {
  id: string
  user_id: string
  name: string
  created_at: string
}

export interface Note {
  id: string
  user_id: string
  folder_id: string | null
  title: string
  content: object // TipTap JSON content
  is_protected: boolean
  created_at: string
  updated_at: string
}
