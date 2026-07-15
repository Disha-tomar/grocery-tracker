import type { Category, Unit } from './types'

export const CATEGORIES: {
  key: Category
  label: string
  emoji: string
  chip: string
  card: string
}[] = [
  { key: 'kitchen', label: 'Kitchen', emoji: '🍳', chip: 'bg-peach-soft', card: 'bg-peach-soft/60' },
  { key: 'bathroom', label: 'Bathroom', emoji: '🛁', chip: 'bg-lavender-soft', card: 'bg-lavender-soft/60' },
  { key: 'cleaning', label: 'Cleaning', emoji: '🧹', chip: 'bg-mint-soft', card: 'bg-mint-soft/60' },
  { key: 'other', label: 'Other', emoji: '🧸', chip: 'bg-butter-soft', card: 'bg-butter-soft/60' },
]

export const UNITS: { key: Unit; label: string }[] = [
  { key: 'g', label: 'grams' },
  { key: 'ml', label: 'ml' },
  { key: 'pcs', label: 'pieces' },
  { key: 'packet', label: 'packets' },
]

export const EMOJI_CHOICES = [
  '🧀', '🥛', '🫓', '🍚', '🌾', '🫘', '🧅','🥔', '🍅', '🫑', '🥒', '🥕',
  '🌶️', '🧄', '🫚', '🥬', '🌽', '🍋', '🍌', '🍎', '🥭', '🍇', '🥜', '🍯',
  '🧈', '🫙', '🧂', '🌿', '☕', '🍵', '🍪', '🍞', '🥚', '🛢️', '🧴', '🧼',
  '🪥', '🧻', '🧽', '🧺', '🧹', '🫧', '🪒', '💊', '🕯️', '🔋', '🛒', '📦',
]
