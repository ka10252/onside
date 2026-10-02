/**
 * The diagrams a revision note needs to show rather than describe. Drawn as SVG so they stay sharp,
 * follow the page's colours in both themes, and print. Referenced from a note by a line of its own:
 *   :::diagram exchange-rate  Demand for dollars rises
 */

const AXIS = "var(--ink2)";
const CURVE = "var(--ink)";
const SHIFT = "var(--red)";
const GUIDE = "var(--line2)";

function Frame({
  children,
  x,
  y,
  caption,
}: {
  children: React.ReactNode;
  x: string;
  y: string;
  caption?: string;
}) {
  return (
    <figure className="dgm">
      <svg viewBox="0 0 320 240" role="img" aria-label={caption ?? `${y} against ${x}`}>
        <line x1="44" y1="200" x2="300" y2="200" stroke={AXIS} strokeWidth="1.5" />
        <line x1="44" y1="200" x2="44" y2="18" stroke={AXIS} strokeWidth="1.5" />
        <text x="300" y="220" textAnchor="end" className="dgmlab">{x}</text>
        <text x="40" y="14" textAnchor="end" className="dgmlab">{y}</text>
        {children}
      </svg>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

/** Demand and supply for a currency, with demand shifting right. */
function ExchangeRate({ caption }: { caption?: string }) {
  return (
    <Frame x="Quantity of $" y="Price of $ in €" caption={caption}>
      <line x1="60" y1="40" x2="260" y2="190" stroke={CURVE} strokeWidth="2" />
      <text x="264" y="192" className="dgmcur">D</text>
      <line x1="110" y1="30" x2="300" y2="170" stroke={SHIFT} strokeWidth="2" strokeDasharray="5 4" />
      <text x="302" y="168" className="dgmcur" fill={SHIFT}>D₁</text>
      <line x1="60" y1="190" x2="280" y2="40" stroke={CURVE} strokeWidth="2" />
      <text x="282" y="38" className="dgmcur">S</text>
      <line x1="44" y1="115" x2="170" y2="115" stroke={GUIDE} strokeWidth="1" strokeDasharray="3 3" />
      <line x1="170" y1="115" x2="170" y2="200" stroke={GUIDE} strokeWidth="1" strokeDasharray="3 3" />
      <circle cx="170" cy="115" r="3.5" fill={CURVE} />
      <text x="24" y="119" className="dgmlab">e₁</text>
      <text x="166" y="216" className="dgmlab">Q₁</text>
      <line x1="44" y1="88" x2="202" y2="88" stroke={GUIDE} strokeWidth="1" strokeDasharray="3 3" />
      <line x1="202" y1="88" x2="202" y2="200" stroke={GUIDE} strokeWidth="1" strokeDasharray="3 3" />
      <circle cx="202" cy="88" r="3.5" fill={SHIFT} />
      <text x="24" y="92" className="dgmlab" fill={SHIFT}>e₂</text>
      <text x="198" y="216" className="dgmlab" fill={SHIFT}>Q₂</text>
    </Frame>
  );
}

/** AD/AS with aggregate demand shifting right, and the Keynesian flat range on the left. */
function AdAs({ caption }: { caption?: string }) {
  return (
    <Frame x="Real output" y="Price level" caption={caption}>
      <path d="M60 200 L60 120 Q140 120 190 70 L215 20" fill="none" stroke={CURVE} strokeWidth="2" />
      <text x="218" y="18" className="dgmcur">AS</text>
      <line x1="236" y1="200" x2="236" y2="18" stroke={AXIS} strokeWidth="1.5" strokeDasharray="4 4" />
      <text x="240" y="30" className="dgmlab">LRAS</text>
      <line x1="60" y1="60" x2="210" y2="190" stroke={CURVE} strokeWidth="2" />
      <text x="212" y="192" className="dgmcur">AD</text>
      <line x1="100" y1="40" x2="258" y2="178" stroke={SHIFT} strokeWidth="2" strokeDasharray="5 4" />
      <text x="260" y="176" className="dgmcur" fill={SHIFT}>AD₁</text>
      <line x1="44" y1="134" x2="134" y2="134" stroke={GUIDE} strokeWidth="1" strokeDasharray="3 3" />
      <line x1="134" y1="134" x2="134" y2="200" stroke={GUIDE} strokeWidth="1" strokeDasharray="3 3" />
      <circle cx="134" cy="134" r="3.5" fill={CURVE} />
      <text x="24" y="138" className="dgmlab">P₁</text>
      <text x="130" y="216" className="dgmlab">Y₁</text>
      <line x1="44" y1="100" x2="180" y2="100" stroke={GUIDE} strokeWidth="1" strokeDasharray="3 3" />
      <line x1="180" y1="100" x2="180" y2="200" stroke={GUIDE} strokeWidth="1" strokeDasharray="3 3" />
      <circle cx="180" cy="100" r="3.5" fill={SHIFT} />
      <text x="24" y="104" className="dgmlab" fill={SHIFT}>P₂</text>
      <text x="176" y="216" className="dgmlab" fill={SHIFT}>Y₂</text>
    </Frame>
  );
}

const DIAGRAMS: Record<string, (p: { caption?: string }) => React.ReactElement> = {
  "exchange-rate": ExchangeRate,
  "ad-as": AdAs,
};

export function Diagram({ name, caption }: { name: string; caption?: string }) {
  const D = DIAGRAMS[name];
  if (!D) return null;
  return <D caption={caption} />;
}

export const hasDiagram = (name: string) => name in DIAGRAMS;
