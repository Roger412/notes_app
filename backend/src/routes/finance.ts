import { Router, Response } from 'express'
import { supabase } from '../db/supabase'
import { requireAuth, AuthRequest } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

router.get('/transactions', async (req: AuthRequest, res: Response) => {
  const { month, category, type } = req.query
  let query = supabase
    .from('transactions')
    .select('*')
    .eq('user_id', req.userId)
    .order('date', { ascending: false })

  if (month) {
    const [y, m] = (month as string).split('-').map(Number)
    const lastDay = new Date(y, m, 0).getDate()
    query = query
      .gte('date', `${month}-01`)
      .lte('date', `${month}-${String(lastDay).padStart(2, '0')}`)
  }
  if (category) query = query.eq('category', category)
  if (type) query = query.eq('type', type)

  const { data, error } = await query
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data)
})

router.post('/transactions', async (req: AuthRequest, res: Response) => {
  const { amount, type, category, description, date } = req.body
  const { data, error } = await supabase
    .from('transactions')
    .insert({ amount, type, category, description, date, user_id: req.userId })
    .select()
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.status(201).json(data)
})

router.delete('/transactions/:id', async (req: AuthRequest, res: Response) => {
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.userId)

  if (error) { res.status(500).json({ error: error.message }); return }
  res.status(204).send()
})

router.get('/budgets', async (req: AuthRequest, res: Response) => {
  const { month } = req.query
  let query = supabase.from('budgets').select('*').eq('user_id', req.userId)
  if (month) query = query.eq('month', month)
  const { data, error } = await query
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data)
})

router.put('/budgets/:category', async (req: AuthRequest, res: Response) => {
  const { limit_amount, month } = req.body
  const { category } = req.params
  const { data, error } = await supabase
    .from('budgets')
    .upsert(
      { user_id: req.userId, category, limit_amount, month },
      { onConflict: 'user_id,category,month' }
    )
    .select()
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data)
})

router.get('/summary/:month', async (req: AuthRequest, res: Response) => {
  const { month } = req.params
  const [y, m] = month.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  const { data, error } = await supabase
    .from('transactions')
    .select('amount, type, category')
    .eq('user_id', req.userId)
    .gte('date', `${month}-01`)
    .lte('date', `${month}-${String(lastDay).padStart(2, '0')}`)

  if (error) { res.status(500).json({ error: error.message }); return }

  const summary = (data || []).reduce(
    (acc, t) => {
      if (t.type === 'income') acc.total_income += t.amount
      else acc.total_expenses += t.amount
      acc.by_category[t.category] = (acc.by_category[t.category] || 0) + t.amount
      return acc
    },
    { month, total_income: 0, total_expenses: 0, by_category: {} as Record<string, number> }
  )

  res.json({ ...summary, net: summary.total_income - summary.total_expenses })
})

export default router
