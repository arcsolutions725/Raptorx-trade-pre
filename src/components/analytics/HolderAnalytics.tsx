"use client";

import { HolderAnalytics } from "@/lib/api/bnbAnalytics";
import copy from "copy-to-clipboard";
import { useState } from "react";
import "@/styles/pages/analytics.css";

/* Styles: styles/pages/analytics.css (.rx-an …): stat tiles, bar rows, takeaway, holders table. */

interface HolderAnalyticsProps {
  data: HolderAnalytics;
}

type Tone = "is-up" | "is-gold" | "is-ember" | "is-down";

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(2) + "M";
  if (num >= 1000) return (num / 1000).toFixed(2) + "K";
  return num.toFixed(2);
}

// function formatPercentage(num: number): string {
//   if (num >= 1000000) return (num / 1000000).toFixed(1) + "M%";
//   if (num >= 1000) return (num / 1000).toFixed(1) + "K%";
//   return num.toFixed(1) + "%";
// }

function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function ProgressBar({
  percentage,
  tone = "is-gold",
}: {
  percentage: number;
  tone?: Tone;
}) {
  return (
    <div className="an-bar" aria-hidden="true">
      <span
        className={tone}
        style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
      />
    </div>
  );
}

function HolderDistributionChart({ data }: { data: HolderAnalytics }) {
  const { whaleHolders, mediumHolders, smallHolders } = data.holderDistribution;
  const total = whaleHolders + mediumHolders + smallHolders;

  if (total === 0) return null;

  const whalePercentage = (whaleHolders / total) * 100;
  const mediumPercentage = (mediumHolders / total) * 100;
  const smallPercentage = (smallHolders / total) * 100;

  return (
    <section className="an-block">
      <h3 className="an-h">Holder distribution</h3>

      <ul className="an-card an-rows">
        <li className="an-row">
          <div className="an-row__top">
            <span className="an-row__label">
              <i className="an-dot is-down" aria-hidden="true" />
              Whales (&gt;1%)
            </span>
            <span className="an-row__val">{whaleHolders}</span>
          </div>
          <ProgressBar percentage={whalePercentage} tone="is-down" />
        </li>

        <li className="an-row">
          <div className="an-row__top">
            <span className="an-row__label">
              <i className="an-dot is-gold" aria-hidden="true" />
              Medium (0.1%-1%)
            </span>
            <span className="an-row__val">{mediumHolders}</span>
          </div>
          <ProgressBar percentage={mediumPercentage} tone="is-gold" />
        </li>

        <li className="an-row">
          <div className="an-row__top">
            <span className="an-row__label">
              <i className="an-dot is-up" aria-hidden="true" />
              Small (&lt;0.1%)
            </span>
            <span className="an-row__val">{smallHolders}</span>
          </div>
          <ProgressBar percentage={smallPercentage} tone="is-up" />
        </li>
      </ul>
    </section>
  );
}

function ConcentrationMetrics({ data }: { data: HolderAnalytics }) {
  const { top10Percentage, top50Percentage, top100Percentage } =
    data.concentration;

  return (
    <section className="an-block">
      <h3 className="an-h">Token concentration</h3>

      <div className="an-card">
        <ul className="an-rows">
          <li className="an-row">
            <div className="an-row__top">
              <span className="an-row__label">Top 10 holders</span>
              <span className="an-row__val">
                {formatNumber(top10Percentage)}
              </span>
            </div>
            <ProgressBar percentage={top10Percentage} />
          </li>

          <li className="an-row">
            <div className="an-row__top">
              <span className="an-row__label">Top 50 holders</span>
              <span className="an-row__val">
                {formatNumber(top50Percentage)}
              </span>
            </div>
            <ProgressBar percentage={top50Percentage} />
          </li>

          <li className="an-row">
            <div className="an-row__top">
              <span className="an-row__label">Top 100 holders</span>
              <span className="an-row__val">
                {formatNumber(top100Percentage)}
              </span>
            </div>
            <ProgressBar percentage={top100Percentage} />
          </li>
        </ul>

        {/* Risk assessment (prototype .report-takeaway) */}
        <div className="an-card__foot">
          <div className="an-takeaway">
            <div className="an-takeaway__head">
              <span>Concentration risk</span>
              <span
                className={`rx-badge ${
                  top10Percentage > 50
                    ? "rx-badge--down"
                    : top10Percentage > 30
                    ? "rx-badge--gold"
                    : "rx-badge--up"
                }`}
              >
                {top10Percentage > 50
                  ? "High"
                  : top10Percentage > 30
                  ? "Medium"
                  : "Low"}
              </span>
            </div>
            <p>
              {top10Percentage > 50
                ? "High concentration in top holders increases manipulation risk"
                : top10Percentage > 30
                ? "Moderate concentration suggests some centralization"
                : "Good distribution reduces concentration risk"}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function TopHoldersTable({ data }: { data: HolderAnalytics }) {
  const topHolders = data.topHolders.slice(0, 10);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  const handleCopyAddress = (address: string) => {
    copy(address);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  return (
    <section className="an-block">
      <h3 className="an-h">Top holders</h3>

      <div className="an-card an-scroll">
        <table className="an-table">
          <thead>
            <tr>
              <th scope="col" className="an-col-rank">
                #
              </th>
              <th scope="col">Holder</th>
              <th scope="col" className="n">
                Tokens
              </th>
            </tr>
          </thead>
          <tbody>
            {topHolders.map((holder, index) => {
              const quantity = parseFloat(holder.TokenHolderQuantity);
              const isCopied = copiedAddress === holder.TokenHolderAddress;
              return (
                <tr key={holder.TokenHolderAddress}>
                  <td>
                    <span
                      className={`an-rank${
                        index === 0
                          ? " is-1"
                          : index === 1
                          ? " is-2"
                          : index === 2
                          ? " is-3"
                          : ""
                      }`}
                    >
                      {index + 1}
                    </span>
                  </td>
                  <td>
                    <span className="an-holder">
                      <span
                        className="an-addr"
                        title={holder.TokenHolderAddress}
                      >
                        {formatAddress(holder.TokenHolderAddress)}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyAddress(holder.TokenHolderAddress)
                        }
                        className={`rx-icon-btn an-copy${
                          isCopied ? " is-done" : ""
                        }`}
                        title="Copy address"
                        aria-label="Copy address"
                      >
                        {isCopied ? (
                          <svg
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2.4}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        ) : (
                          <svg
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                            />
                          </svg>
                        )}
                      </button>
                    </span>
                  </td>
                  <td className="n">{formatNumber(quantity)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function HolderAnalyticsComponent({ data }: HolderAnalyticsProps) {
  return (
    <div className="rx-an rx-an--w">
      <div className="an-stats">
        {/* <div className="rx-well an-stat">
          <span className="an-stat__label">Total holders</span>
          <span className="an-stat__value">{data.totalHolders}</span>
        </div> */}

        <div className="rx-well an-stat">
          <span className="an-stat__label">Whale holders</span>
          <span className="an-stat__value">
            {data.holderDistribution.whaleHolders}
          </span>
        </div>

        <div className="rx-well an-stat">
          <span className="an-stat__label">Top 10 concentration</span>
          <span className="an-stat__value">
            {formatNumber(data.concentration.top10Percentage)}
          </span>
        </div>
      </div>

      <div className="an-duo">
        <HolderDistributionChart data={data} />
        <ConcentrationMetrics data={data} />
      </div>

      <TopHoldersTable data={data} />
    </div>
  );
}
