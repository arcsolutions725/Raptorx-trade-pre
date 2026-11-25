type Mark = "y" | "p" | "n";
type Cell = [Mark, string];

// columns: RaptorX, token screeners, prediction apps, AI chatbots
const ROWS: [string, Cell, Cell, Cell, Cell][] = [
  ["Live tokens across chains", ["y", "Yes"], ["y", "Yes"], ["n", "No"], ["n", "No"]],
  ["Prediction markets from several venues", ["y", "Yes"], ["n", "No"], ["p", "One venue"], ["n", "No"]],
  ["AI report for every token and market", ["y", "Yes"], ["n", "No"], ["n", "No"], ["p", "Without live data"]],
  ["AI that reads live market data", ["y", "Yes"], ["n", "No"], ["n", "No"], ["p", "Sometimes"]],
  ["Trade in the same window", ["y", "Yes"], ["p", "Via links"], ["y", "Yes"], ["n", "No"]],
  ["Missions, tiers and a leaderboard", ["y", "Yes"], ["n", "No"], ["p", "Some"], ["n", "No"]],
];

/** COMPARISON: RaptorX against the tools that do one part. */
export default function Compare() {
  return (
    <section className="compare" aria-labelledby="cmp-title">
      <div className="sec-head sec-head--center reveal">
        <p className="eyebrow">Why RaptorX</p>
        <h2 id="cmp-title">Other tools do one part.</h2>
        <p>Screeners show you tokens. Prediction apps show you odds. Chatbots guess. RaptorX does the whole job.</p>
      </div>
      <div className="cmp reveal">
        <table>
          <caption className="sr-only">RaptorX compared with other kinds of trading tools</caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Feature</span>
              </th>
              <th scope="col" className="cmp__us">
                <img src="/images/raptorx-logo.svg" alt="" width={32} height={26} loading="lazy" decoding="async" />
                RaptorX
              </th>
              <th scope="col">Token screeners</th>
              <th scope="col">Prediction apps</th>
              <th scope="col">AI chatbots</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([feature, ...cells]) => (
              <tr key={feature}>
                <th scope="row">{feature}</th>
                {cells.map(([mark, label], i) => (
                  <td key={i} className={i === 0 ? "cmp__us" : undefined}>
                    <i className={mark} role="img" aria-label={label} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="cmp__key">
          <span>
            <i className="y" aria-hidden="true" />
            Yes
          </span>
          <span>
            <i className="p" aria-hidden="true" />
            Partly
          </span>
          <span>
            <i className="n" aria-hidden="true" />
            No
          </span>
        </p>
      </div>
    </section>
  );
}
