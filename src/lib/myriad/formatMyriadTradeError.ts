function collectNestedErrorText(err: unknown): string {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  let cur: unknown = err;
  let depth = 0;
  while (cur != null && depth < 8 && !seen.has(cur)) {
    seen.add(cur);
    depth += 1;
    if (typeof cur === "string") {
      parts.push(cur);
      break;
    }
    if (typeof cur === "object") {
      const o = cur as Record<string, unknown>;
      if (typeof o.message === "string" && o.message) parts.push(o.message);
      if (typeof o.shortMessage === "string") parts.push(o.shortMessage);
      if (typeof o.details === "string") parts.push(o.details);
      if (Array.isArray(o.metaMessages)) {
        for (const m of o.metaMessages) {
          if (typeof m === "string") parts.push(m);
        }
      }
      cur = o.cause;
    } else {
      break;
    }
  }
  return parts.join(" | ");
}

/**
 * Maps long ethers/viem RPC errors to short copy for in-app notifications.
 */
export function formatMyriadTradeError(err: unknown): string {
  const nested = collectNestedErrorText(err);
  const raw =
    nested ||
    (err instanceof Error ? err.message : String(err ?? ""));
  const oneLine = raw.replace(/\s+/g, " ").trim();
  const low = oneLine.toLowerCase();

  if (low.includes("insufficient allowance") || low.includes("erc20: insufficient allowance")) {
    return "Not enough allowance: approve the Myriad prediction market contract to spend your collateral (stablecoin) on BNB Smart Chain, then try again.";
  }

  if (
    low.includes("insufficient funds") ||
    low.includes("insufficient funds for gas") ||
    low.includes("gas required exceeds")
  ) {
    return "Not enough BNB on BNB Smart Chain to pay gas. Add a small amount of BNB and try again.";
  }

  if (
    low.includes("insufficient balance") ||
    low.includes("exceeds balance") ||
    low.includes("transfer amount exceeds") ||
    low.includes("erc20: transfer amount exceeds balance") ||
    (low.includes("erc1155") &&
      (low.includes("insufficient") || low.includes("balance") || low.includes("transfer")))
  ) {
    return "Insufficient balance for this trade. Add funds or use a smaller amount.";
  }

  if (
    low.includes("user rejected") ||
    low.includes("user denied") ||
    low.includes("rejected the request") ||
    low.includes("denied transaction")
  ) {
    return "You cancelled the request in your wallet.";
  }

  const reverted = oneLine.match(
    /execution reverted(?: with reason)?:\s*([^.\n]{1,160}?)(?:\.|\s+Details:|\s+Estimate|\s+Version:|$)/i
  );
  if (reverted?.[1]) {
    const inner = reverted[1].trim();
    const il = inner.toLowerCase();
    if (il.includes("allowance")) {
      return "Not enough allowance: approve the Myriad prediction market contract to spend your collateral on BNB Smart Chain, then try again.";
    }
    if (il.includes("balance") || il.includes("exceed")) {
      return "Insufficient balance for this trade.";
    }
    if (inner.length <= 90 && !/^0x[0-9a-f]+$/i.test(inner)) {
      return inner;
    }
  }

  if (
    low.includes("unpredictable_gas_limit") ||
    low.includes("cannot estimate gas") ||
    low.includes("estimate gas") ||
    low.includes("estimategas")
  ) {
    return "The trade could not be simulated. Buys: approve collateral (ERC20) for the Prediction Market. Sells: approve outcome shares (ERC1155 setApprovalForAll on Conditional Tokens for the same contract). Try a slightly smaller size if balance is tight.";
  }

  if (oneLine.length > 240) {
    const tail = oneLine.slice(-220);
    const short =
      tail.length < oneLine.length ? `…${tail}` : oneLine.slice(0, 220);
    return `${short} (See console / wallet for full detail.)`;
  }

  return oneLine;
}
