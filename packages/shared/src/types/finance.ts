export type TransactionType = 'income' | 'expense'

export type ExpenseCategory =
  | 'food'
  | 'transport'
  | 'entertainment'
  | 'health'
  | 'housing'
  | 'utilities'
  | 'clothing'
  | 'education'
  | 'savings'
  | 'other'

export interface Transaction {
  id: string
  user_id: string
  amount: number
  type: TransactionType
  category: ExpenseCategory
  description: string
  date: string
  created_at: string
}

export interface Budget {
  id: string
  user_id: string
  category: ExpenseCategory
  limit_amount: number
  month: string // YYYY-MM
}

export interface MonthlySummary {
  month: string
  total_income: number
  total_expenses: number
  net: number
  by_category: Record<ExpenseCategory, number>
}
