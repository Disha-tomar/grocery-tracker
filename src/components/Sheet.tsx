import { AnimatePresence, motion } from 'framer-motion'
import type { ReactNode } from 'react'

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-[2.5rem] bg-cream p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-puff-lg"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          >
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-ink/15" />
            <h2 className="mb-4 font-display text-xl font-bold">{title}</h2>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
