import { useEffect, useState } from 'react'
import { CURRENCY } from '../lib/format'
import { defaultRestockQty } from '../lib/stock'
import type { Item, Purchase } from '../lib/types'
import { Sheet } from './Sheet'

export function QuickAddSheet({
  item,
  purchases,
  onClose,
  onSave,
  saving,
}: {
  item: Item | null
  purchases: Purchase[]
  onClose: () => void
  onSave: (input: { qty: number; price: number | null }) => void
  saving: boolean
}) {
  const [qty, setQty] = useState('')
  const [price, setPrice] = useState('')

  useEffect(() => {
    if (item) {
      setQty(String(defaultRestockQty(purchases)))
      setPrice('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id])

  const qtyNum = Number(qty)
  const valid = Number.isFinite(qtyNum) && qtyNum > 0

  return (
    <Sheet open={Boolean(item)} onClose={onClose} title={`${item?.emoji ?? ''} Bought ${item?.name ?? ''}`}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold text-ink-soft">How much? ({item?.unit})</span>
          <input
            type="number"
            inputMode="decimal"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="rounded-2xl border-2 border-peach-soft bg-white px-4 py-3 text-lg font-bold outline-none focus:border-peach"
            autoFocus
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold text-ink-soft">Price in {CURRENCY} (optional)</span>
          <input
            type="number"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="—"
            className="rounded-2xl border-2 border-peach-soft bg-white px-4 py-3 text-lg font-bold outline-none focus:border-peach"
          />
        </label>
        <button
          type="button"
          disabled={!valid || saving}
          onClick={() => onSave({ qty: qtyNum, price: price ? Number(price) : null })}
          className="rounded-2xl bg-peach py-3.5 font-display text-lg font-bold text-white shadow-puff transition-transform active:scale-95 disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Add to pantry 🧺'}
        </button>
      </div>
    </Sheet>
  )
}
