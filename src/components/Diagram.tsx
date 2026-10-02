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
      <text x={d2(at.x)} y="214" textAnchor="middle" className="dgmlab" fill={colour}>{qx}</text>
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
