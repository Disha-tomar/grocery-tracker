import { EMOJI_CHOICES } from '../lib/categories'

export function EmojiPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (emoji: string) => void
}) {
  return (
    <div className="grid max-h-40 grid-cols-8 gap-1 overflow-y-auto rounded-2xl bg-white/70 p-2">
      {EMOJI_CHOICES.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onChange(emoji)}
          className={`aspect-square rounded-xl text-xl transition-transform active:scale-75 ${
            value === emoji ? 'bg-peach-soft ring-2 ring-peach' : 'hover:bg-butter-soft'
          }`}
        >
          {emoji}
        </button>
      ))}
    </div>
  )
}
