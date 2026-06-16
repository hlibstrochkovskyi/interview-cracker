/** Shared ambient layer: soft cool glows + a faint film grain, behind every screen. */
export function Backdrop(): JSX.Element {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      <div className="glow-cool absolute -top-[20%] left-1/2 h-[70vh] w-[85vw] -translate-x-1/2 rounded-full blur-3xl" />
      <div className="glow-deep absolute -bottom-[25%] -right-[10%] h-[60vh] w-[55vw] rounded-full blur-3xl" />
      <div className="noise-overlay absolute inset-0 hidden opacity-[0.04] mix-blend-soft-light dark:block" />
    </div>
  )
}
