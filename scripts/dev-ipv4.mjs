// Dev-only workaround: this machine has no working IPv6 route, but many APIs
// (CoinGecko, DexScreener, Prisma Accelerate, ...) publish AAAA records.
// Node's global fetch (undici) races IPv6 and hangs (ETIMEDOUT) while curl
// falls back to IPv4. Pin all fetches to IPv4 so server routes + Prisma work.
import { fetch as undiciFetch, Agent, setGlobalDispatcher } from "undici";

const ipv4Agent = new Agent({ connect: { family: 4 } });
setGlobalDispatcher(ipv4Agent); // for code using the npm `undici` package

// Node's built-in global fetch uses its OWN bundled undici, so also wrap it:
globalThis.fetch = async (input, init = {}) => {
  // The AI SDK (and other libs) call fetch(new Request(...)) with a NATIVE Request.
  // undici's fetch can't consume a cross-realm Request — it stringifies it to
  // "[object Request]" and throws "Failed to parse URL from [object Request]".
  // Unwrap it into (url, init) so the request still goes out over IPv4.
  if (typeof Request !== "undefined" && input instanceof Request) {
    const req = input;
    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    // LLM/API payloads are small JSON — buffering avoids request-stream/duplex
    // complexity while preserving the body.
    const body = hasBody ? await req.arrayBuffer() : undefined;
    return undiciFetch(req.url, {
      method: req.method,
      headers: req.headers,
      redirect: req.redirect,
      signal: req.signal,
      ...(body && body.byteLength ? { body } : {}),
      ...init,
      dispatcher: ipv4Agent,
    });
  }
  return undiciFetch(input, { dispatcher: ipv4Agent, ...init });
};

console.log("[dev-ipv4] global fetch pinned to IPv4");
