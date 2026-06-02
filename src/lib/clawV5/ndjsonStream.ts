/** Buffer UTF-8 chunks into newline-delimited JSON objects (Claw v5 message stream). */

export type NdjsonHandler = (obj: Record<string, unknown>) => void;

export function createNdjsonAccumulator(onObject: NdjsonHandler) {
  let buffer = "";
  return {
    push(utf8Chunk: string) {
      buffer += utf8Chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        try {
          onObject(JSON.parse(t) as Record<string, unknown>);
        } catch {
          /* wait for more data or skip garbage */
        }
      }
    },
    flush() {
      const t = buffer.trim();
      buffer = "";
      if (!t) return;
      try {
        onObject(JSON.parse(t) as Record<string, unknown>);
      } catch {
        /* truncated trailing line */
      }
    },
  };
}
