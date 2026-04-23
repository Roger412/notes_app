import { Router, Response } from 'express'
import { supabase } from '../db/supabase'
import { requireAuth, AuthRequest } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

router.get('/folders', async (req: AuthRequest, res: Response) => {
  const { data, error } = await supabase
    .from('note_folders')
    .select('*')
    .eq('user_id', req.userId)
    .order('created_at', { ascending: false })

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data)
})

router.get('/', async (req: AuthRequest, res: Response) => {
  const { folder_id } = req.query
  let query = supabase.from('notes').select('*').eq('user_id', req.userId)
  if (folder_id) query = query.eq('folder_id', folder_id)
  const { data, error } = await query.order('updated_at', { ascending: false })

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data)
})

router.get('/:id', async (req: AuthRequest, res: Response) => {
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', req.userId)
    .single()

  if (error) { res.status(404).json({ error: 'Note not found' }); return }
  res.json(data)
})

router.post('/', async (req: AuthRequest, res: Response) => {
  const { title, content, folder_id, is_protected } = req.body
  const { data, error } = await supabase
    .from('notes')
    .insert({ title, content, folder_id, is_protected, user_id: req.userId })
    .select()
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.status(201).json(data)
})

router.put('/:id', async (req: AuthRequest, res: Response) => {
  const { title, content, folder_id, is_protected } = req.body
  const { data, error } = await supabase
    .from('notes')
    .update({ title, content, folder_id, is_protected, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('user_id', req.userId)
    .select()
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data)
})

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const { error } = await supabase
    .from('notes')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.userId)

  if (error) { res.status(500).json({ error: error.message }); return }
  res.status(204).send()
})

export default router
