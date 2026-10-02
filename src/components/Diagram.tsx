/**
 * The diagrams a revision note needs to show rather than describe. Drawn as SVG so they stay sharp,
 * follow the page's colours in both themes, and print. Referenced from a note by a line of its own:
 *   :::diagram ad-as  Aggregate demand rises
 *
 * Every equilibrium is computed from where the curves actually cross, never placed by eye: a
 * student copies what is in front of them, and a dot off the intersection teaches the error.
 */

const AXIS = "var(--ink2)";
const CURVE = "var(--ink)";
const SHIFT = "var(--red)";
const GUIDE = "var(--line2)";

type Pt = { x: number; y: number };
const line = (a: Pt, b: Pt) => ({ a, b });
type Line = { a: Pt; b: Pt };

/** Where two straight lines cross. */
function cross(p: Line, q: Line): Pt {
  const d = (p.b.x - p.a.x) * (q.b.y - q.a.y) - (p.b.y - p.a.y) * (q.b.x - q.a.x);
  const t = ((q.a.x - p.a.x) * (q.b.y - q.a.y) - (q.a.y - p.a.y) * (q.b.x - q.a.x)) / d;
  return { x: p.a.x + t * (p.b.x - p.a.x), y: p.a.y + t * (p.b.y - p.a.y) };
}

/** Where a straight line crosses a curve given as points, found by walking the curve. */
function crossPath(path: Pt[], l: Line): Pt {
  const side = (p: Pt) => (l.b.x - l.a.x) * (p.y - l.a.y) - (l.b.y - l.a.y) * (p.x - l.a.x);
  for (let i = 1; i < path.length; i++) {
    const s0 = side(path[i - 1]!);
    const s1 = side(path[i]!);
    if (s0 === 0) return path[i - 1]!;
    if (s0 * s1 < 0) return cross(line(path[i - 1]!, path[i]!), l);
  }
  return path[path.length - 1]!;
}

const shiftX = (l: Line, by: number): Line => ({ a: { x: l.a.x + by, y: l.a.y }, b: { x: l.b.x + by, y: l.b.y } });
/** A vertical shift. Up the page is a higher price, so a tax of t is `shiftY(s, -t)`. */
const shiftY = (l: Line, by: number): Line => ({ a: { x: l.a.x, y: l.a.y + by }, b: { x: l.b.x, y: l.b.y + by } });
/** Where a line is at a given height. */
const atY = (l: Line, y: number): Pt => cross(l, line({ x: 0, y }, { x: 320, y }));

/** Trims a line to the drawing area, so a shifted curve never runs past the axes. */
function clip(l: Line): Line {
  const dx = l.b.x - l.a.x;
  const dy = l.b.y - l.a.y;
  let lo = 0;
  let hi = 1;
  const keep = (num: number, den: number) => {
    // num + den*t >= 0
    if (den === 0) return num >= 0;
    const t = -num / den;
    if (den > 0) lo = Math.max(lo, t);
    else hi = Math.min(hi, t);
    return true;
  };
  keep(l.a.x - 46, dx);
  keep(298 - l.a.x, -dx);
  keep(l.a.y - 18, dy);
  keep(198 - l.a.y, -dy);
  const at = (t: number) => ({ x: l.a.x + dx * t, y: l.a.y + dy * t });
  return lo < hi ? { a: at(lo), b: at(hi) } : l;
}
const d2 = (n: number) => Math.round(n * 10) / 10;

/**
 * The arrow that says a curve moved. It floats between the two positions without touching either,
 * so it reads as a movement rather than as part of a curve.
 */
function Shift({ from, to, gap = 9 }: { from: Pt; to: Pt; gap?: number }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = (dx / len) * gap;
  const uy = (dy / len) * gap;
  return (
    <line
      x1={d2(from.x + ux)}
      y1={d2(from.y + uy)}
      x2={d2(to.x - ux)}
      y2={d2(to.y - uy)}
      stroke={SHIFT}
      strokeWidth="1.6"
      markerEnd="url(#dgmarrow)"
    />
  );
}

/** A measured distance between two points at the same height, with an arrow at each end. */
function Gap({ from, to, y, label, drop = 0 }: { from: number; to: number; y: number; label: string; drop?: number }) {
  return (
    <>
      {drop > 0 && (
        <>
          <line x1={d2(from)} y1={d2(y)} x2={d2(from)} y2={d2(y + drop)} stroke={GUIDE} strokeWidth="1" strokeDasharray="3 3" />
          <line x1={d2(to)} y1={d2(y)} x2={d2(to)} y2={d2(y + drop)} stroke={GUIDE} strokeWidth="1" strokeDasharray="3 3" />
        </>
      )}
      <line
        x1={d2(from)}
        y1={d2(y + drop)}
        x2={d2(to)}
        y2={d2(y + drop)}
        stroke={SHIFT}
        strokeWidth="1.4"
        markerStart="url(#dgmarrow)"
        markerEnd="url(#dgmarrow)"
      />
      <text x={d2((from + to) / 2)} y={d2(y + drop) + 13} textAnchor="middle" className="dgmlab" fill={SHIFT}>{label}</text>
    </>
  );
}

/** A horizontal line across the figure: a price the government has set. */
function Flat({ y, label, colour = SHIFT }: { y: number; label: string; colour?: string }) {
  return (
    <>
      <line x1="44" y1={d2(y)} x2="300" y2={d2(y)} stroke={colour} strokeWidth="1.6" />
      <text x="304" y={d2(y) + 4} className="dgmlab" fill={colour}>{label}</text>
    </>
  );
}

/** The box a tax raises or a subsidy costs, shaded so its area reads as the amount. */
function Box({ x1, x2, y1, y2, label }: { x1: number; x2: number; y1: number; y2: number; label: string }) {
  return (
    <>
      <rect
        x={d2(Math.min(x1, x2))}
        y={d2(Math.min(y1, y2))}
        width={d2(Math.abs(x2 - x1))}
        height={d2(Math.abs(y2 - y1))}
        fill={SHIFT}
        fillOpacity="0.12"
        stroke={SHIFT}
        strokeWidth="0.8"
        strokeDasharray="3 3"
      />
      <text x={d2(Math.min(x1, x2)) + 6} y={d2(Math.min(y1, y2)) + 13} className="dgmlab" fill={SHIFT}>{label}</text>
    </>
  );
}

/** A point a given fraction along a straight line. */
const along = (l: Line, t: number): Pt => ({ x: l.a.x + (l.b.x - l.a.x) * t, y: l.a.y + (l.b.y - l.a.y) * t });

function Frame({ children, x, y, caption }: { children: React.ReactNode; x: string; y: string; caption?: string }) {
  return (
    <figure className="dgm">
      <svg viewBox="0 0 320 240" role="img" aria-label={caption ?? `${y} against ${x}`}>
        <defs>
          <marker id="dgmarrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill={SHIFT} />
          </marker>
        </defs>
        <line x1="44" y1="200" x2="304" y2="200" stroke={AXIS} strokeWidth="1.5" />
        <line x1="44" y1="200" x2="44" y2="16" stroke={AXIS} strokeWidth="1.5" />
        <text x="304" y="220" textAnchor="end" className="dgmlab">{x}</text>
        <text x="40" y="12" className="dgmlab">{y}</text>
        {children}
      </svg>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

/** Dashed lines from an equilibrium out to both axes, with the two values named. */
function Eq({ at, px, qx, colour }: { at: Pt; px: string; qx: string; colour: string }) {
  return (
    <>
      <line x1="44" y1={d2(at.y)} x2={d2(at.x)} y2={d2(at.y)} stroke={GUIDE} strokeWidth="1" strokeDasharray="3 3" />
      <line x1={d2(at.x)} y1={d2(at.y)} x2={d2(at.x)} y2="200" stroke={GUIDE} strokeWidth="1" strokeDasharray="3 3" />
      <circle cx={d2(at.x)} cy={d2(at.y)} r="3.5" fill={colour} />
      <text x="40" y={d2(at.y) + 4} textAnchor="end" className="dgmlab" fill={colour}>{px}</text>
      {qx && <text x={d2(at.x)} y="214" textAnchor="middle" className="dgmlab" fill={colour}>{qx}</text>}
    </>
  );
}

function Straight({ l, label, colour, dashed }: { l: Line; label: string; colour: string; dashed?: boolean }) {
  return (
    <>
      <line
        x1={l.a.x}
        y1={l.a.y}
        x2={l.b.x}
        y2={l.b.y}
        stroke={colour}
        strokeWidth="2"
        strokeDasharray={dashed ? "5 4" : undefined}
      />
      <text x={l.b.x + 4} y={l.b.y + 4} className="dgmcur" fill={colour}>{label}</text>
    </>
  );
}

/** Demand and supply for a currency, with demand shifting right. */
function ExchangeRate({ caption }: { caption?: string }) {
  const d1 = line({ x: 62, y: 46 }, { x: 246, y: 184 });
  const s1 = line({ x: 62, y: 184 }, { x: 258, y: 42 });
  const d2line = shiftX(d1, 46);
  const e1 = cross(d1, s1);
  const e2 = cross(d2line, s1);
  return (
    <Frame x="Quantity of $" y="Price of $ in €" caption={caption}>
      <Straight l={s1} label="S₁" colour={CURVE} />
      <Straight l={d1} label="D₁" colour={CURVE} />
      <Straight l={d2line} label="D₂" colour={SHIFT} dashed />
      <Shift from={along(d1, 0.26)} to={along(d2line, 0.26)} />
      <Eq at={e1} px="e₁" qx="Q₁" colour={CURVE} />
      <Eq at={e2} px="e₂" qx="Q₂" colour={SHIFT} />
    </Frame>
  );
}

/**
 * AD/AS in the Keynesian shape: flat while there is spare capacity, rising as the economy tightens,
 * vertical at full employment. AD₁ crosses the flat range and AD₂ the rising one, which is the
 * point the notes make — the same shift does different things depending on where the economy is.
 */
function AdAs({ caption }: { caption?: string }) {
  const FLAT_Y = 162;
  const KINK = 132;
  const FULL = 244;
  const as: Pt[] = [{ x: 56, y: FLAT_Y }, { x: KINK, y: FLAT_Y }];
  for (let i = 1; i <= 24; i++) {
    const t = i / 24;
    as.push({ x: KINK + (FULL - KINK) * t, y: FLAT_Y - (FLAT_Y - 34) * t * t });
  }
  const ad1 = line({ x: 56, y: 92 }, { x: 196, y: 200 });
  const ad2 = shiftX(ad1, 72);
  const e1 = crossPath(as, ad1);
  const e2 = crossPath(as, ad2);
  return (
    <Frame x="Real output" y="Price level" caption={caption}>
      <path d={`M${as.map((p) => `${d2(p.x)} ${d2(p.y)}`).join(" L")}`} fill="none" stroke={CURVE} strokeWidth="2" />
      <text x={FULL - 22} y="28" className="dgmcur">AS</text>
      <line x1={FULL} y1="200" x2={FULL} y2="30" stroke={AXIS} strokeWidth="1.5" strokeDasharray="4 4" />
      <text x={FULL + 4} y="44" className="dgmlab">Yf</text>
      <Straight l={ad1} label="AD₁" colour={CURVE} />
      <Straight l={ad2} label="AD₂" colour={SHIFT} dashed />
      <Shift from={along(ad1, 0.2)} to={along(ad2, 0.2)} />
      <Eq at={e1} px="P₁" qx="Y₁" colour={CURVE} />
      <Eq at={e2} px="P₂" qx="Y₂" colour={SHIFT} />
    </Frame>
  );
}


/** The base market: demand and supply as every microeconomics diagram in these notes draws them. */
const D1 = line({ x: 62, y: 46 }, { x: 250, y: 190 });
const S1 = line({ x: 62, y: 190 }, { x: 258, y: 42 });

/**
 * An indirect tax of t per unit. Supply shifts up by the tax, the price the consumer pays rises by
 * less than t, and the difference between the two prices is what the producer absorbs — which is
 * the whole point of the diagram: the split is decided by the elasticities, not by the tax.
 */
function IndirectTax({ caption }: { caption?: string }) {
  const T = 38;
  const s2 = shiftY(S1, -T);
  const e1 = cross(D1, S1);
  const e2 = cross(D1, s2);
  const kept = e2.y + T; // what the producer is left with, read off S₁ at Q₂
  return (
    <Frame x="Quantity" y="Price" caption={caption}>
      <Box x1={44} x2={e2.x} y1={e2.y} y2={kept} label="tax revenue" />
      <Straight l={S1} label="S₁" colour={CURVE} />
      <Straight l={clip(s2)} label="S₂" colour={SHIFT} dashed />
      <Straight l={D1} label="D₁" colour={CURVE} />
      <Shift from={along(S1, 0.62)} to={along(s2, 0.62)} />
      <Eq at={e1} px="P₁" qx="Q₁" colour={CURVE} />
      <Eq at={e2} px="P₂" qx="Q₂" colour={SHIFT} />
      <line x1="44" y1={d2(kept)} x2={d2(e2.x)} y2={d2(kept)} stroke={GUIDE} strokeWidth="1" strokeDasharray="3 3" />
      <text x="40" y={d2(kept) + 4} textAnchor="end" className="dgmlab" fill={SHIFT}>P₂−t</text>
    </Frame>
  );
}

/**
 * A subsidy of s per unit: supply shifts down by the subsidy, the price falls, the quantity rises,
 * and the shaded box is what it costs the government — the figure the four-mark question asks for.
 */
function Subsidy({ caption }: { caption?: string }) {
  const S = 38;
  const s2 = shiftY(S1, S);
  const e1 = cross(D1, S1);
  const e2 = cross(D1, s2);
  const got = e2.y - S; // what the producer receives, subsidy included
  return (
    <Frame x="Quantity" y="Price" caption={caption}>
      <Box x1={44} x2={e2.x} y1={e2.y} y2={got} label="cost to government" />
      <Straight l={S1} label="S₁" colour={CURVE} />
      <Straight l={clip(s2)} label="S₂" colour={SHIFT} dashed />
      <Straight l={D1} label="D₁" colour={CURVE} />
      <Shift from={along(S1, 0.62)} to={along(s2, 0.62)} />
      <Eq at={e1} px="P₁" qx="Q₁" colour={CURVE} />
      <Eq at={e2} px="P₂" qx="Q₂" colour={SHIFT} />
      <line x1="44" y1={d2(got)} x2={d2(e2.x)} y2={d2(got)} stroke={GUIDE} strokeWidth="1" strokeDasharray="3 3" />
      <text x="40" y={d2(got) + 4} textAnchor="end" className="dgmlab" fill={SHIFT}>P₂+s</text>
    </Frame>
  );
}

/** A maximum price below equilibrium: quantity supplied falls short of quantity demanded. */
function PriceCeiling({ caption }: { caption?: string }) {
  const e1 = cross(D1, S1);
  const pc = e1.y + 34;
  const qs = atY(S1, pc);
  const qd = atY(D1, pc);
  return (
    <Frame x="Quantity" y="Price" caption={caption}>
      <Straight l={S1} label="S₁" colour={CURVE} />
      <Straight l={D1} label="D₁" colour={CURVE} />
      <Eq at={e1} px="P₁" qx="Q₁" colour={CURVE} />
      <Flat y={pc} label="Pc" />
      <circle cx={d2(qs.x)} cy={d2(pc)} r="3" fill={SHIFT} />
      <circle cx={d2(qd.x)} cy={d2(pc)} r="3" fill={SHIFT} />
      <Gap from={qs.x} to={qd.x} y={pc} drop={18} label="shortage" />
      <text x={d2(qs.x)} y="214" textAnchor="middle" className="dgmlab" fill={SHIFT}>Qs</text>
      <text x={d2(qd.x)} y="214" textAnchor="middle" className="dgmlab" fill={SHIFT}>Qd</text>
    </Frame>
  );
}

/**
 * Why elasticity decides the size of a price change: the same rise in demand along a steep supply
 * curve raises the price far more than along a flat one. Both supply curves pass through the first
 * equilibrium, so only the elasticity differs.
 */
function SupplyElasticity({ caption }: { caption?: string }) {
  const at = { x: 150, y: 140 };
  // Every curve is built through the same first equilibrium, so only the slopes differ.
  const through = (dir: Pt, back: number, on: number): Line =>
    line({ x: at.x - dir.x * back, y: at.y - dir.y * back }, { x: at.x + dir.x * on, y: at.y + dir.y * on });
  const d1 = through({ x: 1, y: 0.78 }, 88, 62);
  const d2line = shiftX(d1, 62);
  const steep = through({ x: 1, y: -4.2 }, 13, 15);
  const flat = through({ x: 1, y: -0.3 }, 88, 94);
  const e2 = cross(d2line, steep);
  const e3 = cross(d2line, flat);
  return (
    <Frame x="Quantity" y="Price" caption={caption}>
      <Straight l={steep} label="S inelastic" colour={CURVE} />
      <Straight l={flat} label="S elastic" colour={AXIS} />
      <Straight l={d1} label="D₁" colour={CURVE} />
      <Straight l={clip(d2line)} label="D₂" colour={SHIFT} dashed />
      <Shift from={along(d1, 0.56)} to={along(d2line, 0.56)} />
      <Eq at={at} px="P₁" qx="Q₁" colour={CURVE} />
      <Eq at={e2} px="P₂" qx="" colour={SHIFT} />
      <circle cx={d2(e3.x)} cy={d2(e3.y)} r="3.5" fill={AXIS} />
      <line x1="44" y1={d2(e3.y)} x2={d2(e3.x)} y2={d2(e3.y)} stroke={GUIDE} strokeWidth="1" strokeDasharray="3 3" />
      <text x="40" y={d2(e3.y) + 4} textAnchor="end" className="dgmlab" fill={AXIS}>P₃</text>
    </Frame>
  );
}

const DIAGRAMS: Record<string, (p: { caption?: string }) => React.ReactElement> = {
  "exchange-rate": ExchangeRate,
  "ad-as": AdAs,
  "indirect-tax": IndirectTax,
  subsidy: Subsidy,
  "price-ceiling": PriceCeiling,
  "supply-elasticity": SupplyElasticity,
};

export function Diagram({ name, caption }: { name: string; caption?: string }) {
  const D = DIAGRAMS[name];
  if (!D) return null;
  return <D caption={caption} />;
}

export const hasDiagram = (name: string) => name in DIAGRAMS;
