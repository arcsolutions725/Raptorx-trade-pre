/**
 * Scroll intent for the Claw v5 welcome screen.
 *
 * The header's "Claw AI 5.0" button sets this flag right before navigating, and
 * the welcome page consumes it once on mount. That lets the page distinguish:
 *
 *   - arrived via the nav button  → land at the bottom (prompt cards + input)
 *   - refreshed / direct visit    → land at the top (logo + title)
 *
 * A page refresh can't be told apart from a client-side navigation by looking at
 * the page alone (the navigation-timing entry describes the original document
 * load, not the route change), so the intent has to travel from the click.
 */
const KEY = "claw-v5:scroll-to-input";

/** Called by the header's "Claw AI 5.0" button just before router.push. */
export function markClawV5ScrollToInput(): void {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    /* private mode / storage disabled — fall back to landing at the top */
  }
}

/** Reads and clears the flag, so a later refresh lands at the top. */
export function consumeClawV5ScrollToInput(): boolean {
  try {
    const value = sessionStorage.getItem(KEY);
    if (value !== null) sessionStorage.removeItem(KEY);
    return value === "1";
  } catch {
    return false;
  }
}
