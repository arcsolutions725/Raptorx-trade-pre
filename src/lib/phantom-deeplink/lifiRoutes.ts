/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Surgery on the Li.Fi widget's persisted route store.
 *
 * WHY THIS EXISTS — the whole deeplink flow hinges on it.
 *
 * Li.Fi's Solana executor signs via `walletAdapter.signAllTransactions()` and
 * broadcasts the bytes itself. It only writes a `txHash` into the step's process
 * once the transaction is *confirmed* (`SolanaStepExecutor.ts`). A Phantom
 * deeplink unloads the page mid-signing, so that promise never resolves and the
 * process is left at ACTION_REQUIRED with no txHash.
 *
 * On the way back, the widget auto-resumes any active route (`useRouteExecution.ts`),
 * and `prepareRestart()` wipes every process that has no txHash and clears
 * `step.transactionRequest` — so Li.Fi would re-quote, get a FRESH BLOCKHASH,
 * and ask us to sign a SECOND, different swap. That is a double-swap.
 *
 * The executor's only short-circuit is `if (process.status !== 'DONE')`. So once
 * we have broadcast the signed transaction ourselves and know it confirmed, we
 * write `{ status: 'DONE', txHash }` onto that same process *before* the widget
 * mounts. Li.Fi then skips signing entirely and goes straight to polling the
 * destination via `waitForDestinationChainTransaction()`, which reads
 * `process.txHash`. `prepareRestart` preserves the process because it now has a
 * txHash and isn't FAILED.
 *
 * This is undocumented behaviour of Li.Fi's control flow, not a public API. It's
 * pinned by the version in package.json; re-verify on any @lifi/sdk bump.
 */

/** zustand persist key from `createRouteExecutionStore` (no `keyPrefix` set). */
const STORE_KEY = "li.fi-widget-routes";

/** Statuses a process sits in while it is waiting on the wallet to sign. */
const AWAITING_SIGNATURE = ["ACTION_REQUIRED", "STARTED"];

export interface PendingSignTarget {
  routeId: string;
  stepId: string;
  processType: string;
}

function readStore(): any | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStore(store: any): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

function eachStep(
  store: any,
  fn: (ctx: { routeId: string; step: any }) => void,
): void {
  const routes = store?.state?.routes ?? {};
  for (const routeId of Object.keys(routes)) {
    const steps = routes[routeId]?.route?.steps ?? [];
    for (const step of steps) fn({ routeId, step });
  }
}

/**
 * Which route/step/process is currently blocked on a wallet signature.
 *
 * Called at deeplink time so the callback knows where to write the txHash back.
 * Li.Fi has already flipped the process to ACTION_REQUIRED and persisted it by
 * the time it calls the wallet, so this is reliable.
 */
export function findPendingSignTarget(): PendingSignTarget | null {
  const store = readStore();
  if (!store) return null;

  // Abandoned attempts can leave stale ACTION_REQUIRED processes lying around, so
  // match the most recently started one — that's the swap the user just approved.
  let found: PendingSignTarget | null = null;
  let newest = -1;

  eachStep(store, ({ routeId, step }) => {
    const processes = step?.execution?.process ?? [];
    for (const process of processes) {
      if (!AWAITING_SIGNATURE.includes(process?.status) || process?.txHash) {
        continue;
      }
      const startedAt = Number(process?.startedAt ?? 0);
      if (startedAt >= newest) {
        newest = startedAt;
        found = { routeId, stepId: step.id, processType: process.type };
      }
    }
  });
  return found;
}

/**
 * Mark the source transaction as landed, so the resumed executor polls instead
 * of re-signing. Must run BEFORE the widget mounts. Returns false if the target
 * process could not be found (caller should then not resume optimistically).
 */
export function markProcessDone(
  target: PendingSignTarget,
  txHash: string,
  txLink: string,
): boolean {
  const store = readStore();
  if (!store) return false;

  const route = store?.state?.routes?.[target.routeId]?.route;
  const step = route?.steps?.find((s: any) => s?.id === target.stepId);
  const process = step?.execution?.process?.find(
    (p: any) => p?.type === target.processType,
  );
  if (!process) return false;

  process.status = "DONE";
  process.txHash = txHash;
  process.txLink = txLink;
  process.doneAt = Date.now();
  delete process.error;

  // Keep the STEP pending — its destination side still has to be polled. A step
  // marked DONE is skipped wholesale by `executeSteps`.
  if (step.execution) step.execution.status = "PENDING";

  writeStore(store);
  return true;
}

/**
 * Stop the route dead, so the widget's auto-resume (`isRouteActive`) will not
 * fire and re-sign.
 *
 * For the one undecidable case: we broadcast, but could not determine whether the
 * transaction landed before we ran out of time. Re-signing here could swap twice,
 * so we hand the decision to the user with the signature to check.
 */
export function markRouteFailed(
  target: PendingSignTarget,
  message: string,
  txHash?: string,
): void {
  const store = readStore();
  if (!store) return;

  const entry = store?.state?.routes?.[target.routeId];
  const step = entry?.route?.steps?.find((s: any) => s?.id === target.stepId);
  const process = step?.execution?.process?.find(
    (p: any) => p?.type === target.processType,
  );
  if (!process || !step?.execution) return;

  process.status = "FAILED";
  process.error = { message, code: "PHANTOM_DEEPLINK_UNVERIFIED" };
  if (txHash) process.txHash = txHash;
  step.execution.status = "FAILED";
  if (entry) entry.status = "failed";

  writeStore(store);
}

/**
 * Abandon the in-flight signature attempt: drop the process so Li.Fi re-quotes
 * cleanly on resume.
 *
 * ONLY safe to call once the signed transaction provably cannot land (its
 * blockhash has expired) or was never signed at all. Calling it while a signed
 * transaction could still be confirmed risks a double-swap.
 */
export function discardPendingSignAttempt(target: PendingSignTarget): void {
  const store = readStore();
  if (!store) return;

  const route = store?.state?.routes?.[target.routeId]?.route;
  const step = route?.steps?.find((s: any) => s?.id === target.stepId);
  if (!step?.execution) return;

  step.execution.process = (step.execution.process ?? []).filter(
    (p: any) => p?.type !== target.processType || Boolean(p?.txHash),
  );
  writeStore(store);
}
