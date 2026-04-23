// Shared types inlined to avoid monorepo symlink issues in EAS builds

export type TransactionType = 'income' | 'expense'

export type ExpenseCategory =
  | 'food' | 'transport' | 'entertainment' | 'health'
  | 'housing' | 'utilities' | 'clothing' | 'education'
  | 'savings' | 'other'

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
  month: string
}

export interface MonthlySummary {
  month: string
  total_income: number
  total_expenses: number
  net: number
  by_category: Record<ExpenseCategory, number>
}

export interface Note {
  id: string
  user_id: string
  folder_id: string | null
  title: string
  content: object
  is_protected: boolean
  created_at: string
  updated_at: string
}

export type ControllerButton =
  | 'up' | 'down' | 'left' | 'right'
  | 'a' | 'b' | 'x' | 'y'
  | 'start' | 'select' | 'l1' | 'r1'

export interface ButtonPressEvent {
  button: ControllerButton
  pressed: boolean
  timestamp: number
}
