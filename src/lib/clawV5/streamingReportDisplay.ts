/** First message on a new chat: landing page stores payload, detail page runs the stream. */
export const CLAW_V5_PENDING_STREAM_KEY = "claw-v5-pending-stream";

/**
 * Claw NDJSON stream: report text arrives as `reportDelta`, then ```rexmarkets``` / ```cryptotech```
 * blocks may stream in `chunk` events, then the model streams the final answer.
 *
 * Never drop already-streamed markdown when a fence is incomplete — that caused the UI to
 * blank and “replay” when entering the synthesis phase.
 */
export function cryptotechFenceClosedAndParses(merged: string): boolean {
  const match = merged.match(/```cryptotech\s*([\s\S]*?)```/i);
  if (!match?.[1]) return false;
  try {
    JSON.parse(match[1].trim());
    return true;
  } catch {
    return false;
  }
}

export function recomputeClawStreamingAssistantText(opts: {
  reportStreamMd: string;
  /** Rex/embed markdown accumulated before the first ```cryptotech``` chunk (empty if none). */
  preCryptotechMarkdown: string;
  sawCryptotech: boolean;
  /** The ```cryptotech ... ``` block (may grow across chunks until the fence closes). */
  cryptotechBlock: string;
  /**
   * Chunk text before `sawCryptotech` (embeds + any early chunks). After `sawCryptotech` and a
   * complete fence, only the final-answer synthesis tokens.
   */
  synthTail: string;
}): string {
  const {
    reportStreamMd,
    preCryptotechMarkdown,
    sawCryptotech,
    cryptotechBlock,
    synthTail,
  } = opts;

  if (!sawCryptotech) {
    return reportStreamMd + synthTail;
  }

  // Rex / topmarkets / etc. first, then cryptotech card, then streamed answer — matches server order.
  return (
    reportStreamMd +
    preCryptotechMarkdown +
    cryptotechBlock +
    synthTail
  );
}
