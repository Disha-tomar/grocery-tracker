import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { EmojiPicker } from '../components/EmojiPicker'
import { FillBar } from '../components/FillBar'
import { QuickAddSheet } from '../components/QuickAddSheet'
import { Sheet } from '../components/Sheet'
import { useItemMutations } from '../hooks/useData'
import { CATEGORIES, UNITS } from '../lib/categories'
import { formatLastPurchase } from '../lib/format'
import { fillPercent, formatQty, fullAmount, levelQty, type Level } from '../lib/stock'
import type { Item, Purchase } from '../lib/types'

const LEVELS: { key: Level; label: string; emoji: string }[] = [
  { key: 'full', label: 'Full', emoji: '🌕' },
  { key: 'half', label: 'Half', emoji: '🌗' },
  { key: 'low', label: 'Low', emoji: '🌘' },
  { key: 'out', label: 'Out', emoji: '🌑' },
]

export function ItemDetailScreen({
  items,
  purchasesByItem,
  householdId,
}: {
  items: Item[]
  purchasesByItem: Map<string, Purchase[]>
  householdId: string
}) {
  const { id } = useParams()
  const navigate = useNavigate()
  const item = items.find((i) => i.id === id)
  const purchases = purchasesByItem.get(id ?? '') ?? []
  const { upsertItem, deleteItem, setItemQty, addPurchase, deletePurchase } =
    useItemMutations(householdId)

  const [editOpen, setEditOpen] = useState(false)
  const [buying, setBuying] = useState(false)

  if (!item) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-ink-soft">
        Item not found — maybe it was deleted?
      </div>
    )
  }

  const full = fullAmount(purchases, item.current_qty)
  const percent = fillPercent(item.current_qty, full)

  const correctLevel = (level: Level) =>
    setItemQty.mutate({ itemId: item.id, qty: levelQty(full, level) })

  const removeItem = () => {
    if (window.confirm(`Remove ${item.name} and its history from the pantry?`)) {
      deleteItem.mutate(item.id, { onSuccess: () => navigate('/') })
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 pb-28 pt-4">
      <div className="mb-4 flex items-center justify-between">
        <button type="button" onClick={() => navigate(-1)} className="rounded-2xl bg-white px-3.5 py-2 font-bold shadow-puff active:scale-90">
          ← Back
        </button>
        <button type="button" onClick={() => setEditOpen(true)} className="rounded-2xl bg-white px-3.5 py-2 font-bold shadow-puff active:scale-90">
          ✏️ Edit
        </button>
      </div>

      <div className="rounded-blob bg-white p-6 text-center shadow-puff">
        <div className="text-6xl">{item.emoji}</div>
        <h1 className="mt-2 font-display text-2xl font-bold">{item.name}</h1>
        <p className="mt-1 text-lg font-extrabold text-ink-soft">
          {formatQty(item.current_qty, item.unit)} left
        </p>
        <div className="mt-3">
          <FillBar percent={percent} />
        </div>

        <p className="mt-5 text-xs font-bold uppercase tracking-wide text-ink-soft">
          Actually it’s…
        </p>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {LEVELS.map((level) => (
            <button
              key={level.key}
              type="button"
              onClick={() => correctLevel(level.key)}
              className="flex flex-col items-center gap-0.5 rounded-2xl bg-butter-soft py-2.5 text-sm font-bold transition-transform active:scale-90"
            >
              <span>{level.emoji}</span>
              {level.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setBuying(true)}
          className="mt-4 w-full rounded-2xl bg-peach py-3.5 font-display text-lg font-bold text-white shadow-puff transition-transform active:scale-95"
        >
          🛍️ Bought more
        </button>
      </div>

      <section className="mt-6">
        <h2 className="mb-2 font-display text-lg font-bold">Purchase history 🧾</h2>
        {purchases.length === 0 ? (
          <p className="rounded-blob bg-white p-4 text-sm text-ink-soft shadow-puff">
            No purchases logged yet.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {purchases.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-puff">
                <span className="font-bold">{formatLastPurchase(p, item.unit)}</span>
                <button
                  type="button"
                  onClick={() => deletePurchase.mutate(p.id)}
                  className="text-sm text-ink-soft active:scale-90"
                  aria-label="Undo this purchase"
                >
                  ↩️
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <button type="button" onClick={removeItem} className="mt-8 w-full py-2 text-sm font-bold text-berry">
        Remove this item
      </button>

      <QuickAddSheet
        item={buying ? item : null}
        purchases={purchases}
        onClose={() => setBuying(false)}
        saving={addPurchase.isPending}
        onSave={({ qty, price }) =>
          addPurchase.mutate(
            { item_id: item.id, qty, price },
            { onSuccess: () => setBuying(false) },
          )
        }
      />

      <EditItemSheet
        open={editOpen}
        item={item}
        onClose={() => setEditOpen(false)}
        saving={upsertItem.isPending}
        onSave={(patch) =>
          upsertItem.mutate({ ...item, ...patch }, { onSuccess: () => setEditOpen(false) })
        }
      />
    </div>
  )
}

export function EditItemSheet({
  open,
  item,
  onClose,
  onSave,
  saving,
}: {
  open: boolean
  item: Item
  onClose: () => void
  onSave: (patch: Partial<Item> & { name: string }) => void
  saving: boolean
}) {
  const [name, setName] = useState(item.name)
  const [emoji, setEmoji] = useState(item.emoji)
  const [category, setCategory] = useState(item.category)
  const [unit, setUnit] = useState(item.unit)
  const [threshold, setThreshold] = useState(String(item.low_threshold))
  const [isUsual, setIsUsual] = useState(item.is_usual)

  return (
    <Sheet open={open} onClose={onClose} title="Edit item ✏️">
      <ItemFields
        {...{ name, setName, emoji, setEmoji, category, setCategory, unit, setUnit, threshold, setThreshold, isUsual, setIsUsual }}
      />
      <button
        type="button"
        disabled={saving || !name.trim()}
        onClick={() =>
          onSave({
            name: name.trim(),
            emoji,
            category,
            unit,
            low_threshold: Number(threshold) || 0,
            is_usual: isUsual,
          })
        }
        className="mt-4 w-full rounded-2xl bg-peach py-3.5 font-display text-lg font-bold text-white shadow-puff transition-transform active:scale-95 disabled:opacity-40"
      >
        {saving ? 'Saving…' : 'Save changes 💾'}
      </button>
    </Sheet>
  )
}

export function ItemFields(props: {
  name: string
  setName: (v: string) => void
  emoji: string
  setEmoji: (v: string) => void
  category: Item['category']
  setCategory: (v: Item['category']) => void
  unit: Item['unit']
  setUnit: (v: Item['unit']) => void
  threshold: string
  setThreshold: (v: string) => void
  isUsual: boolean
  setIsUsual: (v: boolean) => void
}) {
  return (
    <div className="flex max-h-[55dvh] flex-col gap-3 overflow-y-auto">
      <input
        placeholder="Item name"
        value={props.name}
        onChange={(e) => props.setName(e.target.value)}
        className="rounded-2xl border-2 border-peach-soft bg-white px-4 py-3 font-bold outline-none focus:border-peach"
      />
      <EmojiPicker value={props.emoji} onChange={props.setEmoji} />
      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            type="button"
            onClick={() => props.setCategory(cat.key)}
            className={`rounded-full px-3 py-1.5 text-sm font-bold transition-all active:scale-90 ${
              props.category === cat.key ? `${cat.chip} ring-2 ring-ink/20` : 'bg-white'
            }`}
          >
            {cat.emoji} {cat.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {UNITS.map((u) => (
          <button
            key={u.key}
            type="button"
            onClick={() => props.setUnit(u.key)}
            className={`rounded-full px-3 py-1.5 text-sm font-bold transition-all active:scale-90 ${
              props.unit === u.key ? 'bg-mint-soft ring-2 ring-ink/20' : 'bg-white'
            }`}
          >
            {u.label}
          </button>
        ))}
      </div>
      <label className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3">
        <span className="text-sm font-bold">Warn me when below</span>
        <input
          type="number"
          inputMode="decimal"
          value={props.threshold}
          onChange={(e) => props.setThreshold(e.target.value)}
          className="w-24 rounded-xl border-2 border-peach-soft px-2 py-1.5 text-right font-bold outline-none focus:border-peach"
        />
      </label>
      <label className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3">
        <span className="text-sm font-bold">Regular buy? (shows in restock list)</span>
        <input
          type="checkbox"
          checked={props.isUsual}
          onChange={(e) => props.setIsUsual(e.target.checked)}
          className="h-5 w-5 accent-[#ffb59e]"
        />
      </label>
    </div>
  )
}
