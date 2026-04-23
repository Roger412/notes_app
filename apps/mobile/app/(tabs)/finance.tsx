import { useState, useEffect } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  Modal, TextInput, StyleSheet, Pressable,
} from 'react-native'
import { supabase } from '@/lib/supabase'
import type { Transaction, ExpenseCategory } from '@/lib/types'

const CATEGORIES: ExpenseCategory[] = [
  'food', 'transport', 'entertainment', 'health',
  'housing', 'utilities', 'clothing', 'education', 'savings', 'other',
]

const defaultForm = () => ({
  amount: '',
  type: 'expense' as 'income' | 'expense',
  category: 'other' as ExpenseCategory,
  description: '',
})

export default function FinanceScreen() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [income, setIncome] = useState(0)
  const [expenses, setExpenses] = useState(0)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(defaultForm)
  const month = new Date().toISOString().slice(0, 7)

  async function fetchData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [y, m] = month.split('-').map(Number)
    const lastDay = new Date(y, m, 0).getDate()
    const { data } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', `${month}-01`)
      .lte('date', `${month}-${String(lastDay).padStart(2, '0')}`)
      .order('date', { ascending: false })

    const rows = (data || []) as Transaction[]
    setTransactions(rows)
    setIncome(rows.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0))
    setExpenses(rows.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0))
  }

  useEffect(() => { fetchData() }, [])

  async function handleAdd() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !form.amount) return
    await supabase.from('transactions').insert({
      ...form,
      amount: parseFloat(form.amount),
      date: new Date().toISOString().slice(0, 10),
      user_id: user.id,
    })
    setShowModal(false)
    setForm(defaultForm())
    fetchData()
  }

  const net = income - expenses

  return (
    <View style={s.container}>
      {/* Summary */}
      <View style={s.summaryRow}>
        <View style={[s.summaryCard, { borderColor: '#a6e3a1' }]}>
          <Text style={s.summaryLabel}>Income</Text>
          <Text style={[s.summaryAmt, { color: '#a6e3a1' }]}>${income.toFixed(2)}</Text>
        </View>
        <View style={[s.summaryCard, { borderColor: '#f38ba8' }]}>
          <Text style={s.summaryLabel}>Expenses</Text>
          <Text style={[s.summaryAmt, { color: '#f38ba8' }]}>${expenses.toFixed(2)}</Text>
        </View>
        <View style={[s.summaryCard, { borderColor: net >= 0 ? '#a6e3a1' : '#f38ba8' }]}>
          <Text style={s.summaryLabel}>Net</Text>
          <Text style={[s.summaryAmt, { color: net >= 0 ? '#a6e3a1' : '#f38ba8' }]}>${net.toFixed(2)}</Text>
        </View>
      </View>

      {/* Transaction list */}
      <ScrollView style={s.list}>
        {transactions.length === 0 && (
          <Text style={s.empty}>No transactions this month</Text>
        )}
        {transactions.map(t => (
          <View key={t.id} style={s.row}>
            <View style={s.rowLeft}>
              <Text style={s.rowDesc}>{t.description || t.category}</Text>
              <Text style={s.rowMeta}>{t.date} · {t.category}</Text>
            </View>
            <Text style={[s.rowAmt, { color: t.type === 'income' ? '#a6e3a1' : '#f38ba8' }]}>
              {t.type === 'income' ? '+' : '-'}${t.amount.toFixed(2)}
            </Text>
          </View>
        ))}
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity style={s.fab} onPress={() => setShowModal(true)}>
        <Text style={s.fabText}>+</Text>
      </TouchableOpacity>

      {/* Add modal */}
      <Modal visible={showModal} transparent animationType="slide">
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Add Transaction</Text>

            <TextInput
              style={s.input}
              value={form.amount}
              onChangeText={v => setForm({ ...form, amount: v })}
              keyboardType="numeric"
              placeholder="Amount"
              placeholderTextColor="#6c7086"
            />

            <View style={s.typeRow}>
              {(['expense', 'income'] as const).map(t => (
                <Pressable
                  key={t}
                  onPress={() => setForm({ ...form, type: t })}
                  style={[s.typeBtn, form.type === t && s.typeBtnActive]}
                >
                  <Text style={[s.typeBtnTxt, form.type === t && { color: '#fff' }]}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={s.categoryGrid}>
              {CATEGORIES.map(c => (
                <Pressable
                  key={c}
                  onPress={() => setForm({ ...form, category: c })}
                  style={[s.catBtn, form.category === c && s.catBtnActive]}
                >
                  <Text style={[s.catTxt, form.category === c && { color: '#fff' }]}>
                    {c}
                  </Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              style={s.input}
              value={form.description}
              onChangeText={v => setForm({ ...form, description: v })}
              placeholder="Description (optional)"
              placeholderTextColor="#6c7086"
            />

            <View style={s.btnRow}>
              <TouchableOpacity style={s.saveBtn} onPress={handleAdd}>
                <Text style={s.saveBtnTxt}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowModal(false)}>
                <Text style={s.cancelBtnTxt}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#181825' },
  summaryRow:   { flexDirection: 'row', padding: 16, gap: 10 },
  summaryCard:  { flex: 1, backgroundColor: '#1e1e2e', borderRadius: 12, padding: 10, borderWidth: 1 },
  summaryLabel: { fontSize: 11, color: '#6c7086', marginBottom: 4 },
  summaryAmt:   { fontSize: 15, fontWeight: 'bold' },
  list:         { flex: 1 },
  empty:        { color: '#6c7086', textAlign: 'center', marginTop: 60 },
  row:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#313244' },
  rowLeft:      { flex: 1 },
  rowDesc:      { color: '#cdd6f4', fontSize: 14 },
  rowMeta:      { color: '#6c7086', fontSize: 11, marginTop: 2 },
  rowAmt:       { fontSize: 15, fontWeight: '600' },
  fab:          { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: '#6366f1', justifyContent: 'center', alignItems: 'center' },
  fabText:      { color: '#fff', fontSize: 28, lineHeight: 32 },
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modal:        { backgroundColor: '#1e1e2e', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalTitle:   { color: '#cdd6f4', fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  input:        { backgroundColor: '#313244', borderRadius: 10, padding: 12, color: '#cdd6f4', marginBottom: 12, borderWidth: 1, borderColor: '#45475a' },
  typeRow:      { flexDirection: 'row', gap: 10, marginBottom: 12 },
  typeBtn:      { flex: 1, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#45475a', alignItems: 'center' },
  typeBtnActive:{ backgroundColor: '#6366f1', borderColor: '#6366f1' },
  typeBtnTxt:   { color: '#6c7086', textTransform: 'capitalize' },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  catBtn:       { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#45475a' },
  catBtnActive: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  catTxt:       { color: '#6c7086', fontSize: 12 },
  btnRow:       { flexDirection: 'row', gap: 10, marginTop: 4 },
  saveBtn:      { flex: 1, backgroundColor: '#6366f1', borderRadius: 10, padding: 14, alignItems: 'center' },
  saveBtnTxt:   { color: '#fff', fontWeight: '600' },
  cancelBtn:    { flex: 1, backgroundColor: '#313244', borderRadius: 10, padding: 14, alignItems: 'center' },
  cancelBtnTxt: { color: '#cdd6f4' },
})
