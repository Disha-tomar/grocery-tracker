import { motion } from 'framer-motion'

const fillColor = (percent: number) =>
  percent > 50 ? 'bg-mint' : percent > 25 ? 'bg-butter' : 'bg-berry'

export function FillBar({ percent }: { percent: number }) {
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-ink/8">
      <motion.div
        className={`h-full rounded-full ${fillColor(percent)}`}
        initial={false}
        animate={{ width: `${Math.max(percent, 4)}%` }}
        transition={{ type: 'spring', damping: 22, stiffness: 180 }}
        style={{ opacity: percent === 0 ? 0.25 : 1 }}
      />
    </div>
  )
}
