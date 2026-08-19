import type { Level, Unit } from './stock'

export type Category = 'kitchen' | 'bathroom' | 'cleaning' | 'other'

export interface Household {
  id: string
  name: string
  invite_code: string
}

export interface Profile {
  user_id: string
  household_id: string | null
  display_name: string
}

export interface Item {
  id: string
  household_id: string
  name: string
  emoji: string
  category: Category
  unit: Unit
  current_qty: number
  low_threshold: number
  is_usual: boolean
  /** Someone asked for this, regardless of how much is left. */
  needed: boolean
  created_at: string
}

export interface Purchase {
  id: string
  item_id: string
  household_id: string
  qty: number
  price: number | null
  purchased_at: string
  added_by: string | null
}

export type { Level, Unit }
