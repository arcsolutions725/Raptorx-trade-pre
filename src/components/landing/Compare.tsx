type Mark = "y" | "p" | "n";
type Cell = [Mark, string];

const Y: Cell = ["y", "Yes"];
const N: Cell = ["n", "No"];

// columns: RaptorX, prediction markets, social trading apps, terminals
const ROWS: [string, Cell, Cell, Cell, Cell][] = [
  ["AI Operating System", Y, N, N, N],
  ["AI-Powered Market Research", Y, N, N, N],
  ["Real-Time Research Reports", Y, N, N, N],
  ["Recursive Self-Improvement Reasoning", Y, N, N, N],
  ["Cross-Market Hunting & Intelligent Capital Deployment", Y, N, N, ["p", "Partly"]],
  ["AI-Powered Research-to-Trade", Y, N, N, N],
];

/** COMPARISON: RaptorX against terminals, social trading and prediction markets. */
export default function Compare() {
  return (
    <section className="compare" aria-labelledby="cmp-title">
      <div className="sec-head sec-head--center reveal">
        <h2 id="cmp-title">
          Terminals and Social Trading cover specific parts.
          <br />
          RaptorX does it all.
        </h2>
        <p>
          Social trading cannot live with KOL pumps and dumps. Terminals are too complex and built for specific trader
          groups. Prediction Markets sit in their own boxes without cross-venture opportunity.
        </p>
        <p className="cmp__mog">RaptorX mogs them all.</p>
      </div>
      {/* keyboard users can focus the table and scroll it sideways on phones */}
      <div className="cmp reveal" tabIndex={0} role="region" aria-label="RaptorX compared with other tools, scrolls sideways">
        <table>
          <caption>RaptorX Competitive Comparison</caption>
          <thead>
            <tr>
              <th scope="col">Capabilities</th>
              <th scope="col" className="cmp__us">
                <img src="/images/raptorx-logo.svg" alt="" width={32} height={26} loading="lazy" decoding="async" />
                RaptorX
              </th>
              <th scope="col">Prediction Markets</th>
              <th scope="col">Social Trading Apps</th>
              <th scope="col">Terminals</th>
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
