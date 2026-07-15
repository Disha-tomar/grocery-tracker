import { useState } from 'react'
import { Mascot } from '../components/Mascot'
import { QuickAddSheet } from '../components/QuickAddSheet'
import { useItemMutations } from '../hooks/useData'
import { formatQty, isLow, isOut } from '../lib/stock'
import type { Item, Purchase } from '../lib/types'

export function LowScreen({
  items,
  purchasesByItem,
  householdId,
}: {
  items: Item[]
  purchasesByItem: Map<string, Purchase[]>
  householdId: string
}) {
  const [buyingItem, setBuyingItem] = useState<Item | null>(null)
  const { addPurchase } = useItemMutations(householdId)

  const lowItems = items
    .filter(isLow)
    .sort((a, b) => Number(isOut(b)) - Number(isOut(a)) || a.name.localeCompare(b.name))

  return (
    <div className="mx-auto max-w-md px-4 pb-28 pt-6">
      <h1 className="mb-1 font-display text-2xl font-bold">Running low 🛒</h1>
      <p className="mb-4 text-sm text-ink-soft">Doubles as your shopping list!</p>

      {lowItems.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-blob bg-mint-soft p-8 text-center shadow-puff">
          <Mascot size={80} />
          <p className="font-display text-lg font-bold">Fully stocked! 🎉</p>
          <p className="text-sm text-ink-soft">Nothing is running low. Peachy is proud of you.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {lowItems.map((item) => (
            <div key={item.id} className="flex items-center gap-3 rounded-blob bg-white p-3.5 shadow-puff">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-berry-soft text-2xl">
                {item.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{item.name}</p>
                <p className={`text-sm font-extrabold ${isOut(item) ? 'text-berry' : 'text-ink-soft'}`}>
                  {isOut(item) ? 'All gone! 😱' : `${formatQty(item.current_qty, item.unit)} left`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBuyingItem(item)}
                className="rounded-2xl bg-peach px-4 py-2.5 font-bold text-white shadow-puff transition-transform active:scale-90"
              >
                Bought it
              </button>
            </div>
          ))}
        </div>
      )}

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
    </div>
  )
}
