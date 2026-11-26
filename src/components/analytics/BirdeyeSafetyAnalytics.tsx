/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import Image from "next/image";
import { SecurityAnalytics } from "@/lib/api/birdeyeSecurtiy";
import "@/styles/pages/analytics.css";

/* Styles: styles/pages/analytics.css (.rx-an …): stat tiles, risk score, check/cross rows, key facts.
   Prototype: design/report.html "Risks to watch", design/whats-new.html key facts + checks. */

interface BirdeyeSafetyAnalyticsProps {
  data: SecurityAnalytics;
}

/** Tone keys: text (t-*), bars (is-*), tiles (an-stat--*). */
type Tone = "up" | "gold" | "ember" | "down";

const BADGE: Record<Tone, string> = {
  up: "rx-badge--up",
  gold: "rx-badge--gold",
  ember: "an-badge--ember",
  down: "rx-badge--down",
};

function RiskScoreDisplay({ score, level }: { score: number; level: string }) {
  const riskScore = score;

  const getScoreColor = (riskScore: number) => {
    if (riskScore >= 70) return "t-down";
    if (riskScore >= 40) return "t-ember";
    if (riskScore >= 20) return "t-gold";
    return "t-up";
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case "critical":
        return "rx-badge--down";
      case "high":
        return "an-badge--ember";
      case "medium":
        return "rx-badge--gold";
      case "low":
        return "rx-badge--up";
      default:
        return "rx-badge--neutral";
    }
  };

  const getProgressColor = (riskScore: number) => {
    if (riskScore >= 70) return "is-down";
    if (riskScore >= 40) return "is-ember";
    if (riskScore >= 20) return "is-gold";
    return "is-up";
  };

  const getProgressWidth = (score: number) => {
    return Math.min(100, Math.max(0, score));
  };

  const getRiskIcon = (level: string) => {
    switch (level) {
      case "critical":
        return (
          <svg className="t-down" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        );
      case "high":
        return (
          <svg className="t-ember" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        );
      case "low":
        return (
          <svg className="t-up" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
        );
      default:
        return (
          <svg className="t-gold" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clipRule="evenodd"
            />
          </svg>
        );
    }
  };

  return (
    <section className="an-block">
      <div className="an-h-row">
        <h3 className="an-h">
          {getRiskIcon(level)}
          Risk assessment
        </h3>
        <span className={`rx-badge ${getLevelColor(level)}`}>
          {level.toUpperCase()}
        </span>
      </div>

      <div className="rx-well an-score">
        <div className="an-score__top">
          <span className="an-score__label">Risk score</span>
          <span className={`an-score__val ${getScoreColor(riskScore)}`}>
            {riskScore}/100
          </span>
        </div>

        <div className="an-bar an-bar--l" aria-hidden="true">
          <span
            className={getProgressColor(riskScore)}
            style={{ width: `${getProgressWidth(riskScore)}%` }}
          />
        </div>

        <div className="an-legend">
          <span>
            <i className="an-dot is-up" aria-hidden="true" />
            Safe (0)
          </span>
          <span>
            <i className="an-dot is-down" aria-hidden="true" />
            Critical (100)
          </span>
        </div>
      </div>
    </section>
  );
}

function LiquidityPoolChart({ lpAnalysis }: { lpAnalysis: any }) {
  const { lockedPercentage, topHolderPercentage, contractControlledLP } =
    lpAnalysis;

  const getColorByPercentage = (percentage: number, reversed = false): Tone => {
    if (reversed) {
      if (percentage >= 70) return "down";
      if (percentage >= 40) return "ember";
      return "up";
    } else {
      if (percentage >= 70) return "up";
      if (percentage >= 40) return "gold";
      return "down";
    }
  };

  const lockedTone = getColorByPercentage(lockedPercentage);
  const topHolderTone = getColorByPercentage(topHolderPercentage, true);
  const contractTone = getColorByPercentage(contractControlledLP, true);

  return (
    <section className="an-block">
      <h3 className="an-h">
        <svg className="t-gold" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" />
        </svg>
        Liquidity pool analysis
      </h3>

      <div className="an-stats an-stats--3">
        {/* Locked Percentage */}
        <div className={`rx-well an-stat an-stat--${lockedTone}`}>
          <span className="an-stat__label">LP locked</span>
          <span className={`an-stat__value t-${lockedTone}`}>
            {lockedPercentage.toFixed(1)}%
          </span>
          <div className="an-bar" aria-hidden="true">
            <span
              className={
                lockedPercentage >= 70
                  ? "is-up"
                  : lockedPercentage >= 40
                  ? "is-gold"
                  : "is-down"
              }
              style={{ width: `${Math.min(100, lockedPercentage)}%` }}
            />
          </div>
        </div>

        {/* Top Holder */}
        <div className={`rx-well an-stat an-stat--${topHolderTone}`}>
          <span className="an-stat__label">Top holder</span>
          <span className={`an-stat__value t-${topHolderTone}`}>
            {topHolderPercentage.toFixed(1)}%
          </span>
          <div className="an-bar" aria-hidden="true">
            <span
              className={
                topHolderPercentage >= 70
                  ? "is-down"
                  : topHolderPercentage >= 40
                  ? "is-ember"
                  : "is-up"
              }
              style={{ width: `${Math.min(100, topHolderPercentage)}%` }}
            />
          </div>
        </div>

        {/* Contract Controlled */}
        <div className={`rx-well an-stat an-stat--${contractTone}`}>
          <span className="an-stat__label">Contract controlled</span>
          <span className={`an-stat__value t-${contractTone}`}>
            {contractControlledLP.toFixed(1)}%
          </span>
          <div className="an-bar" aria-hidden="true">
            <span
              className={
                contractControlledLP >= 50
                  ? "is-down"
                  : contractControlledLP >= 25
                  ? "is-ember"
                  : "is-up"
              }
              style={{ width: `${Math.min(100, contractControlledLP)}%` }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function TaxAnalysisChart({ tokenSecurity }: { tokenSecurity: any }) {
  const buyTax = parseFloat(tokenSecurity.buyTax || "0");
  const sellTax = parseFloat(tokenSecurity.sellTax || "0");
  const transferTax = parseFloat(tokenSecurity.transferTax || "0");

  const getTaxColor = (tax: number): Tone => {
    if (tax === 0) return "up";
    if (tax <= 5) return "gold";
    if (tax <= 10) return "ember";
    return "down";
  };

  const buyTone = getTaxColor(buyTax);
  const sellTone = getTaxColor(sellTax);
  const transferTone = getTaxColor(transferTax);

  return (
    <section className="an-block">
      <h3 className="an-h">
        <svg className="t-gold" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z"
            clipRule="evenodd"
          />
        </svg>
        Tax analysis
      </h3>

      <div className="an-stats an-stats--3up">
        {/* Buy Tax */}
        <div className={`rx-well an-stat an-stat--${buyTone}`}>
          <span className="an-stat__label">Buy tax</span>
          <span className={`an-stat__value t-${buyTone}`}>{buyTax}%</span>
          <span className={`rx-badge ${BADGE[buyTone]}`}>
            {buyTax === 0
              ? "No tax"
              : buyTax <= 5
              ? "Low"
              : buyTax <= 10
              ? "Medium"
              : "High"}
          </span>
        </div>

        {/* Sell Tax */}
        <div className={`rx-well an-stat an-stat--${sellTone}`}>
          <span className="an-stat__label">Sell tax</span>
          <span className={`an-stat__value t-${sellTone}`}>{sellTax}%</span>
          <span className={`rx-badge ${BADGE[sellTone]}`}>
            {sellTax === 0
              ? "No tax"
              : sellTax <= 5
              ? "Low"
              : sellTax <= 10
              ? "Medium"
              : "High"}
          </span>
        </div>

        {/* Transfer Tax */}
        <div className={`rx-well an-stat an-stat--${transferTone}`}>
          <span className="an-stat__label">Transfer tax</span>
          <span className={`an-stat__value t-${transferTone}`}>
            {transferTax}%
          </span>
          <span className={`rx-badge ${BADGE[transferTone]}`}>
            {transferTax === 0
              ? "No tax"
              : transferTax <= 2
              ? "Low"
              : transferTax <= 5
              ? "Medium"
              : "High"}
          </span>
        </div>
      </div>
    </section>
  );
}

function WarningsList({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;

  return (
    <section className="an-block">
      <h3 className="an-h t-down">
        <svg fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
          <path
            fillRule="evenodd"
            d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
            clipRule="evenodd"
          />
        </svg>
        Security warnings
        <span className="rx-count">{warnings.length}</span>
      </h3>

      <ul className="an-checks an-checks--scroll">
        {warnings.map((warning, index) => (
          <li
            key={index}
            className="an-check"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <Image
              src="/images/whats-new/cross.webp"
              alt="Warning"
              width={18}
              height={18}
            />
            <span>{warning}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SafetyIndicatorsList({ indicators }: { indicators: string[] }) {
  if (!indicators.length) return null;

  return (
    <section className="an-block">
      <h3 className="an-h t-up">
        <svg fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
        Safety indicators
        <span className="rx-count">{indicators.length}</span>
      </h3>

      <ul className="an-checks an-checks--scroll">
        {indicators.map((indicator, index) => (
          <li
            key={index}
            className="an-check"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <Image
              src="/images/whats-new/check.webp"
              alt="Passed"
              width={18}
              height={18}
            />
            <span>{indicator}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TokenDetails({ tokenSecurity }: { tokenSecurity: any }) {
  const formatNumber = (value?: string | number) => {
    if (!value && value !== 0) return "N/A";
    const num = typeof value === "string" ? parseFloat(value) : value;
    if (!Number.isFinite(num)) return "N/A";

    // Format large numbers with appropriate suffixes
    if (num >= 1000000000) {
      return `${(num / 1000000000).toFixed(2)}B`;
    } else if (num >= 1000000) {
      return `${(num / 1000000).toFixed(2)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(2)}K`;
    }

    return new Intl.NumberFormat().format(num);
  };

  const getBooleanDisplay = (value?: string) => {
    if (value === "1") return { text: "Yes", color: "rx-badge--down" };
    if (value === "0") return { text: "No", color: "rx-badge--up" };
    return { text: "Unknown", color: "rx-badge--neutral" };
  };

  const flag = (value?: string) => {
    const d = getBooleanDisplay(value);
    return <span className={`rx-badge ${d.color}`}>{d.text}</span>;
  };

  return (
    <section className="an-block">
      <h3 className="an-h">Token details</h3>

      <div className="an-duo">
        <div className="an-stack">
          <div className="an-card">
            <div className="an-card__head">
              <span className="rx-eyebrow">Basic information</span>
            </div>
            <dl className="an-facts">
              <div>
                <dt>Name</dt>
                <dd>{tokenSecurity.tokenName || "N/A"}</dd>
              </div>
              <div>
                <dt>Symbol</dt>
                <dd>{tokenSecurity.tokenSymbol || "N/A"}</dd>
              </div>
              <div>
                <dt>Total supply</dt>
                <dd>{formatNumber(tokenSecurity.totalSupply)}</dd>
              </div>
              <div>
                <dt>Holder count</dt>
                <dd>{tokenSecurity.holderCount}</dd>
              </div>
            </dl>
          </div>

          <div className="an-card">
            <div className="an-card__head">
              <span className="rx-eyebrow">Exchange listings</span>
            </div>
            <dl className="an-facts">
              <div>
                <dt>Listed on CEX</dt>
                <dd>
                  {flag(tokenSecurity.isInCex?.listed)}
                </dd>
              </div>
              {tokenSecurity.isInCex?.listed === "1" && (
                <div>
                  <dt>CEX list</dt>
                  <dd className="t-up">
                    {tokenSecurity.isInCex.cex_list?.join(", ") || "Unknown"}
                  </dd>
                </div>
              )}
              <div>
                <dt>Listed on DEX</dt>
                <dd>
                  {flag(tokenSecurity.isInDex)}
                </dd>
              </div>
              <div>
                <dt>Whitelisted</dt>
                <dd>
                  {flag(tokenSecurity.isWhitelisted)}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="an-stack">
          <div className="an-card">
            <div className="an-card__head">
              <span className="rx-eyebrow">Security features</span>
            </div>
            <dl className="an-facts">
              <div>
                <dt>Is honeypot</dt>
                <dd>
                  {flag(tokenSecurity.isHoneypot)}
                </dd>
              </div>
              <div>
                <dt>Cannot buy</dt>
                <dd>
                  {flag(tokenSecurity.cannotBuy)}
                </dd>
              </div>
              <div>
                <dt>Cannot sell all</dt>
                <dd>
                  {flag(tokenSecurity.cannotSellAll)}
                </dd>
              </div>
              <div>
                <dt>Is proxy</dt>
                <dd>
                  {flag(tokenSecurity.isProxy)}
                </dd>
              </div>
              <div>
                <dt>Is open source</dt>
                <dd>
                  {flag(tokenSecurity.isOpenSource)}
                </dd>
              </div>
            </dl>
          </div>

          <div className="an-card">
            <div className="an-card__head">
              <span className="rx-eyebrow">Creator information</span>
            </div>
            <dl className="an-facts">
              <div>
                <dt>Creator percentage</dt>
                <dd>
                  {parseFloat(tokenSecurity.creatorPercentage || "0").toFixed(
                    2
                  )}
                  %
                </dd>
              </div>
              <div>
                <dt>Creator balance</dt>
                <dd>{formatNumber(tokenSecurity.creatorBalance)}</dd>
              </div>
              <div>
                <dt>Creator address</dt>
                <dd>
                  {tokenSecurity.creatorAddress
                    ? `${tokenSecurity.creatorAddress.slice(
                        0,
                        6
                      )}...${tokenSecurity.creatorAddress.slice(-4)}`
                    : "N/A"}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}

export function BirdeyeSafetyAnalyticsComponent({
  data,
}: BirdeyeSafetyAnalyticsProps) {
  // Check if we have metadata from the enhanced API call
  const metadata = (data as any).metadata;

  return (
    <div className="rx-an rx-an--w">
      {/* Metadata section if available */}
      {metadata && (
        <section className="an-block">
          <h3 className="an-h">
            <svg className="t-gold" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 0v12h8V4H6z"
                clipRule="evenodd"
              />
              <path d="M8 6h4v2H8V6zM8 10h4v2H8v-2z" />
            </svg>
            Token metadata
          </h3>
          <div className="an-card">
            <dl className="an-facts">
              <div>
                <dt>Token name</dt>
                <dd>{metadata.name || "N/A"}</dd>
              </div>
              <div>
                <dt>Symbol</dt>
                <dd>{metadata.symbol || "N/A"}</dd>
              </div>
              <div>
                <dt>Decimals</dt>
                <dd>{metadata.decimals || "N/A"}</dd>
              </div>
              <div>
                <dt>Social links</dt>
                <dd>
                  {metadata.extensions?.website && (
                    <a
                      href={metadata.extensions.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="an-soc"
                      aria-label="Website"
                      title="Website"
                    >
                      <Image src="/images/whats-new/browser.webp" alt="" width={16} height={16} />
                    </a>
                  )}
                  {metadata.extensions?.twitter && (
                    <a
                      href={metadata.extensions.twitter}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="an-soc"
                      aria-label="X"
                      title="X"
                    >
                      <Image src="/images/whats-new/x.webp" alt="" width={16} height={16} />
                    </a>
                  )}
                  {metadata.extensions?.telegram && (
                    <a
                      href={metadata.extensions.telegram}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="an-soc"
                      aria-label="Telegram"
                      title="Telegram"
                    >
                      <Image src="/images/whats-new/telegram.webp" alt="" width={16} height={16} />
                    </a>
                  )}
                  {!metadata.extensions?.website &&
                    !metadata.extensions?.twitter &&
                    !metadata.extensions?.telegram && (
                      <span className="an-muted">None</span>
                    )}
                </dd>
              </div>
            </dl>
          </div>
        </section>
      )}

      <div className="an-stats an-stats--4">
        <div className="rx-well an-stat">
          <span className="an-stat__label">
            <i className="an-dot is-down" aria-hidden="true" />
            Risk score
          </span>
          <span className="an-stat__value">{data.riskScore}/100</span>
        </div>
        <div className="rx-well an-stat">
          <span className="an-stat__label">
            <i className="an-dot is-ember" aria-hidden="true" />
            Warnings
          </span>
          <span className="an-stat__value">{data.warnings.length}</span>
        </div>
        <div className="rx-well an-stat">
          <span className="an-stat__label">
            <i className="an-dot is-up" aria-hidden="true" />
            Safety features
          </span>
          <span className="an-stat__value">{data.safetyIndicators.length}</span>
        </div>
        <div className="rx-well an-stat">
          <span className="an-stat__label">
            <i className="an-dot is-gold" aria-hidden="true" />
            LP holders
          </span>
          <span className="an-stat__value">{data.lpAnalysis.totalHolders}</span>
        </div>
      </div>

      <RiskScoreDisplay score={data.riskScore} level={data.riskLevel} />

      <TaxAnalysisChart tokenSecurity={data.tokenSecurity} />

      <LiquidityPoolChart lpAnalysis={data.lpAnalysis} />

      <div className="an-duo">
        <WarningsList warnings={data.warnings} />
        <SafetyIndicatorsList indicators={data.safetyIndicators} />
      </div>

      <TokenDetails tokenSecurity={data.tokenSecurity} />
    </div>
  );
}
