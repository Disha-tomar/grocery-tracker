import { ItemCard } from '../components/ItemCard'
import { Mascot } from '../components/Mascot'
import { CATEGORIES } from '../lib/categories'
import { isLow } from '../lib/stock'
import type { Item, Purchase } from '../lib/types'

export function PantryScreen({
  items,
  purchasesByItem,
  householdName,
}: {
  items: Item[]
  purchasesByItem: Map<string, Purchase[]>
  householdName: string
}) {
  const lowCount = items.filter(isLow).length

  return (
    <div className="mx-auto max-w-md px-4 pb-28 pt-6">
      <header className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-ink-soft">{householdName}</p>
          <h1 className="font-display text-2xl font-bold">Our Pantry 🧺</h1>
        </div>
        <Mascot mood={lowCount > 0 ? 'worried' : 'happy'} size={56} />
      </header>

      {items.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-blob bg-white p-8 text-center shadow-puff">
          <Mascot size={80} />
          <p className="font-bold">Your pantry is empty!</p>
          <p className="text-sm text-ink-soft">
            Head to the <strong>➕ Add</strong> tab and add your first item — maybe paneer? 🧀
          </p>
        </div>
      )}

      {CATEGORIES.map((cat) => {
        const catItems = items.filter((i) => i.category === cat.key)
        if (catItems.length === 0) return null
        return (
          <section key={cat.key} className="mb-6">
            <h2 className={`mb-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-display text-sm font-bold ${cat.chip}`}>
              {cat.emoji} {cat.label}
            </h2>
            <div className="flex flex-col gap-2.5">
              {catItems.map((item) => (
                <ItemCard key={item.id} item={item} purchases={purchasesByItem.get(item.id) ?? []} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
