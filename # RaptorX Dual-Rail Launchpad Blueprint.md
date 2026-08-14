# RaptorX Dual-Rail Launchpad Blueprint

## Version 5: RaptorX Swap, Dual Rewards, and RexScreener

**Status:** Approved product architecture and implementation reference  
**Target network:** Robinhood Chain, chain ID `4663`  
**Token supply per launch:** fixed `1,000,000,000 XXX`  
**Pre-graduation market:** one `XXX/WETH` bonding curve inside RaptorX  
**Post-graduation markets:** `XXX/WETH` and `XXX/HOOD` inside RaptorX Swap  
**Initial post-graduation allocation:** fixed `50/50` by normalized USD value  
**Standard net graduation target:** creator-selectable `2–4 ETH`  
**Advanced net graduation target:** creator-selectable `4–32 ETH`  
**Maximum creator allocation:** `95%` of supply to one designated wallet  
**Trade fee:** exactly `1%` of quote-side notional on every buy and sell  
**Initial fee split:** `60% creator / 20% RaptorX / 10% HOOD rewards / 5% WETH rewards / 5% individual`  
**Reward holding floor:** `500,000 XXX`  
**Reward calculation:** equal payout to every qualified wallet in its cohort  
**Default reward triggers:** `$5,000 HOOD / $2,500 WETH`, configurable per launch  
**Canonical market data:** RexScreener only  
**Policy control:** RaptorX Safe multisig plus a minimum 48-hour timelock  

> **Important:** This document is a complete architecture and reference implementation, not audited deployment code. Pin exact dependency commits, replace placeholder token and oracle addresses, validate current Robinhood Chain deployments, obtain written Stock Token integration requirements, complete legal review, run testnet pilots, and obtain independent smart-contract audits before mainnet.

---

## 1. Product in one paragraph

Every RaptorX token begins on a WETH bonding curve and graduates into two permanently locked RaptorX Swap markets: `XXX/WETH` for restricted or non-credentialed users and `XXX/HOOD` for eligible users. Both markets begin with equal normalized USD liquidity. The router sends eligible flow to HOOD first, but splits oversized orders into WETH when necessary to protect execution. Every pre- and post-graduation trade pays one 1% fee. That fee funds the creator, RaptorX, an individual wallet, and two recurring equal-share holder reward pools—HOOD for eligible holders and WETH for restricted holders. RexScreener combines both markets into one canonical price, chart, liquidity figure, volume history, and holder view.

The result is one coherent loop:

```text
Launch XXX
    -> price discovery on the WETH bonding curve
    -> graduate into XXX/WETH + XXX/HOOD
    -> trade through RaptorX Swap
    -> collect exactly 1%
    -> fund creator, RaptorX, individual, HOOD rewards, and WETH rewards
    -> distribute equal rewards to qualified holders
    -> repeat for as long as the token trades
```

---

## 2. Approved non-negotiable rules

### 2.1 Immutable launch rules

These rules are factory-wide and cannot be disabled for an individual launch:

1. Total supply is exactly `1,000,000,000 XXX`.
2. The pre-graduation market is one WETH-denominated bonding curve.
3. Graduation creates two distinct pools: `XXX/WETH` and `XXX/HOOD`.
4. Initial post-graduation quote liquidity is split `50/50` by normalized USD value.
5. Initial remaining XXX liquidity is split equally between the two pools.
6. Both LP positions are permanently locked.
7. Every ordinary buy and sell pays exactly 1% of quote-side notional.
8. Both reward obligations are segregated by launch and reward asset.
9. Amounts assigned to one launch can never fund another launch.
10. The developer-allocation wallet and creator-fee wallet cannot receive holder rewards.
11. RaptorX Swap is the post-graduation trading interface.
12. RexScreener is the canonical chart and analytics layer.

### 2.2 Timelocked, future-only policy controls

RaptorX may adjust the following through a Safe multisig and 48-hour timelock:

- RaptorX, HOOD-reward, and WETH-reward portions of the flexible 35% fee share;
- the HOOD distribution trigger per launch;
- the WETH distribution trigger per launch;
- the holder requirement per launch;
- future reward-round enable/pause state;
- ordinary and meme-mode price-impact ceilings;
- approved 0x settlement targets;
- approved keeper and market-maker addresses;
- eligibility signer and credential policy.

The following remain fixed:

- creator share: `60%` of the 1% fee;
- individual share: `5%` of the 1% fee;
- total fee: exactly `1%`;
- fee shares must sum to `100%`;
- active reward rounds cannot be rewritten;
- accrued rewards cannot be withdrawn by governance;
- historical trades and fee assignments cannot be reclassified.

---

## 3. Token supply and creator allocation

### 3.1 Supply math

```text
TOTAL_SUPPLY = 1,000,000,000 XXX
CURVE_SALE_CAP = 950,000,000 XXX
DUAL_POOL_RESERVE = 50,000,000 XXX

creator block-zero buy =
    selected percentage × TOTAL_SUPPLY

remaining public curve inventory =
    CURVE_SALE_CAP - creator block-zero buy

post-graduation pool reserve =
    DUAL_POOL_RESERVE
```

Examples:

| Creator selection | Creator block-zero buy | Remaining public curve inventory | Pool reserve |
| ---: | ---: | ---: | ---: |
| 0% | 0 XXX | 950,000,000 XXX | 50,000,000 XXX |
| 50% | 500,000,000 XXX | 450,000,000 XXX | 50,000,000 XXX |
| 90% | 900,000,000 XXX | 50,000,000 XXX | 50,000,000 XXX |
| 95% | 950,000,000 XXX | 0 XXX | 50,000,000 XXX |

The curve is calibrated so selling the full 950M sale inventory raises exactly the creator-selected net graduation target. The final 50M is never sold on the curve; it is reserved for the two graduated pools. At 95%, the creator purchases the entire sale inventory and the launch can graduate atomically in the same transaction. Each post-graduation pool receives 25M XXX.

### 3.2 Frontend behavior

The launch form contains one simple **Developer ownership** slider:

```text
0% --------------------------------------------------------- 95%
```

It immediately shows:

- selected percentage;
- exact XXX amount;
- exact ETH required by the bonding curve;
- 1% fee;
- gross ETH required;
- destination wallet;
- creator-fee wallet;
- chosen net graduation target;
- remaining public supply.

“Remaining public supply” is the unsold portion of the 950M curve inventory. The separate 50M post-graduation pool reserve is also shown in the preview.

There is:

- no vesting option;
- no treasury breakdown;
- no multi-wallet split;
- no mandatory warning modal;
- no separate disclosure workflow.

The full developer allocation is sent to one designated EVM wallet. What the creator does with those tokens afterward is outside the launch contract. RexScreener displays the wallet’s ownership percentage in the normal holder and ownership view.

### 3.3 Reward exclusions

The following addresses are excluded from both HOOD and WETH holder rewards:

- developer-allocation wallet;
- creator-fee wallet;
- bonding curve;
- WETH pool;
- HOOD pool;
- LP locker;
- RaptorX routers;
- fee collector and reward vaults;
- zero address, burn addresses, bridges, exchanges, and system contracts;
- any additional address explicitly classified as a system address.

If the allocation wallet and creator-fee wallet are different, both are excluded.

---

## 4. Atomic block-zero creator purchase

### 4.1 Purpose

The creator can select up to 95% of supply and fund the corresponding purchase in the launch transaction. RaptorX does not send a public token-creation transaction and then ask the creator to race bots. Deployment and purchase are one atomic action.

### 4.2 Required transaction

```text
createAndBuy()
    1. validate launch parameters
    2. deploy XXX
    3. deploy its bonding curve
    4. compute exact curve integral for chosen allocation
    5. collect gross ETH
    6. deduct the 1% quote-side fee
    7. buy the exact creator allocation
    8. send those tokens to the designated allocation wallet
    9. graduate atomically if the selected net target is reached
   10. refund unused ETH
```

No third party can insert a buy between token creation and the creator allocation because the full sequence occurs in one transaction.

### 4.3 Exact funding display

For a required net curve contribution `N`:

```text
fee rate = 1% = 0.01
gross required = N / (1 - 0.01)
fee = gross required - N
```

Example:

```text
Desired net curve contribution: 32.000000 ETH
Gross ETH required:              32.323232 ETH
1% fee:                           0.323232 ETH
Net to curve:                    32.000000 ETH
```

If the creator inputs exactly `32 ETH` gross:

```text
1% fee:       0.32 ETH
net to curve: 31.68 ETH
```

The UI must label **Gross supplied**, **Trading fee**, and **Net graduation progress** separately.

### 4.4 Curve requirement

The bonding curve must expose a deterministic integral:

```solidity
function quoteBuyExactTokens(uint256 tokenOut)
    external
    view
    returns (uint256 netQuoteIn);
```

The terminal curve price must match the starting normalized price used to initialize both post-graduation pools. Do not use an arbitrary creator-allocation conversion that creates an immediate discontinuity at graduation.

For each selected net graduation target:

```text
integral from 0 tokens sold to 950,000,000 tokens sold
    = selected net graduation target
```

This makes the 95% creator purchase and the graduation target mathematically compatible. For a smaller creator purchase, public buyers purchase the remaining curve inventory until the same target is reached.

---

## 5. Bonding curve and graduation

### 5.1 Pre-graduation flow

There is one WETH curve:

```text
Buy:
input asset -> WETH -> deduct 1% -> bonding curve -> XXX

Sell:
XXX -> bonding curve -> WETH proceeds -> deduct 1% -> chosen output
```

The user remains inside RaptorX. Any cross-asset entry or exit uses the RaptorX routing layer.

### 5.2 Graduation controls

The frontend presents two modes:

| Mode | Net target |
| --- | ---: |
| Standard | slider from `2 ETH` to `4 ETH` |
| Advanced | slider from `4 ETH` to `32 ETH` |

The selected value is the **net quote value available for graduation after the 1% fee**.

### 5.3 Atomic graduation

Graduation is one atomic transaction:

1. Stop curve trading.
2. Sweep the reserved 50M XXX and net WETH reserves.
3. Determine the terminal normalized USD price.
4. Keep 50% of quote value in WETH.
5. Convert 50% of quote value into HOOD through an approved 0x/RFQ route.
6. Split the reserved 50M XXX equally.
7. Initialize `XXX/WETH` and `XXX/HOOD` at the same normalized USD price.
8. Mint full-range or approved concentrated LP positions.
9. Permanently lock both LP positions.
10. Register token, pools, vaults, reward config, and excluded wallets.
11. Activate RaptorX Swap routing.
12. Activate RexScreener indexing.
13. Activate keeper monitoring.

If the oracle, HOOD conversion, pool initialization, price check, registration, or LP lock fails, the entire graduation transaction reverts. The curve remains live and user funds remain coherent.

### 5.4 Initial 50/50 pool allocation

For `Q` net quote value:

```text
WETH rail quote value = Q / 2
HOOD rail quote value = Q / 2
```

For the fixed `50,000,000 XXX` pool reserve:

```text
WETH rail XXX = 25,000,000
HOOD rail XXX = 25,000,000
```

Example at the 95% creator allocation and a 4 ETH net graduation:

```text
reserved XXX:        50,000,000
XXX/WETH tokens:     25,000,000
XXX/HOOD tokens:     25,000,000
WETH rail quote:      2 ETH
HOOD rail quote:      USD value of 2 ETH
```

The pools have separate reserves after initialization. A trade in one pool does not automatically add liquidity to the other.

### 5.5 Liquidity lock

Both LP positions are sent to an immutable locker that:

- rejects withdrawals;
- rejects beneficiary replacement;
- allows only fee collection into the FeeCollector;
- exposes position IDs publicly;
- prevents admin rescue of underlying liquidity.

---

## 6. Post-graduation routing

### 6.1 Cohorts and rails are related but not identical

- **Restricted or unknown wallet:** WETH rail only; WETH reward cohort.
- **HOOD-eligible wallet:** HOOD-first routing; HOOD reward cohort.
- An eligible wallet remains in the HOOD cohort even when a large order partially overflows into WETH.
- One wallet cannot participate in both reward cohorts for the same round.

### 6.2 Restricted or unknown user

```text
Buy:  input -> WETH -> XXX/WETH -> XXX
Sell: XXX -> XXX/WETH -> WETH -> chosen output
```

This user never receives or routes through HOOD.

### 6.3 Eligible user

The router quotes both markets:

1. Determine the largest amount that can execute through `XXX/HOOD` without exceeding the signed impact ceiling.
2. Send that amount through HOOD.
3. Send overflow through WETH.
4. Combine output.
5. Enforce one aggregate minimum output.
6. Execute atomically or revert.

Recommended initial ceilings:

| Mode | Maximum simulated price impact |
| --- | ---: |
| Ordinary | `300 bps` |
| Meme launch | `500 bps` |

The ceiling must be signed into the user’s quote and cannot be silently raised by the router.

### 6.4 Whale example

```text
eligible order:             $100,000
HOOD safe capacity:          $35,000
WETH capacity:               $65,000

routing:
    $35,000 -> XXX/HOOD
    $65,000 -> XXX/WETH
```

The user receives one combined XXX output and stays in the HOOD reward cohort.

### 6.5 Quote response

```ts
export type DualRailQuote = {
  marketToken: `0x${string}`;
  side: "BUY" | "SELL";
  cohort: "HOOD" | "WETH";
  hoodAmountIn: bigint;
  wethAmountIn: bigint;
  expectedTokenOut: bigint;
  minimumTokenOut: bigint;
  expectedImpactBps: number;
  feeAmountUsdE18: bigint;
  expiresAt: number;
  nonce: bigint;
  signature: `0x${string}`;
};
```

The trade confirmation shows only:

- **Route:** HOOD, WETH, or Split;
- expected output;
- minimum output;
- price impact;
- 1% fee;
- final wallet output.

---

## 7. Eligibility and automatic enrollment

### 7.1 Simple user experience

There is no separate rewards signup page and no recurring claim flow.

On the first relevant interaction:

1. User connects wallet.
2. Backend uses location only as a prefilter.
3. Approved eligibility provider evaluates the wallet/user.
4. User signs one combined message covering:
   - wallet-bound eligibility attestation;
   - Stock Token disclosures;
   - automatic reward delivery consent;
   - one-person/one-reward-wallet registration.
5. The wallet is automatically enrolled.
6. Future eligible HOOD rewards are automatically delivered.

Restricted or unknown wallets default to WETH routing and the WETH reward cohort.

### 7.2 Why IP alone is insufficient

IP geolocation can select a safe default UI route, but it is not the final authority. A VPN, travel, shared device, or remote server can make an IP inaccurate. HOOD delivery requires a valid wallet-bound credential and a fresh eligibility check immediately before payment.

### 7.3 One person, one wallet

Equal rewards create a strong incentive to split holdings across wallets. The eligibility service issues a pseudonymous `subjectHash` and allows only one active reward wallet per beneficial owner.

Wallet migration:

- requires a new eligibility decision;
- has a delay;
- disables the old wallet;
- cannot place both wallets in the same reward round.

No personal identity or country is stored onchain.

### 7.4 Integration and legal activation gate

HOOD is a Stock Token. Pool access and automatic HOOD delivery must follow the issuer’s current eligibility rules and written integration requirements.

Before production activation, obtain written confirmation covering:

- whether `XXX/HOOD` AMM pools are an approved use case;
- whether fee-funded HOOD rewards to XXX holders are permitted;
- approved jurisdictions and person types;
- approved eligibility and disclosure process;
- requirements for the router, reward vault, keeper, and market maker;
- corporate actions, multipliers, redemption, and token migration;
- wording RaptorX may use for “rewards” or “distributions.”

Use two explicit system states:

```text
ACCRUAL_ONLY
    -> keep each launch's HOOD obligation segregated in WETH/HOOD
    -> do not deliver HOOD
    -> WETH reward rounds may operate independently

AUTOMATIC_ELIGIBLE_HOOD
    -> batch-convert approved WETH obligation into HOOD
    -> open HOOD rounds
    -> re-check current eligibility before every payout
```

Pausing HOOD conversion or delivery never turns the accrued obligation into RaptorX revenue.

---

## 8. Exact 1% fee

### 8.1 Fee definition

RaptorX charges exactly:

```text
1% of quote-side trade notional
```

On buys, it is deducted from quote input before the swap. On sells, it is deducted from quote output after the swap.

RaptorX must not:

- charge 1% and then add another hidden pool fee;
- sell XXX to manufacture fee revenue;
- describe unavoidable third-party spread, gas, or price impact as part of the RaptorX fee.

The V4 pool fee and hook accounting must be configured so the advertised RaptorX fee remains exactly 1%.

### 8.2 Approved split

| Recipient | Share of 1% fee | Effective share of volume |
| --- | ---: | ---: |
| Creator-fee wallet | 60% | 0.60% |
| RaptorX revenue wallet | 20% | 0.20% |
| HOOD holder rewards | 10% | 0.10% |
| WETH holder rewards | 5% | 0.05% |
| Individual EVM wallet | 5% | 0.05% |
| **Total** | **100%** | **1.00%** |

The creator’s 60% and individual’s 5% are fixed. The RaptorX/HOOD/WETH shares comprise the flexible 35%, initially `20/10/5`.

### 8.3 Volume economics

| Daily volume | Total 1% fees | Creator 60% | RaptorX 20% | HOOD 10% | WETH 5% | Individual 5% |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| $100K | $1,000 | $600 | $200 | $100 | $50 | $50 |
| $1M | $10,000 | $6,000 | $2,000 | $1,000 | $500 | $500 |
| $3M | $30,000 | $18,000 | $6,000 | $3,000 | $1,500 | $1,500 |
| $4M | $40,000 | $24,000 | $8,000 | $4,000 | $2,000 | $2,000 |

### 8.4 Asset settlement

- WETH-rail fees arrive in WETH.
- HOOD-rail fees arrive in HOOD.
- Creator, RaptorX, and individual distributions default to WETH.
- The HOOD reward allocation is retained or batch-converted into HOOD.
- The WETH reward allocation is retained or batch-converted into WETH.
- Conversion uses approved 0x/RFQ settlement in batches, never one external swap per user trade.
- Every launch has separate ledgers for creator, RaptorX, individual, HOOD rewards, and WETH rewards.

### 8.5 Pre-graduation fees

All pre-graduation fees arrive in WETH. The FeeCollector books both reward obligations from the first trade:

```text
10% of the fee -> launch HOOD obligation, escrowed in WETH until conversion
 5% of the fee -> launch WETH reward balance
```

Reward rounds open only after graduation, automatic enrollment, and the relevant reward rail are operational.

---

## 9. Dual equal-share rewards

### 9.1 Two mutually exclusive groups

For every launch:

**HOOD group**

- valid HOOD eligibility credential;
- enrolled reward wallet;
- at least `500,000 XXX`;
- not an excluded address.

**WETH group**

- restricted or unknown status;
- enrolled reward wallet;
- at least `500,000 XXX`;
- not an excluded address.

### 9.2 Equal payout

Rewards are not proportional to holdings.

```text
qualified holder with 500,000 XXX  -> one share
qualified holder with 10,000,000 XXX -> one share
holder with 499,999 XXX -> zero
```

For each round:

```text
equal payout = funded reward balance / qualified wallet count
```

### 9.3 Maximum theoretical qualified holder count

Ignoring locked/system balances:

```text
1,000,000,000 / 500,000 = 2,000 wallets
```

At a 95% creator allocation, the excluded creator controls 950,000,000 XXX:

```text
50,000,000 / 500,000 = 100 external wallets maximum
```

Actual qualified counts will be lower because pool balances, routers, contracts, restricted wallets, and unregistered wallets are excluded or separated by cohort.

### 9.4 Default triggers and payout examples

Initial defaults:

```text
HOOD trigger = $5,000
WETH trigger = $2,500
```

The different thresholds equalize cadence because HOOD receives 10% of fees and WETH receives 5%.

At `$3M` daily volume:

```text
HOOD accrual: $3,000/day -> $5,000 in ~1.67 days
WETH accrual: $1,500/day -> $2,500 in ~1.67 days
```

At `$4M` daily volume:

```text
HOOD accrual: $4,000/day -> $5,000 in 1.25 days
WETH accrual: $2,000/day -> $2,500 in 1.25 days
```

Per-wallet payout at trigger:

| Qualified wallets in a cohort | HOOD round | WETH round |
| ---: | ---: | ---: |
| 10 | $500 | $250 |
| 25 | $200 | $100 |
| 50 | $100 | $50 |
| 100 | $50 | $25 |
| 500 | $10 | $5 |
| 2,000 theoretical maximum | $2.50 | $1.25 |

For launches near the 95% creator allocation, the 100-wallet ceiling makes the default triggers economically visible rather than dust.

### 9.5 Per-launch configurable triggers

RaptorX controls reward policy per launch and per reward asset.

Admin presets:

```text
$500 / $1,000 / $2,500 / $5,000 / $10,000 / Custom
```

Each launch stores:

- HOOD trigger;
- WETH trigger;
- holding requirement;
- enabled/paused status;
- policy version;
- effective timestamp.

The admin dashboard shows:

- pending balance;
- qualified holder estimate;
- estimated payout per wallet;
- 7-day average volume;
- estimated days until distribution;
- next executable policy change.

Policy updates affect only unopened future rounds. An opened round freezes its asset, funded amount, qualified root, equal payout, snapshot block, and policy version.

### 9.6 Snapshot and payout checks

A wallet must pass both:

1. balance and cohort check at the finalized snapshot block;
2. balance, registration, exclusion, and eligibility check immediately before payment.

Failed, skipped, expired, or rounded-down rewards:

- stay with the same launch;
- stay in the same reward asset;
- roll into the next distribution;
- cannot be redirected to protocol revenue.

Automatic batch delivery is the default. A manual claim exists only as a fallback when automatic delivery to an otherwise qualified wallet fails.

---

## 10. Canonical price and RexScreener

### 10.1 Why one pool cannot be the official price

Neither `XXX/WETH` nor `XXX/HOOD` is permanently authoritative. Using the higher price would invite manipulation. Using a fixed 50/50 average would ignore changes in usable liquidity.

RexScreener computes a normalized, liquidity-weighted mark.

### 10.2 Normalize both rails into USD

```text
P_WETH_USD = TWAP(XXX/WETH) × oracle(WETH/USD)
P_HOOD_USD = TWAP(XXX/HOOD) × oracle(HOOD/USD)
```

Recommended initial window:

```text
60-second TWAP
```

For each pool, calculate usable liquidity near the current price rather than total nominal TVL.

```text
canonical price =
    (P_WETH_USD × usableWethLiquidity
     + P_HOOD_USD × usableHoodLiquidity)
    /
    (usableWethLiquidity + usableHoodLiquidity)
```

### 10.3 Safety rules

- Reject stale oracle updates.
- Check Robinhood Chain sequencer status where applicable.
- Ignore a pool if its observation is stale.
- Flag extreme cross-pool divergence.
- Cap a pool’s weight if near-price usable liquidity collapses.
- Fall back to WETH-only mark when HOOD is unavailable or ineligible for canonical calculation.
- Never use the highest of the two prices.
- Execution quotes always use actual routed pools, not the headline mark.

### 10.4 RexScreener metrics

```text
market cap = canonical price × circulating supply
combined liquidity = WETH pool USD liquidity + HOOD pool USD liquidity
24h volume = sum of distinct swaps across both pools
ATH = highest confirmed canonical close, not a thin-pool spike
```

RexScreener displays:

- canonical price and market cap;
- combined liquidity;
- combined 24-hour volume;
- ATH;
- Combined / WETH / HOOD chart tabs;
- recent trades marked WETH, HOOD, or Split;
- holder table;
- creator ownership;
- locked-liquidity status;
- reward balances, triggers, and estimated next distribution;
- contract and pool identifiers.

There are no external screener dependencies or buttons.

### 10.5 Page structure

**Launch page**

- name, ticker, description, image, socials;
- developer-ownership slider `0–95%`;
- exact token allocation;
- exact net and gross ETH;
- standard `2–4 ETH` or advanced `4–32 ETH` net graduation;
- creator wallet;
- creator-fee wallet;
- final fee split;
- liquidity-lock status;
- one Create and Buy button.

**Explorer**

- Bonding / Graduated sections;
- recent, newest, oldest, market cap, volume, liquidity, and reward filters;
- search;
- cards with price, market cap, volume, graduation progress, and developer ownership.

**Token page**

- about and social links;
- buy/sell card;
- route and slippage;
- combined chart with rail tabs;
- market cap, liquidity, volume, and ATH;
- recent trades;
- holders and developer ownership;
- reward status;
- optional holder chat.

Do not expose limit-order or order-book tabs until those systems actually exist.

---

## 11. Arbitrage and keeper system

### 11.1 Why the keeper is required

Two independent pools can diverge. External arbitrageurs may correct them, but a new or low-volume token cannot assume immediate coverage. RaptorX therefore runs an owned keeper as the backstop and permits approved external market makers as an optional second layer.

### 11.2 Divergence

“Divergence” simply means the normalized price in one pool is different from the normalized price in the other.

```text
divergence bps =
    abs(P_WETH_USD - P_HOOD_USD)
    / midpoint(P_WETH_USD, P_HOOD_USD)
    × 10,000
```

The keeper trades only when expected profit exceeds:

- gas;
- external 0x/RFQ spread;
- slippage;
- safety margin;
- any applicable fee.

### 11.3 Two trade directions

If XXX is cheaper in WETH:

```text
WETH -> buy XXX in XXX/WETH
XXX -> sell for HOOD in XXX/HOOD
HOOD -> WETH through approved 0x/RFQ
```

If XXX is cheaper in HOOD:

```text
WETH -> HOOD through approved 0x/RFQ
HOOD -> buy XXX in XXX/HOOD
XXX -> sell for WETH in XXX/WETH
```

Every arb transaction must finish with more WETH than it started with by at least `minProfit`.

### 11.4 Keeper fee exemption

Ordinary users always pay 1%. The audited protocol arb executor receives either:

- a tightly scoped fee exemption; or
- an atomic rebate.

Without it, two pool legs can cost roughly 2% before external conversion, allowing a persistent 2–3% gap.

The exemption is valid only when:

- caller is the registered ArbitrageExecutor;
- both pools belong to the same registered launch;
- route matches an approved WETH/XXX/HOOD cycle;
- transaction ends with more WETH than it started;
- minimum profit is enforced;
- no arbitrary recipient is allowed;
- all intermediate tokens are approved;
- event records pre- and post-trade balances.

External market makers do not automatically receive an exemption.

### 11.5 Keeper float

For the first standard `2–4 ETH` launch:

```text
trading float: 0.50 WETH
gas reserve:   0.05 ETH
bare total:   ~0.55 ETH
```

General formulas:

```text
bare trading float =
    max(0.5 WETH, 6.25% of net graduation liquidity)

recommended trading float =
    max(0.5 WETH, 12.5% of net graduation liquidity)
```

| Net graduation | Quote value per pool | Bare trading float | Recommended |
| ---: | ---: | ---: | ---: |
| 2 ETH | 1 ETH | 0.5 WETH | 0.5 WETH |
| 4 ETH | 2 ETH | 0.5 WETH | 0.5–1 WETH |
| 10 ETH | 5 ETH | 0.625 WETH | 1.25 WETH |
| 32 ETH | 16 ETH | 2 WETH | 4 WETH |

The float is reusable. If a whale creates a gap larger than one keeper cycle can close, the bot executes the largest safe profitable correction, settles back to WETH, and repeats. A 0.5 WETH float is a bare launch minimum, not a guarantee against every whale.

Confirm the minimum practical 0x/Tokka RFQ notional before hardcoding production sizes.

### 11.6 External arbitrage discovery

RexScreener publishes:

- launch and pool registry;
- normalized rail prices;
- divergence;
- usable liquidity;
- estimated gross spread;
- recent swaps;
- WebSocket notifications.

External searchers use their own capital and keep their profit. RaptorX normally does not pay them. A dedicated market maker may request a retainer for guaranteed coverage.

Best operating model:

```text
RaptorX keeper = guaranteed backstop
approved external MMs = optional additional coverage
public eligible searchers = opportunistic coverage
```

---

## 12. Contract topology

```text
DualRailLaunchFactory
    -> LaunchToken
    -> BondingCurve
    -> GraduationManager
        -> XXX/WETH V4 pool
        -> XXX/HOOD V4 pool
        -> LPPositionLocker
    -> LaunchRegistry

RaptorXSwapRouter
    -> EligibilityRegistry
    -> OracleRouter
    -> RaptorXUniversalHook
    -> ZeroXSettlementAdapter

RaptorXUniversalHook
    -> exact 1% quote-side fee
    -> trusted-router enforcement
    -> HOOD eligibility enforcement
    -> tightly scoped keeper exemption
    -> FeeCollector

FeeCollector
    -> FeeSplitter
        -> creator wallet
        -> RaptorX wallet
        -> individual wallet
    -> HoodRewardsVault
    -> WethRewardsVault

Reward system
    -> RewardWalletRegistry
    -> EligibilityRegistry
    -> per-launch RewardPolicy
    -> finalized snapshot service
    -> Merkle round builder
    -> automatic distributor

RexScreener
    -> chain indexer
    -> oracle/TWAP normalizer
    -> canonical-price engine
    -> candles and metrics database
    -> REST + WebSocket API

Keeper
    -> divergence monitor
    -> size optimizer
    -> 0x/RFQ quote client
    -> ArbitrageExecutor
```

---

## 13. Core data types

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

library RaptorXTypes {
    uint16 internal constant BPS = 10_000;
    uint16 internal constant TRADE_FEE_BPS = 100; // 1%
    uint256 internal constant TOTAL_SUPPLY = 1_000_000_000 ether;
    uint256 internal constant CURVE_SALE_CAP = 950_000_000 ether;
    uint256 internal constant DUAL_POOL_RESERVE = 50_000_000 ether;
    uint16 internal constant MAX_CREATOR_ALLOCATION_BPS = 9_500;

    enum Rail {
        WETH,
        HOOD,
        SPLIT
    }

    enum Cohort {
        NONE,
        WETH,
        HOOD
    }

    struct LaunchParams {
        string name;
        string symbol;
        string metadataUri;
        address allocationWallet;
        address creatorFeeWallet;
        uint16 creatorAllocationBps;
        uint256 netGraduationTarget;
        uint256 minimumCreatorTokenOut;
        uint256 deadline;
    }

    struct FeeShares {
        uint16 creatorBps;     // fixed 6000
        uint16 raptorXBps;     // initial 2000
        uint16 hoodRewardsBps; // initial 1000
        uint16 wethRewardsBps; // initial 500
        uint16 individualBps;  // fixed 500
    }

    struct RewardConfig {
        uint256 minimumHolding;
        uint256 hoodTriggerUsdE18;
        uint256 wethTriggerUsdE18;
        bool hoodEnabled;
        bool wethEnabled;
        uint64 effectiveAt;
        uint32 version;
    }
}
```

---

## 14. Reference Solidity

The following code defines the required boundaries and invariants. It intentionally omits chain-specific V4 callback plumbing that must be implemented against pinned `v4-core` and `v4-periphery` commits.

### 14.1 Launch token

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract LaunchToken is ERC20 {
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;
    address public immutable launchFactory;

    error OnlyFactory();

    constructor(
        string memory name_,
        string memory symbol_,
        address factory_,
        address initialHolder
    ) ERC20(name_, symbol_) {
        launchFactory = factory_;
        _mint(initialHolder, TOTAL_SUPPLY);
    }

    function burnFromFactory(address from, uint256 amount) external {
        if (msg.sender != launchFactory) revert OnlyFactory();
        _burn(from, amount);
    }
}
```

### 14.2 Launch and pool registry

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AccessControl} from
    "@openzeppelin/contracts/access/AccessControl.sol";

contract LaunchRegistry is AccessControl {
    bytes32 public constant FACTORY_ROLE = keccak256("FACTORY_ROLE");
    bytes32 public constant GRADUATOR_ROLE = keccak256("GRADUATOR_ROLE");

    struct Launch {
        address token;
        address curve;
        address allocationWallet;
        address creatorFeeWallet;
        bytes32 wethPoolId;
        bytes32 hoodPoolId;
        uint256 netGraduationTarget;
        uint16 creatorAllocationBps;
        bool graduated;
        bool registered;
    }

    struct Pool {
        address token;
        address quote;
        bool hoodRail;
        bool registered;
    }

    mapping(address token => Launch) public launches;
    mapping(bytes32 poolId => Pool) public pools;
    mapping(address token => mapping(address account => bool))
        public rewardExcluded;

    error AlreadyRegistered();
    error UnknownLaunch();
    error InvalidPool();

    event LaunchRegistered(
        address indexed token,
        address indexed curve,
        address allocationWallet,
        address creatorFeeWallet,
        uint16 creatorAllocationBps,
        uint256 netGraduationTarget
    );
    event Graduated(
        address indexed token,
        bytes32 indexed wethPoolId,
        bytes32 indexed hoodPoolId
    );
    event RewardExclusionSet(
        address indexed token,
        address indexed account,
        bool excluded
    );

    constructor(address admin, address factory, address graduator) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(FACTORY_ROLE, factory);
        _grantRole(GRADUATOR_ROLE, graduator);
    }

    function registerLaunch(Launch calldata launch)
        external
        onlyRole(FACTORY_ROLE)
    {
        if (launches[launch.token].registered) revert AlreadyRegistered();
        launches[launch.token] = launch;
        launches[launch.token].registered = true;

        _exclude(launch.token, launch.allocationWallet, true);
        _exclude(launch.token, launch.creatorFeeWallet, true);
        _exclude(launch.token, launch.curve, true);

        emit LaunchRegistered(
            launch.token,
            launch.curve,
            launch.allocationWallet,
            launch.creatorFeeWallet,
            launch.creatorAllocationBps,
            launch.netGraduationTarget
        );
    }

    function registerGraduation(
        address token,
        bytes32 wethPoolId,
        bytes32 hoodPoolId,
        address weth,
        address hood,
        address[] calldata systemAccounts
    ) external onlyRole(GRADUATOR_ROLE) {
        Launch storage launch = launches[token];
        if (!launch.registered) revert UnknownLaunch();
        if (launch.graduated) revert AlreadyRegistered();
        if (wethPoolId == bytes32(0) || hoodPoolId == bytes32(0)) {
            revert InvalidPool();
        }

        pools[wethPoolId] = Pool(token, weth, false, true);
        pools[hoodPoolId] = Pool(token, hood, true, true);
        launch.wethPoolId = wethPoolId;
        launch.hoodPoolId = hoodPoolId;
        launch.graduated = true;

        for (uint256 i; i < systemAccounts.length; ++i) {
            _exclude(token, systemAccounts[i], true);
        }

        emit Graduated(token, wethPoolId, hoodPoolId);
    }

    function setRewardExcluded(
        address token,
        address account,
        bool excluded
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (!launches[token].registered) revert UnknownLaunch();
        _exclude(token, account, excluded);
    }

    function _exclude(
        address token,
        address account,
        bool excluded
    ) internal {
        if (account == address(0)) return;
        rewardExcluded[token][account] = excluded;
        emit RewardExclusionSet(token, account, excluded);
    }
}
```

### 14.3 Per-launch fee and reward policy

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AccessControl} from
    "@openzeppelin/contracts/access/AccessControl.sol";
import {RaptorXTypes} from "./RaptorXTypes.sol";

contract FeeAndRewardPolicy is AccessControl {
    using RaptorXTypes for RaptorXTypes.FeeShares;

    bytes32 public constant PROPOSER_ROLE = keccak256("PROPOSER_ROLE");
    uint64 public constant MIN_DELAY = 48 hours;

    RaptorXTypes.FeeShares public defaultShares;
    RaptorXTypes.RewardConfig public defaultRewards;

    struct PendingShares {
        RaptorXTypes.FeeShares value;
        uint64 executeAfter;
        bool exists;
    }

    struct PendingRewards {
        RaptorXTypes.RewardConfig value;
        uint64 executeAfter;
        bool exists;
    }

    mapping(address token => RaptorXTypes.FeeShares)
        private _shareOverride;
    mapping(address token => bool) public hasShareOverride;
    mapping(address token => RaptorXTypes.RewardConfig)
        private _rewardOverride;
    mapping(address token => bool) public hasRewardOverride;

    mapping(address token => PendingShares) public pendingShares;
    mapping(address token => PendingRewards) public pendingRewards;

    error InvalidShares();
    error TooEarly();
    error NoPendingChange();
    error InvalidRewardConfig();

    event SharesProposed(
        address indexed token,
        uint64 executeAfter,
        RaptorXTypes.FeeShares shares
    );
    event SharesExecuted(
        address indexed token,
        RaptorXTypes.FeeShares shares
    );
    event RewardsProposed(
        address indexed token,
        uint64 executeAfter,
        RaptorXTypes.RewardConfig config
    );
    event RewardsExecuted(
        address indexed token,
        RaptorXTypes.RewardConfig config
    );

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PROPOSER_ROLE, admin);

        defaultShares = RaptorXTypes.FeeShares({
            creatorBps: 6000,
            raptorXBps: 2000,
            hoodRewardsBps: 1000,
            wethRewardsBps: 500,
            individualBps: 500
        });

        defaultRewards = RaptorXTypes.RewardConfig({
            minimumHolding: 500_000 ether,
            hoodTriggerUsdE18: 5_000 ether,
            wethTriggerUsdE18: 2_500 ether,
            hoodEnabled: true,
            wethEnabled: true,
            effectiveAt: uint64(block.timestamp),
            version: 1
        });
    }

    function sharesFor(address token)
        public
        view
        returns (RaptorXTypes.FeeShares memory)
    {
        return hasShareOverride[token]
            ? _shareOverride[token]
            : defaultShares;
    }

    function rewardsFor(address token)
        public
        view
        returns (RaptorXTypes.RewardConfig memory)
    {
        return hasRewardOverride[token]
            ? _rewardOverride[token]
            : defaultRewards;
    }

    function proposeShares(
        address token,
        RaptorXTypes.FeeShares calldata next
    ) external onlyRole(PROPOSER_ROLE) {
        _validateShares(next);
        pendingShares[token] = PendingShares({
            value: next,
            executeAfter: uint64(block.timestamp + MIN_DELAY),
            exists: true
        });
        emit SharesProposed(
            token,
            uint64(block.timestamp + MIN_DELAY),
            next
        );
    }

    function executeShares(address token) external {
        PendingShares memory pending = pendingShares[token];
        if (!pending.exists) revert NoPendingChange();
        if (block.timestamp < pending.executeAfter) revert TooEarly();

        _shareOverride[token] = pending.value;
        hasShareOverride[token] = true;
        delete pendingShares[token];
        emit SharesExecuted(token, pending.value);
    }

    function proposeRewards(
        address token,
        RaptorXTypes.RewardConfig calldata next
    ) external onlyRole(PROPOSER_ROLE) {
        if (
            next.minimumHolding == 0 ||
            next.hoodTriggerUsdE18 == 0 ||
            next.wethTriggerUsdE18 == 0
        ) revert InvalidRewardConfig();

        RaptorXTypes.RewardConfig memory versioned = next;
        versioned.effectiveAt = uint64(block.timestamp + MIN_DELAY);
        versioned.version = rewardsFor(token).version + 1;

        pendingRewards[token] = PendingRewards({
            value: versioned,
            executeAfter: uint64(block.timestamp + MIN_DELAY),
            exists: true
        });

        emit RewardsProposed(
            token,
            uint64(block.timestamp + MIN_DELAY),
            versioned
        );
    }

    function executeRewards(address token) external {
        PendingRewards memory pending = pendingRewards[token];
        if (!pending.exists) revert NoPendingChange();
        if (block.timestamp < pending.executeAfter) revert TooEarly();

        _rewardOverride[token] = pending.value;
        hasRewardOverride[token] = true;
        delete pendingRewards[token];
        emit RewardsExecuted(token, pending.value);
    }

    function _validateShares(
        RaptorXTypes.FeeShares calldata s
    ) internal pure {
        uint256 sum = uint256(s.creatorBps)
            + s.raptorXBps
            + s.hoodRewardsBps
            + s.wethRewardsBps
            + s.individualBps;

        if (
            sum != 10_000 ||
            s.creatorBps != 6000 ||
            s.individualBps != 500
        ) revert InvalidShares();
    }
}
```

### 14.4 Eligibility registry

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {AccessControl} from
    "@openzeppelin/contracts/access/AccessControl.sol";

contract EligibilityRegistry is EIP712, AccessControl {
    using ECDSA for bytes32;

    bytes32 public constant SIGNER_ADMIN_ROLE =
        keccak256("SIGNER_ADMIN_ROLE");
    bytes32 public constant ATTESTATION_TYPEHASH =
        keccak256(
            "Attestation(address wallet,bytes32 subjectHash,uint64 expiry,uint256 nonce,bool hoodEligible,bool autoRewards)"
        );

    address public eligibilitySigner;

    struct Credential {
        bytes32 subjectHash;
        uint64 eligibleUntil;
        bool autoRewards;
    }

    struct Attestation {
        address wallet;
        bytes32 subjectHash;
        uint64 expiry;
        uint256 nonce;
        bool hoodEligible;
        bool autoRewards;
    }

    mapping(address wallet => Credential) public credentials;
    mapping(address wallet => uint256) public nextNonce;

    error InvalidSignature();
    error InvalidNonce();
    error Expired();

    event CredentialUpdated(
        address indexed wallet,
        bytes32 indexed subjectHash,
        uint64 eligibleUntil,
        bool autoRewards
    );

    constructor(address admin, address signer)
        EIP712("RaptorX Eligibility and Rewards", "1")
    {
        eligibilitySigner = signer;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(SIGNER_ADMIN_ROLE, admin);
    }

    function register(
        Attestation calldata a,
        bytes calldata signature
    ) external {
        if (a.nonce != nextNonce[a.wallet]) revert InvalidNonce();
        if (a.hoodEligible && a.expiry <= block.timestamp) revert Expired();

        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    ATTESTATION_TYPEHASH,
                    a.wallet,
                    a.subjectHash,
                    a.expiry,
                    a.nonce,
                    a.hoodEligible,
                    a.autoRewards
                )
            )
        );

        if (digest.recover(signature) != eligibilitySigner) {
            revert InvalidSignature();
        }

        nextNonce[a.wallet] = a.nonce + 1;
        credentials[a.wallet] = Credential({
            subjectHash: a.subjectHash,
            eligibleUntil: a.hoodEligible ? a.expiry : 0,
            autoRewards: a.autoRewards
        });

        emit CredentialUpdated(
            a.wallet,
            a.subjectHash,
            a.hoodEligible ? a.expiry : 0,
            a.autoRewards
        );
    }

    function isHoodEligible(address wallet)
        external
        view
        returns (bool)
    {
        Credential memory c = credentials[wallet];
        return c.autoRewards && c.eligibleUntil >= block.timestamp;
    }

    function setSigner(address signer)
        external
        onlyRole(SIGNER_ADMIN_ROLE)
    {
        eligibilitySigner = signer;
    }
}
```

### 14.5 One-person/one-reward-wallet registry

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AccessControl} from
    "@openzeppelin/contracts/access/AccessControl.sol";

contract RewardWalletRegistry is AccessControl {
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");
    uint64 public constant MIGRATION_DELAY = 48 hours;

    struct Migration {
        address nextWallet;
        uint64 executeAfter;
    }

    mapping(bytes32 subjectHash => address wallet)
        public walletForSubject;
    mapping(address wallet => bytes32 subjectHash)
        public subjectForWallet;
    mapping(bytes32 subjectHash => Migration) public migrations;

    error SubjectUsed();
    error WalletUsed();
    error TooEarly();
    error NoMigration();

    event WalletRegistered(bytes32 indexed subjectHash, address wallet);
    event MigrationQueued(
        bytes32 indexed subjectHash,
        address oldWallet,
        address nextWallet,
        uint64 executeAfter
    );
    event MigrationExecuted(
        bytes32 indexed subjectHash,
        address oldWallet,
        address nextWallet
    );

    constructor(address admin, address issuer) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ISSUER_ROLE, issuer);
    }

    function register(bytes32 subjectHash, address wallet)
        external
        onlyRole(ISSUER_ROLE)
    {
        if (walletForSubject[subjectHash] != address(0)) {
            revert SubjectUsed();
        }
        if (subjectForWallet[wallet] != bytes32(0)) {
            revert WalletUsed();
        }

        walletForSubject[subjectHash] = wallet;
        subjectForWallet[wallet] = subjectHash;
        emit WalletRegistered(subjectHash, wallet);
    }

    function queueMigration(
        bytes32 subjectHash,
        address nextWallet
    ) external onlyRole(ISSUER_ROLE) {
        if (subjectForWallet[nextWallet] != bytes32(0)) {
            revert WalletUsed();
        }
        address oldWallet = walletForSubject[subjectHash];
        if (oldWallet == address(0)) revert SubjectUsed();

        uint64 executeAfter = uint64(block.timestamp + MIGRATION_DELAY);
        migrations[subjectHash] = Migration(nextWallet, executeAfter);
        emit MigrationQueued(
            subjectHash,
            oldWallet,
            nextWallet,
            executeAfter
        );
    }

    function executeMigration(bytes32 subjectHash) external {
        Migration memory m = migrations[subjectHash];
        if (m.nextWallet == address(0)) revert NoMigration();
        if (block.timestamp < m.executeAfter) revert TooEarly();

        address oldWallet = walletForSubject[subjectHash];
        delete subjectForWallet[oldWallet];
        walletForSubject[subjectHash] = m.nextWallet;
        subjectForWallet[m.nextWallet] = subjectHash;
        delete migrations[subjectHash];

        emit MigrationExecuted(subjectHash, oldWallet, m.nextWallet);
    }

    function isActive(address wallet) external view returns (bool) {
        bytes32 subject = subjectForWallet[wallet];
        return subject != bytes32(0)
            && walletForSubject[subject] == wallet;
    }
}
```

### 14.6 Fee splitter

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from
    "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from
    "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from
    "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {RaptorXTypes} from "./RaptorXTypes.sol";

interface IFeePolicy {
    function sharesFor(address token)
        external
        view
        returns (RaptorXTypes.FeeShares memory);
}

interface ISettlementAdapter {
    function settle(
        address sellToken,
        address buyToken,
        uint256 sellAmount,
        uint256 minimumBuyAmount,
        address target,
        bytes calldata data,
        uint256 deadline
    ) external returns (uint256 bought);
}

interface IEqualRewardsVault {
    function fund(address token, uint256 amount) external;
}

contract FeeSplitter is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant COLLECTOR_ROLE = keccak256("COLLECTOR_ROLE");

    IFeePolicy public immutable policy;
    ISettlementAdapter public immutable settlementAdapter;
    address public immutable weth;
    address public immutable hood;
    address public immutable raptorXWallet;
    address public immutable individualWallet;

    mapping(address token => address) public creatorWallet;

    struct RewardBalances {
        uint256 hoodInWeth;
        uint256 hoodDirect;
        uint256 weth;
    }

    mapping(address token => RewardBalances) public rewardBalances;

    error CreatorNotSet();
    error InvalidAmount();

    event FeeSplit(
        address indexed token,
        address indexed sourceFeeAsset,
        uint256 sourceFeeAmount,
        uint256 creatorWeth,
        uint256 raptorXWeth,
        uint256 hoodRewardAssetAmount,
        uint256 wethRewardAmount,
        uint256 individualWeth
    );
    event HoodObligationConverted(
        address indexed token,
        uint256 wethSold,
        uint256 hoodBought
    );
    event RewardVaultFunded(
        address indexed token,
        address indexed rewardAsset,
        address indexed vault,
        uint256 amount
    );

    constructor(
        address admin,
        address collector,
        address policy_,
        address settlementAdapter_,
        address weth_,
        address hood_,
        address raptorXWallet_,
        address individualWallet_
    ) {
        policy = IFeePolicy(policy_);
        settlementAdapter = ISettlementAdapter(settlementAdapter_);
        weth = weth_;
        hood = hood_;
        raptorXWallet = raptorXWallet_;
        individualWallet = individualWallet_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(COLLECTOR_ROLE, collector);
    }

    function setCreatorWallet(address token, address wallet)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        creatorWallet[token] = wallet;
    }

    function splitWethFee(
        address token,
        address weth,
        uint256 amount
    ) external onlyRole(COLLECTOR_ROLE) nonReentrant {
        if (amount == 0) revert InvalidAmount();
        address creator = creatorWallet[token];
        if (creator == address(0)) revert CreatorNotSet();

        IERC20(weth).safeTransferFrom(msg.sender, address(this), amount);
        RaptorXTypes.FeeShares memory s = policy.sharesFor(token);

        uint256 creatorAmount = amount * s.creatorBps / 10_000;
        uint256 raptorXAmount = amount * s.raptorXBps / 10_000;
        uint256 hoodAmount = amount * s.hoodRewardsBps / 10_000;
        uint256 wethAmount = amount * s.wethRewardsBps / 10_000;
        uint256 individualAmount = amount
            - creatorAmount
            - raptorXAmount
            - hoodAmount
            - wethAmount;

        IERC20(weth).safeTransfer(creator, creatorAmount);
        IERC20(weth).safeTransfer(raptorXWallet, raptorXAmount);
        IERC20(weth).safeTransfer(individualWallet, individualAmount);

        RewardBalances storage b = rewardBalances[token];
        b.hoodInWeth += hoodAmount;
        b.weth += wethAmount;

        emit FeeSplit(
            token,
            weth,
            amount,
            creatorAmount,
            raptorXAmount,
            hoodAmount,
            wethAmount,
            individualAmount
        );
    }

    function splitHoodFee(
        address token,
        uint256 amount,
        uint256 minimumWethOut,
        address approvedTarget,
        bytes calldata approvedConversion,
        uint256 deadline
    ) external onlyRole(COLLECTOR_ROLE) nonReentrant {
        if (amount == 0) revert InvalidAmount();
        address creator = creatorWallet[token];
        if (creator == address(0)) revert CreatorNotSet();

        IERC20(hood).safeTransferFrom(msg.sender, address(this), amount);
        RaptorXTypes.FeeShares memory s = policy.sharesFor(token);

        uint256 directHoodReward =
            amount * s.hoodRewardsBps / 10_000;
        uint256 hoodToConvert = amount - directHoodReward;

        rewardBalances[token].hoodDirect += directHoodReward;

        IERC20(hood).forceApprove(
            address(settlementAdapter),
            hoodToConvert
        );
        uint256 wethBought = settlementAdapter.settle(
            hood,
            weth,
            hoodToConvert,
            minimumWethOut,
            approvedTarget,
            approvedConversion,
            deadline
        );
        IERC20(hood).forceApprove(address(settlementAdapter), 0);

        uint256 nonHoodBps = uint256(s.creatorBps)
            + s.raptorXBps
            + s.wethRewardsBps
            + s.individualBps;

        uint256 creatorAmount =
            wethBought * s.creatorBps / nonHoodBps;
        uint256 raptorXAmount =
            wethBought * s.raptorXBps / nonHoodBps;
        uint256 wethRewardAmount =
            wethBought * s.wethRewardsBps / nonHoodBps;
        uint256 individualAmount = wethBought
            - creatorAmount
            - raptorXAmount
            - wethRewardAmount;

        IERC20(weth).safeTransfer(creator, creatorAmount);
        IERC20(weth).safeTransfer(raptorXWallet, raptorXAmount);
        IERC20(weth).safeTransfer(individualWallet, individualAmount);
        rewardBalances[token].weth += wethRewardAmount;

        emit FeeSplit(
            token,
            hood,
            amount,
            creatorAmount,
            raptorXAmount,
            directHoodReward,
            wethRewardAmount,
            individualAmount
        );
    }

    function convertHoodObligation(
        address token,
        uint256 wethAmount,
        uint256 minimumHoodOut,
        address approvedTarget,
        bytes calldata approvedConversion,
        uint256 deadline
    ) external onlyRole(COLLECTOR_ROLE) nonReentrant {
        RewardBalances storage b = rewardBalances[token];
        if (wethAmount == 0 || wethAmount > b.hoodInWeth) {
            revert InvalidAmount();
        }

        b.hoodInWeth -= wethAmount;
        IERC20(weth).forceApprove(
            address(settlementAdapter),
            wethAmount
        );
        uint256 hoodBought = settlementAdapter.settle(
            weth,
            hood,
            wethAmount,
            minimumHoodOut,
            approvedTarget,
            approvedConversion,
            deadline
        );
        IERC20(weth).forceApprove(address(settlementAdapter), 0);
        b.hoodDirect += hoodBought;

        emit HoodObligationConverted(
            token,
            wethAmount,
            hoodBought
        );
    }

    function fundHoodVault(
        address token,
        address vault,
        uint256 amount
    ) external onlyRole(COLLECTOR_ROLE) nonReentrant {
        RewardBalances storage b = rewardBalances[token];
        if (amount == 0 || amount > b.hoodDirect) {
            revert InvalidAmount();
        }
        b.hoodDirect -= amount;
        IERC20(hood).forceApprove(vault, amount);
        IEqualRewardsVault(vault).fund(token, amount);
        IERC20(hood).forceApprove(vault, 0);
        emit RewardVaultFunded(token, hood, vault, amount);
    }

    function fundWethVault(
        address token,
        address vault,
        uint256 amount
    ) external onlyRole(COLLECTOR_ROLE) nonReentrant {
        RewardBalances storage b = rewardBalances[token];
        if (amount == 0 || amount > b.weth) {
            revert InvalidAmount();
        }
        b.weth -= amount;
        IERC20(weth).forceApprove(vault, amount);
        IEqualRewardsVault(vault).fund(token, amount);
        IERC20(weth).forceApprove(vault, 0);
        emit RewardVaultFunded(token, weth, vault, amount);
    }
}
```

### 14.7 Generic equal-share reward vault

Deploy one instance for HOOD and one for WETH, or deploy one audited implementation behind two immutable proxies.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from
    "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MerkleProof} from
    "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {AccessControl} from
    "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from
    "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface ILaunchRegistryRewards {
    function rewardExcluded(address token, address account)
        external
        view
        returns (bool);
}

interface IRewardWalletRegistry {
    function isActive(address wallet) external view returns (bool);
}

interface IEligibility {
    function isHoodEligible(address wallet)
        external
        view
        returns (bool);
}

contract EqualShareRewardsVault is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant FUNDER_ROLE = keccak256("FUNDER_ROLE");
    bytes32 public constant ROUND_ROLE = keccak256("ROUND_ROLE");
    bytes32 public constant DISTRIBUTOR_ROLE =
        keccak256("DISTRIBUTOR_ROLE");

    enum RewardKind {
        WETH,
        HOOD
    }

    struct Round {
        bytes32 root;
        uint256 fundedAmount;
        uint256 equalPayout;
        uint256 minimumHolding;
        uint256 snapshotBlock;
        uint256 paidCount;
        uint256 qualifiedCount;
        uint32 policyVersion;
        bool opened;
        bool closed;
    }

    IERC20 public immutable rewardAsset;
    RewardKind public immutable rewardKind;
    ILaunchRegistryRewards public immutable launchRegistry;
    IRewardWalletRegistry public immutable walletRegistry;
    IEligibility public immutable eligibility;

    mapping(address token => uint256) public pending;
    mapping(address token => uint256) public rollover;
    mapping(address token => uint256) public nextRoundId;
    mapping(address token => mapping(uint256 id => Round)) public rounds;
    mapping(address token => mapping(uint256 id =>
        mapping(address wallet => bool))) public paid;

    error InvalidRound();
    error NotQualified();
    error AlreadyPaid();
    error WrongCohort();
    error InsufficientFunding();

    event Funded(address indexed token, uint256 amount);
    event RoundOpened(
        address indexed token,
        uint256 indexed roundId,
        bytes32 root,
        uint256 fundedAmount,
        uint256 equalPayout,
        uint256 qualifiedCount,
        uint256 snapshotBlock,
        uint32 policyVersion
    );
    event RewardPaid(
        address indexed token,
        uint256 indexed roundId,
        address indexed wallet,
        uint256 amount
    );
    event RoundClosed(
        address indexed token,
        uint256 indexed roundId,
        uint256 rolledOver
    );

    constructor(
        address admin,
        address asset,
        RewardKind kind,
        address launchRegistry_,
        address walletRegistry_,
        address eligibility_
    ) {
        rewardAsset = IERC20(asset);
        rewardKind = kind;
        launchRegistry = ILaunchRegistryRewards(launchRegistry_);
        walletRegistry = IRewardWalletRegistry(walletRegistry_);
        eligibility = IEligibility(eligibility_);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function fund(address token, uint256 amount)
        external
        onlyRole(FUNDER_ROLE)
    {
        rewardAsset.safeTransferFrom(msg.sender, address(this), amount);
        pending[token] += amount;
        emit Funded(token, amount);
    }

    function openRound(
        address token,
        bytes32 root,
        uint256 qualifiedCount,
        uint256 minimumHolding,
        uint256 snapshotBlock,
        uint32 policyVersion
    ) external onlyRole(ROUND_ROLE) returns (uint256 roundId) {
        if (
            root == bytes32(0) ||
            qualifiedCount == 0 ||
            minimumHolding == 0
        ) revert InvalidRound();

        uint256 funded = pending[token] + rollover[token];
        if (funded == 0) revert InsufficientFunding();

        uint256 equalPayout = funded / qualifiedCount;
        uint256 committed = equalPayout * qualifiedCount;

        pending[token] = 0;
        rollover[token] = funded - committed;

        roundId = nextRoundId[token]++;
        rounds[token][roundId] = Round({
            root: root,
            fundedAmount: committed,
            equalPayout: equalPayout,
            minimumHolding: minimumHolding,
            snapshotBlock: snapshotBlock,
            paidCount: 0,
            qualifiedCount: qualifiedCount,
            policyVersion: policyVersion,
            opened: true,
            closed: false
        });

        emit RoundOpened(
            token,
            roundId,
            root,
            committed,
            equalPayout,
            qualifiedCount,
            snapshotBlock,
            policyVersion
        );
    }

    function distribute(
        address token,
        uint256 roundId,
        address wallet,
        bytes32[] calldata proof
    ) external onlyRole(DISTRIBUTOR_ROLE) nonReentrant {
        Round storage round = rounds[token][roundId];
        if (!round.opened || round.closed) revert InvalidRound();
        if (paid[token][roundId][wallet]) revert AlreadyPaid();

        bytes32 leaf = keccak256(
            bytes.concat(
                keccak256(
                    abi.encode(
                        token,
                        roundId,
                        wallet,
                        round.equalPayout,
                        round.minimumHolding,
                        round.snapshotBlock,
                        round.policyVersion
                    )
                )
            )
        );
        if (!MerkleProof.verify(proof, round.root, leaf)) {
            revert NotQualified();
        }
        if (
            !walletRegistry.isActive(wallet) ||
            launchRegistry.rewardExcluded(token, wallet) ||
            IERC20(token).balanceOf(wallet) < round.minimumHolding
        ) revert NotQualified();

        bool hoodEligible = eligibility.isHoodEligible(wallet);
        if (
            (rewardKind == RewardKind.HOOD && !hoodEligible) ||
            (rewardKind == RewardKind.WETH && hoodEligible)
        ) revert WrongCohort();

        paid[token][roundId][wallet] = true;
        round.paidCount += 1;
        rewardAsset.safeTransfer(wallet, round.equalPayout);

        emit RewardPaid(token, roundId, wallet, round.equalPayout);
    }

    function closeRound(address token, uint256 roundId)
        external
        onlyRole(ROUND_ROLE)
    {
        Round storage round = rounds[token][roundId];
        if (!round.opened || round.closed) revert InvalidRound();

        uint256 unpaidCount = round.qualifiedCount - round.paidCount;
        uint256 unpaid = unpaidCount * round.equalPayout;
        round.closed = true;
        rollover[token] += unpaid;

        emit RoundClosed(token, roundId, unpaid);
    }
}
```

Production hardening:

- round closing must respect a minimum distribution window;
- batch failures must isolate one wallet rather than revert all payments;
- the root publisher and distributor must be separate roles;
- no admin withdrawal method;
- vault solvency must be continuously checked;
- eligibility policy for WETH cohort must distinguish restricted/unknown from revoked-malicious status.

### 14.8 Approved 0x settlement adapter

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from
    "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from
    "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from
    "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract ZeroXSettlementAdapter is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant SETTLER_ROLE = keccak256("SETTLER_ROLE");

    mapping(address => bool) public approvedTarget;
    mapping(address => bool) public approvedToken;

    error UnapprovedTarget();
    error UnapprovedToken();
    error Expired();
    error InsufficientOutput();
    error ExternalCallFailed();

    event Settled(
        address indexed sellToken,
        address indexed buyToken,
        uint256 sold,
        uint256 bought,
        address target
    );

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function setTarget(address target, bool approved)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        approvedTarget[target] = approved;
    }

    function setToken(address token, bool approved)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        approvedToken[token] = approved;
    }

    function settle(
        address sellToken,
        address buyToken,
        uint256 sellAmount,
        uint256 minimumBuyAmount,
        address target,
        bytes calldata data,
        uint256 deadline
    ) external onlyRole(SETTLER_ROLE) nonReentrant returns (uint256 bought) {
        if (!approvedTarget[target]) revert UnapprovedTarget();
        if (!approvedToken[sellToken] || !approvedToken[buyToken]) {
            revert UnapprovedToken();
        }
        if (block.timestamp > deadline) revert Expired();

        IERC20(sellToken).safeTransferFrom(
            msg.sender,
            address(this),
            sellAmount
        );
        IERC20(sellToken).forceApprove(target, sellAmount);

        uint256 beforeBalance = IERC20(buyToken).balanceOf(address(this));
        (bool ok,) = target.call(data);
        IERC20(sellToken).forceApprove(target, 0);
        if (!ok) revert ExternalCallFailed();

        bought = IERC20(buyToken).balanceOf(address(this))
            - beforeBalance;
        if (bought < minimumBuyAmount) revert InsufficientOutput();

        IERC20(buyToken).safeTransfer(msg.sender, bought);
        IERC20(sellToken).safeTransfer(
            msg.sender,
            IERC20(sellToken).balanceOf(address(this))
        );

        emit Settled(
            sellToken,
            buyToken,
            sellAmount,
            bought,
            target
        );
    }
}
```

Never approve arbitrary calldata targets directly from a frontend quote.

### 14.9 Arbitrage executor

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from
    "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from
    "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from
    "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IRaptorXArbRouter {
    function executeApprovedCycle(
        address marketToken,
        bool wethIsCheap,
        uint256 amountIn,
        uint256 minimumFinalWeth,
        bytes calldata zeroXData
    ) external returns (uint256 finalWeth);
}

contract ArbitrageExecutor is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");

    IERC20 public immutable weth;
    IRaptorXArbRouter public immutable router;

    error NoProfit();
    error InvalidRecipient();

    event Arbitraged(
        address indexed marketToken,
        bool wethWasCheap,
        uint256 amountIn,
        uint256 finalWeth,
        uint256 profit
    );

    constructor(
        address admin,
        address keeper,
        address weth_,
        address router_
    ) {
        weth = IERC20(weth_);
        router = IRaptorXArbRouter(router_);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(KEEPER_ROLE, keeper);
    }

    function execute(
        address marketToken,
        bool wethIsCheap,
        uint256 amountIn,
        uint256 minProfit,
        bytes calldata zeroXData
    ) external onlyRole(KEEPER_ROLE) nonReentrant {
        uint256 beforeBalance = weth.balanceOf(address(this));
        if (amountIn > beforeBalance) amountIn = beforeBalance;

        weth.forceApprove(address(router), amountIn);
        uint256 finalWeth = router.executeApprovedCycle(
            marketToken,
            wethIsCheap,
            amountIn,
            amountIn + minProfit,
            zeroXData
        );
        weth.forceApprove(address(router), 0);

        uint256 afterBalance = weth.balanceOf(address(this));
        if (
            afterBalance < beforeBalance + minProfit ||
            finalWeth < amountIn + minProfit
        ) revert NoProfit();

        emit Arbitraged(
            marketToken,
            wethIsCheap,
            amountIn,
            finalWeth,
            afterBalance - beforeBalance
        );
    }
}
```

### 14.10 Universal hook responsibilities

The production `RaptorXUniversalHook` must:

1. accept swaps only from the RaptorX Swap router and approved keeper executor;
2. identify the registered launch and rail from the pool ID;
3. enforce current HOOD eligibility on HOOD-facing user routes;
4. calculate exactly 1% of quote-side notional;
5. send fees to FeeCollector;
6. exempt or atomically rebate only the registered ArbitrageExecutor;
7. emit normalized trade metadata for RexScreener;
8. reject unregistered pools and arbitrary hook data;
9. never let a user spoof keeper status;
10. never let a router reinterpret an XXX amount as quote-side fee notional.

Illustrative hook data:

```solidity
struct HookTradeContext {
    address trader;
    address marketToken;
    uint8 rail; // 0 WETH, 1 HOOD
    bool isBuy;
    bool isKeeperCycle;
    uint256 quoteNotional;
    uint256 quoteNonce;
    uint256 deadline;
    bytes quoteSignature;
}
```

The hook must validate that `quoteNotional` matches actual balance deltas. Never trust a frontend-supplied number without reconciling it to pool accounting.

### 14.11 Protected split-routing algorithm

The quote service finds the largest HOOD leg whose simulated impact is at or below the user-signed ceiling. It uses binary search because V4 concentrated-liquidity impact is not linear.

```ts
type Simulation = {
  amountIn: bigint;
  amountOut: bigint;
  impactBps: number;
};

async function maximumSafeHoodLeg(input: {
  totalAmountIn: bigint;
  maximumImpactBps: number;
  simulateHood: (amountIn: bigint) => Promise<Simulation>;
}): Promise<bigint> {
  const full = await input.simulateHood(input.totalAmountIn);
  if (full.impactBps <= input.maximumImpactBps) {
    return input.totalAmountIn;
  }

  let low = 0n;
  let high = input.totalAmountIn;

  for (let iteration = 0; iteration < 64 && low < high; iteration++) {
    const mid = (low + high + 1n) / 2n;
    const quote = await input.simulateHood(mid);

    if (quote.impactBps <= input.maximumImpactBps) {
      low = mid;
    } else {
      high = mid - 1n;
    }
  }

  return low;
}

async function buildProtectedQuote(request: QuoteRequest) {
  const credential = await eligibilityFor(request.wallet);
  if (!credential.hoodEligible) {
    return signWethOnlyQuote(request);
  }

  const hoodAmountIn = await maximumSafeHoodLeg({
    totalAmountIn: request.amountIn,
    maximumImpactBps: request.maximumImpactBps,
    simulateHood: (amount) => simulateRail("HOOD", request, amount),
  });
  const wethAmountIn = request.amountIn - hoodAmountIn;

  const [hood, weth] = await Promise.all([
    hoodAmountIn > 0n
      ? simulateRail("HOOD", request, hoodAmountIn)
      : emptySimulation(),
    wethAmountIn > 0n
      ? simulateRail("WETH", request, wethAmountIn)
      : emptySimulation(),
  ]);

  const expectedOut = hood.amountOut + weth.amountOut;
  const minimumOut =
    expectedOut * BigInt(10_000 - request.slippageBps) / 10_000n;

  return signQuote({
    wallet: request.wallet,
    token: request.token,
    cohort: "HOOD",
    hoodAmountIn,
    wethAmountIn,
    expectedOut,
    minimumOut,
    maximumImpactBps: request.maximumImpactBps,
    nonce: await nextQuoteNonce(request.wallet),
    deadline: Math.floor(Date.now() / 1000) + 45,
  });
}
```

Onchain execution:

```solidity
function executeSplitBuy(
    SignedDualRailQuote calldata q,
    bytes calldata signature
) external nonReentrant returns (uint256 totalOut) {
    _verifyQuote(q, signature);
    _consumeNonce(q.trader, q.nonce);
    require(block.timestamp <= q.deadline, "QUOTE_EXPIRED");
    require(q.trader == msg.sender, "WRONG_TRADER");

    if (q.hoodAmountIn > 0) {
        require(
            eligibilityRegistry.isHoodEligible(msg.sender),
            "HOOD_INELIGIBLE"
        );
        totalOut += _swapHoodLeg(q);
    }

    if (q.wethAmountIn > 0) {
        totalOut += _swapWethLeg(q);
    }

    require(totalOut >= q.minimumTokenOut, "MINIMUM_OUT");
    IERC20(q.marketToken).safeTransfer(msg.sender, totalOut);
}
```

The router executes both legs inside one transaction. If either leg or the aggregate minimum output fails, the entire trade reverts.

---

## 15. Factory and graduation pseudocode

```solidity
function createAndBuy(LaunchParams calldata p)
    external
    payable
    nonReentrant
    returns (address token)
{
    require(p.creatorAllocationBps <= 9_500, "MAX_95_PERCENT");
    require(
        p.netGraduationTarget >= 2 ether &&
        p.netGraduationTarget <= 32 ether,
        "GRADUATION_RANGE"
    );
    require(block.timestamp <= p.deadline, "EXPIRED");

    token = address(new LaunchToken(
        p.name,
        p.symbol,
        address(this),
        address(this)
    ));

    address curve = _deployCurve(token, p.netGraduationTarget);

    uint256 tokenOut =
        1_000_000_000 ether * p.creatorAllocationBps / 10_000;
    uint256 netQuote = IBondingCurve(curve)
        .quoteBuyExactTokens(tokenOut);
    uint256 grossQuote = _grossUpForOnePercent(netQuote);

    require(msg.value >= grossQuote, "INSUFFICIENT_ETH");
    require(tokenOut >= p.minimumCreatorTokenOut, "SLIPPAGE");

    _wrapEth(grossQuote);
    _collectAndSplitFee(token, grossQuote - netQuote);
    _buyExactTokens(curve, netQuote, tokenOut);
    IERC20(token).transfer(p.allocationWallet, tokenOut);

    registry.registerLaunch(_launchRecord(p, token, curve));

    if (IBondingCurve(curve).netRaised() >= p.netGraduationTarget) {
        graduationManager.graduate(token);
    }

    _refundEth(msg.sender, msg.value - grossQuote);
}
```

Graduation:

```solidity
function graduate(address token) external nonReentrant {
    Launch memory launch = registry.launches(token);
    require(!launch.graduated, "ALREADY_GRADUATED");
    require(
        IBondingCurve(launch.curve).netRaised()
            >= launch.netGraduationTarget,
        "TARGET_NOT_MET"
    );
    require(
        IBondingCurve(launch.curve).saleInventoryRemaining() == 0,
        "CURVE_INVENTORY_REMAINS"
    );

    (uint256 reservedXXX, uint256 totalWeth) =
        IBondingCurve(launch.curve).closeAndSweep();
    require(reservedXXX == 50_000_000 ether, "BAD_POOL_RESERVE");

    uint256 wethForWethPool = totalWeth / 2;
    uint256 wethToConvert = totalWeth - wethForWethPool;

    uint256 minimumHood = oracleRouter.minimumHoodOut(
        wethToConvert,
        graduationSlippageBps
    );
    uint256 hoodForHoodPool = settlementAdapter.settle(
        WETH,
        HOOD,
        wethToConvert,
        minimumHood,
        approvedTarget,
        approvedQuoteData,
        quoteDeadline
    );

    uint256 xxxForWethPool = reservedXXX / 2;
    uint256 xxxForHoodPool = reservedXXX - xxxForWethPool;
    uint256 canonicalStartPrice = curveTerminalPriceUsd(token);

    bytes32 wethPool = _createAndSeedPool(
        token,
        WETH,
        xxxForWethPool,
        wethForWethPool,
        canonicalStartPrice
    );
    bytes32 hoodPool = _createAndSeedPool(
        token,
        HOOD,
        xxxForHoodPool,
        hoodForHoodPool,
        canonicalStartPrice
    );

    _assertNormalizedStartPricesMatch(
        wethPool,
        hoodPool,
        maximumInitializationDeviationBps
    );

    _lockBothPositionsForever(wethPool, hoodPool);
    _registerAllSystemAccounts(token, wethPool, hoodPool);
    _activateRaptorXSwap(token);
    _activateRexScreener(token);
    _activateKeeper(token);
}
```

---

## 16. Offchain services

### 16.1 Service inventory

| Service | Responsibility |
| --- | --- |
| Eligibility service | location prefilter, approved verification, pseudonymous subject, signed wallet credential |
| Quote engine | dual-pool simulation, HOOD-first protected split, signed quote |
| Fee settlement keeper | batch WETH/HOOD conversions and fund both reward vaults |
| Holder indexer | finalized balances, exclusions, cohort membership |
| Reward-round builder | roots, equal payout, policy freeze |
| Automatic distributor | batch payouts and retry isolation |
| Arb keeper | divergence detection, sizing, 0x quote, executor submission |
| RexScreener indexer | events, canonical ticks, candles, metrics, REST/WebSocket |
| Monitoring | solvency, staleness, divergence, failures, policy changes |

### 16.2 Fee settlement keeper

```ts
type LaunchRewardState = {
  token: `0x${string}`;
  hoodEscrowWeth: bigint;
  hoodDirect: bigint;
  wethRewards: bigint;
  hoodTriggerUsdE18: bigint;
  wethTriggerUsdE18: bigint;
};

async function settleLaunchRewards(state: LaunchRewardState) {
  if (state.hoodEscrowWeth > 0n) {
    const quote = await zeroX.getFirmQuote({
      chainId: 4663,
      sellToken: addresses.WETH,
      buyToken: addresses.HOOD,
      sellAmount: state.hoodEscrowWeth,
      taker: addresses.ZERO_X_SETTLEMENT_ADAPTER,
    });

    assertApprovedTarget(quote.to);
    assertNotExpired(quote.expiry);
    assertMinimumOutput(quote.buyAmount, oracleFloor(quote));

    await settlementAdapter.settle(
      addresses.WETH,
      addresses.HOOD,
      state.hoodEscrowWeth,
      oracleFloor(quote),
      quote.to,
      quote.data,
      quote.expiry,
    );
  }

  await fundVaultsForLaunch(state.token);
}
```

Trigger checks use USD oracle value, but the opened round freezes the actual reward-asset amount.

### 16.3 Holder snapshot

```ts
type Cohort = "HOOD" | "WETH";

type QualifiedHolder = {
  wallet: `0x${string}`;
  subjectHash: `0x${string}`;
  balance: bigint;
  cohort: Cohort;
};

async function qualifiedHolders(
  token: `0x${string}`,
  snapshotBlock: bigint,
  minimumHolding: bigint,
): Promise<QualifiedHolder[]> {
  const holders = await balancesAtFinalizedBlock(token, snapshotBlock);
  const output: QualifiedHolder[] = [];
  const seenSubjects = new Set<string>();

  for (const holder of holders) {
    if (holder.balance < minimumHolding) continue;
    if (await registry.rewardExcluded(token, holder.wallet)) continue;
    if (!(await rewardWalletRegistry.isActive(holder.wallet))) continue;

    const credential = await eligibility.credential(holder.wallet);
    if (!credential.autoRewards) continue;
    if (seenSubjects.has(credential.subjectHash)) continue;

    const hoodEligible =
      credential.eligibleUntil >= Math.floor(Date.now() / 1000);

    output.push({
      wallet: holder.wallet,
      subjectHash: credential.subjectHash,
      balance: holder.balance,
      cohort: hoodEligible ? "HOOD" : "WETH",
    });
    seenSubjects.add(credential.subjectHash);
  }

  return output;
}
```

### 16.4 Equal-share root

```ts
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";

type RoundInput = {
  token: `0x${string}`;
  roundId: bigint;
  snapshotBlock: bigint;
  policyVersion: number;
  minimumHolding: bigint;
  fundedAmount: bigint;
  wallets: `0x${string}`[];
};

function buildEqualRound(input: RoundInput) {
  if (input.wallets.length === 0) throw new Error("NO_QUALIFIED_WALLETS");

  const payout = input.fundedAmount / BigInt(input.wallets.length);
  const committed = payout * BigInt(input.wallets.length);
  const rollover = input.fundedAmount - committed;

  const values = input.wallets.map((wallet) => [
    input.token,
    input.roundId,
    wallet,
    payout,
    input.minimumHolding,
    input.snapshotBlock,
    input.policyVersion,
  ]);

  const tree = StandardMerkleTree.of(values, [
    "address",
    "uint256",
    "address",
    "uint256",
    "uint256",
    "uint256",
    "uint32",
  ]);

  return {
    root: tree.root,
    payout,
    committed,
    rollover,
    tree,
  };
}
```

### 16.5 Automatic distributor

```ts
async function distributeRound(round: OpenRound) {
  for (const recipient of round.recipients) {
    try {
      const stillQualified = await preflightRecipient(round, recipient);
      if (!stillQualified) {
        await markForRollover(round, recipient);
        continue;
      }

      await rewardsVault.distribute(
        round.token,
        round.id,
        recipient.wallet,
        recipient.proof,
      );
    } catch (error) {
      await recordIsolatedFailure(round, recipient, error);
      // Continue; never fail the entire batch because one wallet failed.
    }
  }
}
```

### 16.6 Arbitrage keeper

```ts
type MarketState = {
  token: `0x${string}`;
  wethPriceUsdE18: bigint;
  hoodPriceUsdE18: bigint;
  wethUsableLiquidityUsdE18: bigint;
  hoodUsableLiquidityUsdE18: bigint;
};

async function arbMarket(state: MarketState) {
  const divergenceBps = calculateDivergenceBps(
    state.wethPriceUsdE18,
    state.hoodPriceUsdE18,
  );

  const direction =
    state.wethPriceUsdE18 < state.hoodPriceUsdE18
      ? "WETH_CHEAP"
      : "HOOD_CHEAP";

  const candidate = await findLargestProfitableSize({
    state,
    direction,
    maximumInput: await executor.availableWeth(),
    includeGas: true,
    includeZeroXSpread: true,
    includeSlippage: true,
    includeRaptorXKeeperFee: false,
  });

  if (!candidate || candidate.expectedProfit <= candidate.minimumProfit) return;
  if (divergenceBps < candidate.breakEvenBps) return;

  const quote = await getRequiredZeroXQuote(candidate);
  await executor.execute(
    state.token,
    direction === "WETH_CHEAP",
    candidate.amountIn,
    candidate.minimumProfit,
    quote.data,
  );
}

async function convergeOverSeveralCycles(token: `0x${string}`) {
  for (let cycle = 0; cycle < 8; cycle++) {
    const state = await loadMarketState(token);
    const before = calculateDivergenceBps(
      state.wethPriceUsdE18,
      state.hoodPriceUsdE18,
    );
    if (before <= configuredTargetBps(token)) return;

    const executed = await arbMarket(state);
    if (!executed) return;
  }
}
```

---

## 17. RexScreener implementation

### 17.1 Event ingestion

Index:

- `LaunchRegistered`;
- bonding-curve buys and sells;
- `Graduated`;
- both V4 pool initialize events;
- both pool swaps;
- liquidity/position events;
- fee-split events;
- reward funding, round, and payout events;
- developer-allocation transfer;
- ownership transfers.

Use confirmed blocks and retain reorg-safe block hashes.

### 17.2 Suggested database

```sql
create table launches (
  token bytea primary key,
  curve bytea not null,
  weth_pool_id bytea,
  hood_pool_id bytea,
  allocation_wallet bytea not null,
  creator_fee_wallet bytea not null,
  creator_allocation_bps integer not null,
  net_graduation_target numeric(78,0) not null,
  graduated boolean not null default false,
  created_block bigint not null,
  graduated_block bigint
);

create table swaps (
  chain_id bigint not null,
  tx_hash bytea not null,
  log_index integer not null,
  token bytea not null,
  pool_id bytea not null,
  rail text not null check (rail in ('WETH', 'HOOD')),
  trader bytea,
  token_delta numeric(78,0) not null,
  quote_delta numeric(78,0) not null,
  quote_usd_e18 numeric(78,0) not null,
  normalized_price_usd_e18 numeric(78,0) not null,
  block_number bigint not null,
  block_time timestamptz not null,
  primary key (chain_id, tx_hash, log_index)
);

create table canonical_ticks (
  token bytea not null,
  block_number bigint not null,
  timestamp timestamptz not null,
  weth_price_usd_e18 numeric(78,0),
  hood_price_usd_e18 numeric(78,0),
  canonical_price_usd_e18 numeric(78,0) not null,
  weth_weight_bps integer not null,
  hood_weight_bps integer not null,
  divergence_bps integer not null,
  primary key (token, block_number)
);

create table candles (
  token bytea not null,
  interval text not null,
  bucket timestamptz not null,
  open_usd_e18 numeric(78,0) not null,
  high_usd_e18 numeric(78,0) not null,
  low_usd_e18 numeric(78,0) not null,
  close_usd_e18 numeric(78,0) not null,
  volume_usd_e18 numeric(78,0) not null,
  primary key (token, interval, bucket)
);

create table reward_status (
  token bytea not null,
  reward_asset text not null check (reward_asset in ('WETH', 'HOOD')),
  pending_amount numeric(78,0) not null,
  pending_usd_e18 numeric(78,0) not null,
  trigger_usd_e18 numeric(78,0) not null,
  estimated_qualified integer not null,
  estimated_payout_usd_e18 numeric(78,0) not null,
  updated_at timestamptz not null,
  primary key (token, reward_asset)
);
```

### 17.3 Canonical pricing engine

```ts
type RailObservation = {
  priceUsdE18: bigint;
  usableLiquidityUsdE18: bigint;
  observedAt: number;
  stale: boolean;
};

function canonicalPrice(
  weth: RailObservation,
  hood: RailObservation,
  now: number,
): {
  priceUsdE18: bigint;
  wethWeightBps: number;
  hoodWeightBps: number;
} {
  if (weth.stale || now - weth.observedAt > 90) {
    throw new Error("WETH_OBSERVATION_UNAVAILABLE");
  }

  if (
    hood.stale ||
    now - hood.observedAt > 90 ||
    hood.usableLiquidityUsdE18 === 0n
  ) {
    return {
      priceUsdE18: weth.priceUsdE18,
      wethWeightBps: 10_000,
      hoodWeightBps: 0,
    };
  }

  const wethWeight = cappedUsableLiquidity(weth);
  const hoodWeight = cappedUsableLiquidity(hood);
  const total = wethWeight + hoodWeight;

  const price =
    (weth.priceUsdE18 * wethWeight + hood.priceUsdE18 * hoodWeight) /
    total;

  return {
    priceUsdE18: price,
    wethWeightBps: Number((wethWeight * 10_000n) / total),
    hoodWeightBps: Number((hoodWeight * 10_000n) / total),
  };
}
```

### 17.4 REST and WebSocket

```text
GET /v1/launches
GET /v1/launches/:token
GET /v1/launches/:token/candles?interval=1m&from=&to=
GET /v1/launches/:token/trades
GET /v1/launches/:token/holders
GET /v1/launches/:token/rewards
GET /v1/launches/:token/rails
GET /v1/launches/:token/arbitrage

WS /v1/stream
  price.tick
  trade
  liquidity
  reward.progress
  reward.round
  graduation
```

### 17.5 Lightweight Charts component

```tsx
import {
  AreaSeries,
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef } from "react";

type Candle = {
  time: UTCTimestamp;
  value: number;
};

export function RexPriceChart({
  history,
  streamUrl,
}: {
  history: Candle[];
  streamUrl: string;
}) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;

    const chart: IChartApi = createChart(container.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#151515" },
        textColor: "#B8B8B8",
      },
      grid: {
        vertLines: { color: "#232323" },
        horzLines: { color: "#232323" },
      },
      rightPriceScale: { borderColor: "#303030" },
      timeScale: { borderColor: "#303030", timeVisible: true },
    });

    const series: ISeriesApi<"Area"> = chart.addSeries(AreaSeries, {
      lineColor: "#C9FF38",
      topColor: "rgba(201, 255, 56, 0.35)",
      bottomColor: "rgba(201, 255, 56, 0.02)",
      lineWidth: 2,
    });

    series.setData(history);

    const ws = new WebSocket(streamUrl);
    ws.onmessage = (event) => {
      const tick = JSON.parse(event.data);
      if (tick.type === "price.tick") {
        series.update({
          time: tick.timestamp as UTCTimestamp,
          value: Number(tick.canonicalPriceUsd),
        });
      }
    };

    const observer = new ResizeObserver(() => {
      chart.timeScale().fitContent();
    });
    observer.observe(container.current);

    return () => {
      observer.disconnect();
      ws.close();
      chart.remove();
    };
  }, [history, streamUrl]);

  return <div ref={container} className="h-[440px] w-full" />;
}
```

Keep TradingView attribution required by the installed Lightweight Charts license.

---

## 18. Launch UI calculations

```ts
const BPS = 10_000n;
const ONE_PERCENT_BPS = 100n;
const TOTAL_SUPPLY = 1_000_000_000n * 10n ** 18n;
const CURVE_SALE_CAP = 950_000_000n * 10n ** 18n;
const DUAL_POOL_RESERVE = 50_000_000n * 10n ** 18n;

export function creatorTokens(allocationBps: bigint) {
  if (allocationBps > 9_500n) throw new Error("MAX_95_PERCENT");
  return (TOTAL_SUPPLY * allocationBps) / BPS;
}

export function grossFromNet(netWei: bigint) {
  return (netWei * BPS + (BPS - ONE_PERCENT_BPS - 1n)) /
    (BPS - ONE_PERCENT_BPS);
}

export function feeFromGross(grossWei: bigint) {
  return (grossWei * ONE_PERCENT_BPS) / BPS;
}

export function launchPreview(input: {
  allocationBps: bigint;
  quotedNetEthWei: bigint;
  netGraduationTargetWei: bigint;
}) {
  const gross = grossFromNet(input.quotedNetEthWei);
  const fee = gross - input.quotedNetEthWei;

  return {
    creatorTokenAmount: creatorTokens(input.allocationBps),
    publicCurveTokenAmount:
      CURVE_SALE_CAP - creatorTokens(input.allocationBps),
    dualPoolReserveAmount: DUAL_POOL_RESERVE,
    grossEthWei: gross,
    feeEthWei: fee,
    netCurveEthWei: input.quotedNetEthWei,
    reachesGraduation:
      input.quotedNetEthWei >= input.netGraduationTargetWei,
  };
}
```

Minimal launch-form state:

```ts
type LaunchForm = {
  name: string;
  symbol: string;
  description: string;
  image: File | null;
  xUrl?: string;
  telegramUrl?: string;
  allocationWallet: `0x${string}`;
  creatorFeeWallet: `0x${string}`;
  creatorAllocationBps: number; // 0..9500
  graduationMode: "STANDARD" | "ADVANCED";
  netGraduationEth: number; // 2..4 or 4..32
};
```

---

## 19. Security invariants

### 19.1 Launch and graduation

- Total supply always equals 1B.
- Creator allocation cannot exceed 95%.
- One allocation wallet receives the full creator allocation.
- `createAndBuy()` is atomic.
- Refund cannot be redirected.
- Net graduation target is measured after fee.
- Graduation cannot be run twice.
- Both pools initialize at matching normalized prices within a tight tolerance.
- Graduation reverts if 0x/RFQ, oracle, pool creation, or LP lock fails.
- LP cannot be withdrawn.

### 19.2 Fees

- Ordinary buy/sell fee equals exactly 1% of quote-side notional.
- Fee shares sum to 10,000 bps of the collected fee.
- Creator is exactly 6,000 bps; individual exactly 500 bps.
- No XXX is sold merely to fund fees.
- Each fee belongs to one token and one ledger.
- No cross-launch netting.
- Keeper exemption is limited to registered profitable cycles.
- Fee policy updates affect future fees only.

### 19.3 Routing

- Restricted/unknown users cannot route through HOOD.
- Eligible HOOD leg never exceeds the signed impact ceiling.
- Aggregate minimum output is enforced.
- Split trades are atomic.
- Quote nonce and deadline prevent replay.
- Pool IDs must belong to the same launch.

### 19.4 Rewards

- Reward asset is immutable per vault.
- Minimum holding checked at snapshot and payment.
- Cohorts are mutually exclusive.
- Allocation and creator-fee wallets are excluded.
- One subject has one active reward wallet.
- Equal payout is frozen per round.
- Governance cannot replace a root after payouts begin.
- No recipient can be paid twice.
- Unpaid balance rolls to the same token and asset.
- No admin withdrawal.
- Vault assets are always greater than or equal to pending plus committed obligations.

### 19.5 Oracles and market data

- Feed freshness is enforced.
- Sequencer status is checked where required.
- HOOD fallback cannot make the entire app unavailable.
- Canonical price never chooses the higher rail by definition.
- 24h volume deduplicates logs by chain, transaction hash, and log index.
- ATH uses canonical confirmed ticks.

### 19.6 Operations

- Safe and timelock control privileged policy.
- Signer rotation is documented.
- 0x targets and tokens are allowlisted.
- Approvals are exact and reset after use.
- Keeper keys have limited roles and capped funds.
- Pause modes do not permit confiscation.
- Every policy and emergency action emits an event.

---

## 20. Required tests

### 20.1 Unit tests

- allocation sliders at 0%, 50%, 90%, and 95%;
- gross-up math for 1%;
- 32 ETH gross and 32 ETH net cases;
- atomic create-and-buy refund;
- creator and allocation-wallet exclusions;
- fee split exactness and rounding;
- policy proposal and 48-hour execution;
- immutable active reward round;
- cohort exclusivity;
- equal payout at 500K and 10M holdings;
- 499,999 holder rejection;
- snapshot/pass then pre-payment/fail rollover;
- stale credential fallback to WETH;
- root proof and double-payment rejection;
- keeper exemption rejection for ordinary caller;
- keeper no-profit reversion.

### 20.2 Integration tests

- curve to 2 ETH graduation;
- curve to 4 ETH graduation;
- advanced 32 ETH graduation;
- 50/50 normalized pool initialization;
- HOOD conversion through mocked RFQ;
- graduation rollback on settlement failure;
- restricted WETH-only buy and sell;
- eligible HOOD-only small trade;
- eligible split whale trade;
- 1% pre-grad and post-grad fee;
- both reward assets funded from both rail types;
- default triggers open at $5K/$2.5K;
- automatic batch payout with one failing recipient;
- multi-cycle keeper convergence;
- RexScreener combined volume and canonical candles.

### 20.3 Fuzz and invariant tests

- fee conservation under random trade sizes;
- reward solvency across random rounds and rollovers;
- no cross-launch accounting;
- no creator reward leakage;
- pool price initialization under oracle decimal variations;
- routing minimum-output conservation;
- arbitrary RFQ calldata cannot bypass allowlist;
- repeated arb cannot reduce executor WETH below start;
- canonical weights always sum to 10,000 bps;
- reorg replay does not duplicate RexScreener volume.

### 20.4 Adversarial tests

- flash-loan manipulation of one pool;
- stale HOOD feed;
- sequencer downtime;
- malicious ERC20 callback;
- compromised quote signer;
- subject/wallet Sybil attempt;
- wallet migration during a round;
- creator allocation equals 95%;
- whale trade exceeds keeper float;
- 0x target replacement;
- fee-exempt route called by user;
- Merkle root with excluded wallet.

---

## 21. Monitoring

### 21.1 Market health

- WETH and HOOD normalized price;
- divergence bps;
- usable liquidity by rail;
- swap failure rate;
- eligible split-route rate;
- average and p95 price impact;
- keeper opportunity, execution, and profit;
- keeper float and gas reserve;
- RFQ availability and minimum notional.

### 21.2 Fee health

- total fees by launch;
- creator/RaptorX/individual transfers;
- HOOD obligation in WETH;
- direct HOOD;
- WETH reward balance;
- settlement slippage;
- accounting delta;
- failed conversions.

### 21.3 Reward health

- pending versus trigger per asset;
- estimated qualified wallets;
- estimated per-wallet amount;
- average days to trigger;
- open rounds;
- payout success/failure/rollover;
- vault solvency;
- excluded-wallet detection;
- credential expiration.

### 21.4 RexScreener health

- indexer lag;
- reorg depth;
- oracle staleness;
- missing candles;
- WebSocket delay;
- canonical fallback state;
- divergence alerts;
- duplicate-event rejection.

Alert immediately when:

- fee accounting is non-zero after reconciliation;
- reward solvency falls below obligations;
- keeper float falls below minimum;
- rail divergence persists above policy;
- an unapproved 0x target appears;
- an excluded wallet enters a root;
- LP lock cannot be proven;
- canonical pricing enters fallback for too long.

---

## 22. Deployment plan

### Phase 0 — written approvals

- confirm canonical HOOD token and oracle;
- obtain written pool and reward guidance;
- define approved eligibility source;
- confirm vault, keeper, and MM requirements;
- confirm corporate-action and token-migration procedures;
- confirm 0x/Tokka integration and minimum RFQ size.

### Phase 1 — local and fork tests

- pin Robinhood Chain/V4 dependencies;
- deploy local mocks;
- run all unit, integration, invariant, and adversarial tests;
- validate 2, 4, and 32 ETH graduation;
- validate RexScreener event pipeline;
- complete first independent audit.

### Phase 2 — testnet or controlled mainnet pilot

- one RaptorX-controlled launch;
- conservative 2 ETH target;
- 0.5 WETH keeper float plus gas;
- strict trade caps;
- reward accrual enabled;
- distribution either disabled or limited to approved test participants;
- monitor at least one full round per asset.

### Phase 3 — eligible HOOD activation

- enable production eligibility;
- enable HOOD-first routing;
- enable automatic HOOD distributions;
- open MM/searcher feed;
- publish pool and reward transparency in RexScreener.

### Phase 4 — factory-wide launch

- enforce dual-rail graduation for every launch;
- retain 1% fee across curve and RaptorX Swap;
- enable per-project reward triggers;
- expand keeper/MM capacity based on graduation target;
- continue audits and bug bounty.

---

## 23. What RaptorX needs from 0x

Request:

1. Production Swap API access on Robinhood Chain `4663`.
2. Canonical HOOD RFQ liquidity.
3. Same-chain WETH/HOOD and WETH/USDG/HOOD executable paths.
4. Firm exact-input quotes for the approved settlement adapter as taker.
5. Supported allowance and settlement targets.
6. Quote expiry and market-availability semantics.
7. Practical minimum and maximum RFQ notionals.
8. Batch frequency and API-rate limits.
9. Tokka Labs or other eligible market-maker coverage.
10. Private or MEV-protected submission where available.
11. Error and fallback behavior during closed/unavailable stock markets.
12. Compliance responsibilities for a fee collector, reward vault, keeper, and MM.
13. Guidance for corporate actions or token migrations.

0x provides Robinhood Chain routing and RFQ access. It does **not** automatically arbitrage RaptorX’s two XXX pools; that remains the RaptorX keeper’s job unless an eligible MM explicitly agrees to cover it.

---

## 24. What RaptorX needs from Robinhood

Ask Robinhood to:

1. Confirm the canonical HOOD Stock Token contract.
2. Confirm the canonical HOOD/USD feed and staleness requirements.
3. Confirm that `XXX/HOOD` V4 pools are an approved use case.
4. Confirm that fee-funded HOOD delivery to eligible XXX holders is permitted.
5. Provide or approve the wallet eligibility mechanism.
6. Confirm restricted jurisdictions and person types.
7. Confirm requirements for RaptorX vault, keeper, router, and market-maker wallets.
8. Confirm one-time automatic-distribution consent requirements.
9. Confirm corporate-action, redemption, multiplier, and token-migration procedures.
10. Introduce RaptorX to the 0x RWA/RFQ team and Tokka Labs or another authorized MM.
11. Review the universal hook, reward vault, LP locker, and settlement adapter.
12. Review external product wording before launch.

---

## 25. Robinhood Chain and V4 deployment references

The previous blueprint recorded the following Robinhood Chain references on July 23, 2026:

```text
Chain ID:            4663
PoolManager:         0x8366a39cc670b4001a1121b8f6a443a643e40951
PositionManager:     0x58daec3116aae6d93017baaea7749052e8a04fa7
Quoter:              0x8dc178efb8111bb0973dd9d722ebeff267c98f94
StateView:           0xf3334192d15450cdd385c8b70e03f9a6bd9e673b
ReservesLens:        0x0000001b173C3bbF3984D417d8614E3eed34865B
Universal Router:    0x8876789976decbfcbbbe364623c63652db8c0904
Permit2:             0x000000000022D473030F116dDEE9F6B43aC78BA3
```

Verify every address against the current official deployment feed immediately before deployment. Never assume addresses are identical across networks.

---

## 26. Product wording

Long version:

> RaptorX is building the dual-rail launch standard for Robinhood Chain. Every token begins on a WETH bonding curve and graduates into two equally funded RaptorX Swap markets: a global `XXX/WETH` rail and an eligibility-gated `XXX/HOOD` rail. Eligible orders route HOOD-first while oversized trades split into WETH to protect execution. Every buy and sell pays one transparent 1% fee, funding the creator, RaptorX, an individual wallet, and recurring equal-share HOOD and WETH rewards for qualified holders. RexScreener combines both rails into one canonical price, chart, liquidity figure, and market history.

Short version:

> Every RaptorX launch creates two markets and two recurring reward loops: global trading through WETH, eligible trading through HOOD, and one canonical market inside RexScreener.

---

## 27. Official technical sources

- Robinhood Chain, **Stock Tokens**: https://docs.robinhood.com/chain/stock-tokens/
- Robinhood Chain, **Building with Stock Tokens**: https://docs.robinhood.com/chain/building-with-stock-tokens/
- 0x, **0x now supports Robinhood Chain**: https://0x.org/post/robinhood-chain
- 0x, **Swap API documentation**: https://docs.0x.org/
- Uniswap, **V4 Swap Hooks**: https://developers.uniswap.org/docs/protocols/v4/guides/hooks/swap-hooks
- Uniswap, **V4 Deployments**: https://developers.uniswap.org/docs/protocols/v4/deployments
- Uniswap, **V4 Security Framework**: https://developers.uniswap.org/docs/protocols/v4/guides/security-framework
- TradingView, **Lightweight Charts documentation**: https://tradingview.github.io/lightweight-charts/

---

## 28. Final build definition

The approved production target is:

```text
1B fixed supply
    + creator selects 0–95% to one wallet
    + atomic block-zero creator purchase
    + net 2–4 ETH standard or 4–32 ETH advanced graduation
    + one pre-graduation WETH bonding curve
    + two post-graduation locked pools
    + 50/50 normalized initial liquidity
    + HOOD-first protected routing for eligible users
    + WETH-only routing for restricted/unknown users
    + exactly 1% fee before and after graduation
    + 60/20/10/5/5 fee allocation
    + equal HOOD rewards at 500K holdings
    + equal WETH rewards at 500K holdings
    + $5K/$2.5K default per-asset triggers
    + per-launch timelocked policy controls
    + automatic one-time enrollment and delivery
    + creator/allocation wallet exclusion
    + RaptorX-owned keeper with scoped fee exemption
    + optional external MM/searcher coverage
    + RaptorX Swap as execution surface
    + RexScreener as the only chart and market-data layer
```

That is the v5 system. Any implementation that removes one rail, charges more than the single 1% fee, pays rewards proportionally, includes the creator wallet in holder rewards, uses a fixed highest-pool price, relies entirely on external arbitrageurs, or sends graduated users to an external swap is not this architecture.
