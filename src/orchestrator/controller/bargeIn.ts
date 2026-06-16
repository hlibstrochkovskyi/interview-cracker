/**
 * Barge-in truncation.
 *
 * ⚠️ The subtle bug this guards against: when the user interrupts the AI mid-sentence, we must
 * store in conversation history *only the text that actually played through the speaker* — not
 * the full text the LLM generated. If we store the full response, the model believes it said
 * things the user never heard, and coherence silently rots over a long session.
 *
 * `playedChars` is derived from frames the renderer acked as rendered (the MessagePort
 * `played-through` marker). We truncate on a word boundary so we never store half a word.
 */
export function truncateToPlayed(full: string, playedChars: number): string {
  if (playedChars >= full.length) return full.trimEnd()
  if (playedChars <= 0) return ''

  const slice = full.slice(0, playedChars)
  // If we cut mid-word and there's more text, back off to the last word boundary.
  const cutMidWord = playedChars < full.length && /\S/.test(full[playedChars] ?? '')
  if (!cutMidWord) return slice.trimEnd()

  const lastSpace = slice.lastIndexOf(' ')
  return (lastSpace > 0 ? slice.slice(0, lastSpace) : slice).trimEnd()
}
