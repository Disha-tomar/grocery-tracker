import { Link } from 'react-router-dom'
import { formatLastPurchase } from '../lib/format'
import { fillPercent, formatQty, fullAmount, isLow } from '../lib/stock'
import type { Item, Purchase } from '../lib/types'
import { FillBar } from './FillBar'

export function ItemCard({ item, purchases }: { item: Item; purchases: Purchase[] }) {
  const full = fullAmount(purchases, item.current_qty)
  const percent = fillPercent(item.current_qty, full)
  const last = purchases[0]

  return (
    <Link
      to={`/item/${item.id}`}
      className="flex items-center gap-3 rounded-blob bg-white p-3.5 shadow-puff transition-transform active:scale-[0.97]"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-butter-soft text-2xl">
        {item.emoji}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate font-bold">{item.name}</span>
          <span className={`shrink-0 text-sm font-extrabold ${isLow(item) ? 'text-berry' : 'text-ink-soft'}`}>
            {formatQty(item.current_qty, item.unit)}
          </span>
        </div>
        <div className="mt-1.5">
          <FillBar percent={percent} />
        </div>
        <div className="mt-1 truncate text-xs text-ink-soft">
          {last ? `Last: ${formatLastPurchase(last, item.unit)}` : 'Never purchased yet'}
        </div>
      </div>
    </Link>
  )
}
