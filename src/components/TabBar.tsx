import { NavLink } from 'react-router-dom'

const TABS = [
  { to: '/', emoji: '🏠', label: 'Pantry' },
  { to: '/add', emoji: '➕', label: 'Add' },
  { to: '/low', emoji: '🛒', label: 'Low' },
  { to: '/settings', emoji: '⚙️', label: 'Home' },
]

export function TabBar({ lowCount }: { lowCount: number }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-ink/5 bg-cream/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
      <div className="mx-auto flex max-w-md justify-around px-2 py-2">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `relative flex min-w-16 flex-col items-center gap-0.5 rounded-2xl px-3 py-1.5 text-xs font-bold transition-all active:scale-90 ${
                isActive ? 'bg-peach-soft text-ink' : 'text-ink-soft'
              }`
            }
          >
            <span className="text-xl leading-none">{tab.emoji}</span>
            {tab.label}
            {tab.to === '/low' && lowCount > 0 && (
              <span className="absolute -top-1 right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-berry px-1 text-[10px] font-extrabold text-white">
                {lowCount}
              </span>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
