import { useMemo, useState } from 'react'
import { Mascot } from '../components/Mascot'
import { NewItemSheet } from '../components/NewItemSheet'
import { QuickAddSheet } from '../components/QuickAddSheet'
import { Sheet } from '../components/Sheet'
import { useItemMutations } from '../hooks/useData'
import { formatQty, isLow, isOut, onShoppingList } from '../lib/stock'
import type { Item, Purchase } from '../lib/types'

/** Empty first, then genuinely low, then things someone simply asked for. */
function urgency(item: Item): number {
  if (isOut(item)) return 0
  if (isLow(item)) return 1
  return 2
}

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
  const [asking, setAsking] = useState(false)
  const { addPurchase, setNeeded } = useItemMutations(householdId)

  const listItems = items
    .filter(onShoppingList)
    .sort((a, b) => urgency(a) - urgency(b) || a.name.localeCompare(b.name))

  return (
    <div className="mx-auto max-w-md px-4 pb-28 pt-6">
      <h1 className="mb-1 font-display text-2xl font-bold">Running low 🛒</h1>
      <p className="mb-4 text-sm text-ink-soft">Doubles as your shopping list!</p>

      <button
        type="button"
        onClick={() => setAsking(true)}
        className="mb-4 w-full rounded-2xl border-2 border-dashed border-peach bg-peach-soft/50 py-3 font-bold transition-transform active:scale-[0.97]"
      >
        🙋 Need something?
      </button>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-blob bg-white p-8 text-center shadow-puff">
          <Mascot size={80} />
          <p className="font-display text-lg font-bold">Nothing in your pantry yet 🧺</p>
          <p className="text-sm text-ink-soft">
            Add what you already have from the <strong>➕ Add</strong> tab — or tap{' '}
            <strong>🙋 Need something?</strong> above to start a shopping list.
          </p>
        </div>
      ) : listItems.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-blob bg-mint-soft p-8 text-center shadow-puff">
          <Mascot size={80} />
          <p className="font-display text-lg font-bold">Fully stocked! 🎉</p>
          <p className="text-sm text-ink-soft">Nothing is running low. Peachy is proud of you.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {listItems.map((item) => (
            <div key={item.id} className="flex items-center gap-3 rounded-blob bg-white p-3.5 shadow-puff">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-berry-soft text-2xl">
                {item.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{item.name}</p>
                <p className={`text-sm font-extrabold ${isOut(item) ? 'text-berry' : 'text-ink-soft'}`}>
                  {isOut(item)
                    ? 'All gone! 😱'
                    : isLow(item)
                      ? `${formatQty(item.current_qty, item.unit)} left`
                      : 'Someone asked for this 🙋'}
                </p>
              </div>
              {item.needed && (
                <button
                  type="button"
                  aria-label={`Remove ${item.name} from the list`}
                  onClick={() => setNeeded.mutate({ itemId: item.id, needed: false })}
                  className="shrink-0 rounded-full px-2 py-1 text-lg font-bold text-ink-soft transition-transform active:scale-90"
                >
                  ✕
                </button>
              )}
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

      <NeedSomethingSheet
        open={asking}
        items={items}
        householdId={householdId}
        onClose={() => setAsking(false)}
        onFlag={(item) => {
          setNeeded.mutate({ itemId: item.id, needed: true })
          setAsking(false)
        }}
      />

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

/**
 * "We need this" — flags something already in the pantry, or creates the item
 * at zero when it's something the household has never tracked before.
 */
function NeedSomethingSheet({
  open,
  items,
  householdId,
  onClose,
  onFlag,
}: {
  open: boolean
  items: Item[]
  householdId: string
  onClose: () => void
  onFlag: (item: Item) => void
}) {
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)

  const query = search.trim().toLowerCase()
  const results = useMemo(
    () => (query ? items.filter((i) => i.name.toLowerCase().includes(query)) : []),
    [items, query],
  )
  const exactMatch = results.some((i) => i.name.toLowerCase() === query)

  const close = () => {
    setSearch('')
    onClose()
  }

  return (
    <>
      <Sheet open={open && !creating} onClose={close} title="We need… 🙋">
        <p className="mb-3 text-sm text-ink-soft">
          Adds it to the shopping list. Your stock counts stay exactly as they are.
        </p>
        <input
          placeholder="Search… rice, shampoo, milk 🔍"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-2xl border-2 border-peach-soft bg-white px-4 py-3 font-bold outline-none focus:border-peach"
        />

        {query && (
          <div className="mt-3 flex flex-col gap-2">
            {results.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSearch('')
                  onFlag(item)
                }}
                className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left font-bold shadow-puff transition-transform active:scale-[0.97]"
              >
                <span className="text-2xl">{item.emoji}</span>
                {item.name}
                <span className="ml-auto text-sm text-ink-soft">
                  {item.needed ? 'already on the list ✓' : 'add to list ➜'}
                </span>
              </button>
            ))}
            {!exactMatch && (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-peach bg-peach-soft/50 px-4 py-3 text-left font-bold transition-transform active:scale-[0.97]"
              >
                <span className="text-2xl">✨</span>
                Add “{search.trim()}” as something we need
              </button>
            )}
          </div>
        )}
      </Sheet>

      <NewItemSheet
        open={creating}
        initialName={search.trim()}
        householdId={householdId}
        needed
        submitLabel="Add to the list 🙋"
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false)
          setSearch('')
          onClose()
        }}
      />
    </>
  )
}
