import { useMemo, useState } from 'react'
import { NewItemSheet } from '../components/NewItemSheet'
import { QuickAddSheet } from '../components/QuickAddSheet'
import { useItemMutations } from '../hooks/useData'
import type { Item, Purchase } from '../lib/types'

export function AddScreen({
  items,
  purchasesByItem,
  householdId,
}: {
  items: Item[]
  purchasesByItem: Map<string, Purchase[]>
  householdId: string
}) {
  const [search, setSearch] = useState('')
  const [buyingItem, setBuyingItem] = useState<Item | null>(null)
  const [creating, setCreating] = useState(false)
  const { addPurchase } = useItemMutations(householdId)

  const results = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    return items.filter((i) => i.name.toLowerCase().includes(q))
  }, [items, search])

  const usuals = items.filter((i) => i.is_usual)
  const exactMatch = results.some((i) => i.name.toLowerCase() === search.trim().toLowerCase())

  return (
    <div className="mx-auto max-w-md px-4 pb-28 pt-6">
      <h1 className="mb-4 font-display text-2xl font-bold">Add a purchase 🛍️</h1>

      <input
        placeholder="Search… paneer, atta, soap 🔍"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-2xl border-2 border-peach-soft bg-white px-4 py-3 font-bold shadow-puff outline-none focus:border-peach"
      />

      {search.trim() && (
        <div className="mt-3 flex flex-col gap-2">
          {results.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setBuyingItem(item)}
              className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left font-bold shadow-puff transition-transform active:scale-[0.97]"
            >
              <span className="text-2xl">{item.emoji}</span>
              {item.name}
              <span className="ml-auto text-sm text-ink-soft">tap to log ➜</span>
            </button>
          ))}
          {!exactMatch && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-peach bg-peach-soft/50 px-4 py-3 text-left font-bold transition-transform active:scale-[0.97]"
            >
              <span className="text-2xl">✨</span>
              Add “{search.trim()}” as a new item
            </button>
          )}
        </div>
      )}

      <section className="mt-8">
        <h2 className="mb-1 font-display text-lg font-bold">Restock checklist ✅</h2>
        <p className="mb-3 text-sm text-ink-soft">
          Back from the market? Tap everything you bought.
        </p>
        {usuals.length === 0 ? (
          <p className="rounded-blob bg-white p-4 text-sm text-ink-soft shadow-puff">
            Mark items as “regular buy” and they’ll line up here for one-tap restocking.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {usuals.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setBuyingItem(item)}
                className="flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 font-bold shadow-puff transition-transform active:scale-90"
              >
                <span className="text-lg">{item.emoji}</span>
                {item.name}
              </button>
            ))}
          </div>
        )}
      </section>

      <QuickAddSheet
        item={buyingItem}
        purchases={purchasesByItem.get(buyingItem?.id ?? '') ?? []}
        onClose={() => setBuyingItem(null)}
        saving={addPurchase.isPending}
        onSave={({ qty, price }) =>
          addPurchase.mutate(
            { item_id: buyingItem!.id, qty, price },
            { onSuccess: () => setBuyingItem(null) },
          )
        }
      />

      <NewItemSheet
        open={creating}
        initialName={search.trim()}
        householdId={householdId}
        onClose={() => setCreating(false)}
        onCreated={(item) => {
          setCreating(false)
          setSearch('')
          setBuyingItem(item)
        }}
      />
    </div>
  )
}
