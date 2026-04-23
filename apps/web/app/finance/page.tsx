'use client'

import { useState, useEffect } from 'react'
import type { Transaction, MonthlySummary, ExpenseCategory } from '@notes-app/shared'
import { supabase } from '@/lib/supabase'

const CATEGORIES: ExpenseCategory[] = [
  'food', 'transport', 'entertainment', 'health',
  'housing', 'utilities', 'clothing', 'education', 'savings', 'other',
]

const defaultForm = () => ({
  amount: '',
  type: 'expense' as 'income' | 'expense',
  category: 'other' as ExpenseCategory,
  description: '',
  date: new Date().toISOString().slice(0, 10),
})

export default function FinancePage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [summary, setSummary] = useState<MonthlySummary | null>(null)
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(defaultForm)

  async function fetchData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [y, m] = month.split('-').map(Number)
    const lastDay = new Date(y, m, 0).getDate() // day 0 of next month = last day of this month
    const { data } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', `${month}-01`)
      .lte('date', `${month}-${String(lastDay).padStart(2, '0')}`)
      .order('date', { ascending: false })

    const rows = (data || []) as Transaction[]
    setTransactions(rows)

    const inc = rows.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const exp = rows.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    const byCategory = rows.reduce((acc: Record<string, number>, t) => {
      acc[t.category] = (acc[t.category] || 0) + t.amount
      return acc
    }, {})

    setSummary({ month, total_income: inc, total_expenses: exp, net: inc - exp, by_category: byCategory as any })
  }

  useEffect(() => { fetchData() }, [month])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('transactions').insert({
      ...form,
      amount: parseFloat(form.amount),
      user_id: user.id,
    })
    setForm(defaultForm())
    setShowForm(false)
    fetchData()
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-white">Finance</h1>
        <div className="flex items-center gap-3">
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="bg-[#1e1e2e] border border-gray-600 rounded px-3 py-2 text-white"
          />
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg transition-colors"
          >
            + Add Transaction
          </button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <SummaryCard label="Income" value={summary.total_income} color="text-green-400" />
          <SummaryCard label="Expenses" value={summary.total_expenses} color="text-red-400" />
          <SummaryCard label="Net" value={summary.net} color={summary.net >= 0 ? 'text-green-400' : 'text-red-400'} />
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-[#1e1e2e] rounded-xl p-6 mb-6 border border-gray-700">
          <h2 className="text-lg font-semibold text-white mb-4">New Transaction</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Amount">
              <input
                type="number" step="0.01" required
                value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
                className="input" placeholder="0.00"
              />
            </Field>
            <Field label="Type">
              <select
                value={form.type}
                onChange={e => setForm({ ...form, type: e.target.value as 'income' | 'expense' })}
                className="input"
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </Field>
            <Field label="Category">
              <select
                value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value as ExpenseCategory })}
                className="input"
              >
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </Field>
            <Field label="Date">
              <input
                type="date" required
                value={form.date}
                onChange={e => setForm({ ...form, date: e.target.value })}
                className="input"
              />
            </Field>
            <Field label="Description" className="col-span-2">
              <input
                type="text"
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                className="input" placeholder="What was this for?"
              />
            </Field>
          </div>
          <div className="flex gap-3 mt-4">
            <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg transition-colors">
              Save
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="bg-[#1e1e2e] rounded-xl border border-gray-700 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="text-left text-sm text-gray-400 border-b border-gray-700">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-gray-500">
                  No transactions for {month}
                </td>
              </tr>
            ) : (
              transactions.map(t => (
                <tr key={t.id} className="border-b border-gray-700/50 hover:bg-[#313244] transition-colors">
                  <td className="px-4 py-3 text-sm text-gray-400">{t.date}</td>
                  <td className="px-4 py-3">{t.description || '-'}</td>
                  <td className="px-4 py-3">
                    <span className="bg-gray-700 px-2 py-0.5 rounded text-xs capitalize">{t.category}</span>
                  </td>
                  <td className={`px-4 py-3 text-right font-mono font-semibold ${t.type === 'income' ? 'text-green-400' : 'text-red-400'}`}>
                    {t.type === 'income' ? '+' : '-'}${t.amount.toFixed(2)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-[#1e1e2e] rounded-xl p-4 border border-gray-700">
      <p className="text-sm text-gray-400">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>${value.toFixed(2)}</p>
    </div>
  )
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="text-sm text-gray-400 block mb-1">{label}</label>
      {children}
    </div>
  )
}
