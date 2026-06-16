import { motion } from 'framer-motion'

/** A refined, glassy orb with a soft cool halo that breathes while the AI speaks. */
export function SpeakingIndicator({ active }: { active: boolean }): JSX.Element {
  return (
    <div className="relative flex h-36 w-36 items-center justify-center">
      {/* Ambient halo */}
      <div
        className={`glow-cool absolute inset-0 rounded-full blur-2xl transition-opacity duration-700 ${
          active ? 'opacity-100' : 'opacity-30'
        }`}
      />

      {/* Expanding ring while speaking */}
      {active && (
        <motion.span
          className="absolute h-24 w-24 rounded-full border border-text/15"
          initial={{ scale: 0.8, opacity: 0.7 }}
          animate={{ scale: 1.7, opacity: 0 }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
        />
      )}

      {/* Glass core */}
      <motion.div
        className="glass relative h-24 w-24 rounded-full"
        animate={active ? { scale: [1, 1.06, 1] } : { scale: 1 }}
        transition={
          active ? { duration: 2.4, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.4 }
        }
      >
        <div
          className={`absolute inset-3 rounded-full bg-gradient-to-b from-text/[0.18] to-text/[0.02] transition-opacity duration-500 ${
            active ? 'opacity-100' : 'opacity-50'
          }`}
        />
      </motion.div>
    </div>
  )
}
