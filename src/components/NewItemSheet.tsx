import { useState } from 'react'
import { useItemMutations } from '../hooks/useData'
import type { Item } from '../lib/types'
import { ItemFields } from '../screens/ItemDetailScreen'
import { Sheet } from './Sheet'

/**
 * Creates a pantry item. Shared by the Add tab (which then logs a purchase)
 * and the shopping list (which creates it already flagged as needed, at zero).
 */
export function NewItemSheet({
  open,
  initialName,
  householdId,
  needed = false,
  submitLabel,
  onClose,
  onCreated,
}: {
  open: boolean
  initialName: string
  householdId: string
  needed?: boolean
  submitLabel?: string
  onClose: () => void
  onCreated: (item: Item) => void
}) {
  const { upsertItem } = useItemMutations(householdId)
  const [name, setName] = useState(initialName)
  const [emoji, setEmoji] = useState('🛒')
  const [category, setCategory] = useState<Item['category']>('kitchen')
  const [unit, setUnit] = useState<Item['unit']>('pcs')
  const [threshold, setThreshold] = useState('1')
  const [isUsual, setIsUsual] = useState(true)

  // Keep the typed search text as the default name when the sheet opens fresh.
  const [lastInitial, setLastInitial] = useState(initialName)
  if (open && initialName !== lastInitial) {
    setLastInitial(initialName)
    setName(initialName)
  }

  return (
    <Sheet open={open} onClose={onClose} title="New pantry item ✨">
      <ItemFields
        {...{ name, setName, emoji, setEmoji, category, setCategory, unit, setUnit, threshold, setThreshold, isUsual, setIsUsual }}
      />
      <button
        type="button"
        disabled={upsertItem.isPending || !name.trim()}
        onClick={() =>
          upsertItem.mutate(
            {
              name: name.trim(),
              emoji,
              category,
              unit,
              low_threshold: Number(threshold) || 0,
              is_usual: isUsual,
              needed,
            },
            { onSuccess: onCreated },
          )
        }
        className="mt-4 w-full rounded-2xl bg-mint py-3.5 font-display text-lg font-bold text-white shadow-puff transition-transform active:scale-95 disabled:opacity-40"
      >
        {upsertItem.isPending ? 'Creating…' : (submitLabel ?? 'Create & log purchase 🧺')}
      </button>
    </Sheet>
  )
}
