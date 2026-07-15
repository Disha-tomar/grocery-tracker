import { motion } from 'framer-motion'

/** Peachy, the Pantry Pal mascot — happy when the pantry is stocked. */
export function Mascot({ mood = 'happy', size = 96 }: { mood?: 'happy' | 'worried'; size?: number }) {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1, y: [0, -4, 0] }}
      transition={{ y: { repeat: Infinity, duration: 2.4, ease: 'easeInOut' } }}
    >
      <ellipse cx="50" cy="56" rx="34" ry="32" fill="#FFB59E" />
      <ellipse cx="50" cy="56" rx="34" ry="32" fill="url(#shine)" />
      <path d="M50 22 q-2 -10 -10 -12 q10 0 12 8 q2 -8 12 -8 q-8 2 -10 12z" fill="#7FD8B5" />
      <circle cx="38" cy="52" r="3.5" fill="#5C4A42" />
      <circle cx="62" cy="52" r="3.5" fill="#5C4A42" />
      <circle cx="39.2" cy="50.8" r="1.2" fill="#fff" />
      <circle cx="63.2" cy="50.8" r="1.2" fill="#fff" />
      {mood === 'happy' ? (
        <path d="M42 63 q8 7 16 0" stroke="#5C4A42" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      ) : (
        <path d="M42 66 q8 -6 16 0" stroke="#5C4A42" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      )}
      <ellipse cx="31" cy="60" rx="4.5" ry="3" fill="#E8638C" opacity="0.35" />
      <ellipse cx="69" cy="60" rx="4.5" ry="3" fill="#E8638C" opacity="0.35" />
      <defs>
        <radialGradient id="shine" cx="0.35" cy="0.3" r="0.9">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="60%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
    </motion.svg>
  )
}
