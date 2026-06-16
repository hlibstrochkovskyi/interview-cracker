import { motion } from 'framer-motion'

/** A calm pulsing orb that animates while the AI interviewer is speaking. */
export function SpeakingIndicator({ active }: { active: boolean }): JSX.Element {
  return (
    <div className="relative flex h-28 w-28 items-center justify-center">
      {active && (
        <motion.span
          className="absolute inset-0 rounded-full bg-accent/20"
          initial={{ scale: 0.8, opacity: 0.6 }}
          animate={{ scale: 1.5, opacity: 0 }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
        />
      )}
      <motion.div
        className="h-20 w-20 rounded-full bg-accent/15 ring-1 ring-accent/40"
        animate={active ? { scale: [1, 1.08, 1] } : { scale: 1 }}
        transition={
          active ? { duration: 1.1, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }
        }
      />
    </div>
  )
}
