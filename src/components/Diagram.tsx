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

/** Where a line is at a given horizontal position. */
const atX = (l: Line, x: number): Pt => cross(l, line({ x, y: 0 }, { x, y: 240 }));

/** A line of a given direction through a point, running `back` before it and `on` after it. */
const thru = (at: Pt, dir: Pt, back: number, on: number): Line =>
  line({ x: at.x - dir.x * back, y: at.y - dir.y * back }, { x: at.x + dir.x * on, y: at.y + dir.y * on });

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
      <text x={d2((from + to) / 2)} y={d2(y + drop) + (drop < 0 ? -6 : 13)} textAnchor="middle" className="dgmlab" fill={SHIFT}>{label}</text>
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
          <marker id="dgmarrowink" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill={CURVE} />
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
      {l.b.x + label.length * 6.2 > 304 ? (
        <text x={d2(l.b.x) - 4} y={d2(l.b.y) - 7} textAnchor="end" className="dgmcur" fill={colour}>{label}</text>
      ) : (
        <text x={d2(l.b.x) + 4} y={d2(l.b.y) + 4} className="dgmcur" fill={colour}>{label}</text>
      )}
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
      <Straight l={clip(ad2)} label="AD₂" colour={SHIFT} dashed />
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

/**
 * The monetarist, or new classical, model: a vertical long-run supply curve at full employment, a
 * short-run curve that moves, and an economy that returns to Yf on its own. Demand rises, output
 * overshoots, money wages then rise and the short-run curve moves back until only the price level
 * has changed.
 */
function AdAsMonetarist({ caption }: { caption?: string }) {
  const YF = 176;
  const e1 = { x: YF, y: 136 };
  const sras1 = thru(e1, { x: 1, y: -0.8 }, 104, 74);
  const ad1 = thru(e1, { x: 1, y: 0.95 }, 100, 62);
  const ad2 = shiftX(ad1, 66);
  const short = cross(ad2, sras1);
  const e3 = atX(ad2, YF);
  // The short-run curve rises until it meets the new demand curve back on the vertical line.
  const sras2 = shiftY(sras1, e3.y - atX(sras1, YF).y);
  return (
    <Frame x="Real output" y="Price level" caption={caption}>
      <line x1={YF} y1="200" x2={YF} y2="30" stroke={CURVE} strokeWidth="2" />
      <text x={YF} y="26" textAnchor="middle" className="dgmcur">LRAS</text>
      <Straight l={clip(sras1)} label="SRAS₁" colour={CURVE} />
      <Straight l={clip(sras2)} label="SRAS₂" colour={SHIFT} dashed />
      <Straight l={clip(ad1)} label="AD₁" colour={CURVE} />
      <Straight l={clip(ad2)} label="AD₂" colour={SHIFT} dashed />
      <Shift from={along(clip(sras1), 0.3)} to={along(clip(sras2), 0.3)} />
      <Eq at={e1} px="P₁" qx="Yf" colour={CURVE} />
      <circle cx={d2(short.x)} cy={d2(short.y)} r="3.5" fill={AXIS} />
      <text x={d2(short.x) + 6} y={d2(short.y) + 4} className="dgmlab" fill={AXIS}>short run</text>
      <circle cx={d2(e3.x)} cy={d2(e3.y)} r="3.5" fill={SHIFT} />
      <line x1="44" y1={d2(e3.y)} x2={d2(e3.x)} y2={d2(e3.y)} stroke={GUIDE} strokeWidth="1" strokeDasharray="3 3" />
      <text x="40" y={d2(e3.y) + 4} textAnchor="end" className="dgmlab" fill={SHIFT}>P₂</text>
    </Frame>
  );
}

/** The business cycle: output swinging around a rising trend, with the phases named. */
function BusinessCycle({ caption }: { caption?: string }) {
  const pts: Pt[] = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    const x = 52 + t * 244;
    pts.push({ x, y: 150 - t * 70 - Math.sin(t * Math.PI * 2.4) * 34 });
  }
  const peak = pts.reduce((a, b) => (b.y < a.y && b.x < 160 ? b : a), pts[0]!);
  const trough = pts.reduce((a, b) => (b.y > a.y && b.x > peak.x && b.x < 230 ? b : a), pts[20]!);
  return (
    <Frame x="Time" y="Real output" caption={caption}>
      <line x1="52" y1="150" x2="296" y2="80" stroke={AXIS} strokeWidth="1.4" strokeDasharray="5 4" />
      <text x="196" y="102" textAnchor="middle" className="dgmlab">trend</text>
      <path d={`M${pts.map((q) => `${d2(q.x)} ${d2(q.y)}`).join(" L")}`} fill="none" stroke={CURVE} strokeWidth="2" />
      <circle cx={d2(peak.x)} cy={d2(peak.y)} r="3.5" fill={SHIFT} />
      <text x={d2(peak.x)} y={d2(peak.y) - 8} textAnchor="middle" className="dgmlab" fill={SHIFT}>peak</text>
      <circle cx={d2(trough.x)} cy={d2(trough.y)} r="3.5" fill={SHIFT} />
      <text x={d2(trough.x)} y={d2(trough.y) + 16} textAnchor="middle" className="dgmlab" fill={SHIFT}>trough</text>
      <text x={d2((peak.x + trough.x) / 2)} y={d2(trough.y) + 32} textAnchor="middle" className="dgmlab">contraction</text>
    </Frame>
  );
}

/** A shaded triangle: the welfare loss between the social optimum and what the market does. */
function Loss({ a, b, c, label }: { a: Pt; b: Pt; c: Pt; label: string }) {
  return (
    <>
      <polygon
        points={[a, b, c].map((p) => `${d2(p.x)},${d2(p.y)}`).join(" ")}
        fill={SHIFT}
        fillOpacity="0.16"
        stroke={SHIFT}
        strokeWidth="0.8"
      />
      <text
        x={d2((a.x + b.x + c.x) / 3)}
        y={d2(Math.min(a.y, b.y, c.y)) - 6}
        textAnchor="middle"
        className="dgmlab"
        fill={SHIFT}
      >
        {label}
      </text>
    </>
  );
}

/**
 * A negative production externality: the private cost of producing is below the cost to society, so
 * the market produces past the point where the two are equal. The shaded triangle is what that
 * overproduction costs society.
 */
function ExternalityProduction({ caption }: { caption?: string }) {
  const mpc = line({ x: 60, y: 186 }, { x: 250, y: 56 });
  const msc = shiftY(mpc, -42);
  const d = line({ x: 60, y: 48 }, { x: 252, y: 188 });
  const market = cross(mpc, d);
  const best = cross(msc, d);
  return (
    <Frame x="Quantity" y="Costs and benefits" caption={caption}>
      <Loss a={best} b={{ x: market.x, y: market.y }} c={atX(msc, market.x)} label="welfare loss" />
      <Straight l={mpc} label="MPC = S" colour={CURVE} />
      <Straight l={clip(msc)} label="MSC" colour={SHIFT} />
      <Straight l={d} label="D = MPB = MSB" colour={CURVE} />
      <Eq at={market} px="P₁" qx="Q₁" colour={CURVE} />
      <Eq at={best} px="P*" qx="Q*" colour={SHIFT} />
    </Frame>
  );
}

/**
 * A negative consumption externality: the benefit to the consumer is above the benefit to society,
 * so the market consumes past the point where the two are equal.
 */
function ExternalityConsumption({ caption }: { caption?: string }) {
  const s = line({ x: 60, y: 186 }, { x: 250, y: 56 });
  const mpb = line({ x: 60, y: 48 }, { x: 252, y: 188 });
  const msb = shiftY(mpb, 40);
  const market = cross(s, mpb);
  const best = cross(s, msb);
  return (
    <Frame x="Quantity" y="Costs and benefits" caption={caption}>
      <Loss a={best} b={{ x: market.x, y: market.y }} c={atX(msb, market.x)} label="welfare loss" />
      <Straight l={s} label="S = MPC = MSC" colour={CURVE} />
      <Straight l={mpb} label="D = MPB" colour={CURVE} />
      <Straight l={clip(msb)} label="MSB" colour={SHIFT} />
      <Eq at={market} px="P₁" qx="Q₁" colour={CURVE} />
      <Eq at={best} px="P*" qx="Q*" colour={SHIFT} />
    </Frame>
  );
}

/** The market answering a change in demand: the shift, and the new price and quantity. */
function DemandShift({ caption }: { caption?: string }) {
  const d1 = line({ x: 62, y: 46 }, { x: 250, y: 190 });
  const s1 = line({ x: 62, y: 190 }, { x: 258, y: 42 });
  const d2line = shiftX(d1, 52);
  const e1 = cross(d1, s1);
  const e2 = cross(d2line, s1);
  return (
    <Frame x="Quantity" y="Price" caption={caption}>
      <Straight l={s1} label="S₁" colour={CURVE} />
      <Straight l={d1} label="D₁" colour={CURVE} />
      <Straight l={clip(d2line)} label="D₂" colour={SHIFT} dashed />
      <Shift from={along(d1, 0.28)} to={along(d2line, 0.28)} />
      <Eq at={e1} px="P₁" qx="Q₁" colour={CURVE} />
      <Eq at={e2} px="P₂" qx="Q₂" colour={SHIFT} />
    </Frame>
  );
}

/**
 * A positive consumption externality: the benefit to society is above the benefit to the consumer,
 * so the market consumes less than the social optimum. Education, health care and vaccination are
 * the examples the papers use.
 */
function ExternalityPositive({ caption }: { caption?: string }) {
  const s = line({ x: 60, y: 186 }, { x: 250, y: 56 });
  const mpb = line({ x: 58, y: 56 }, { x: 236, y: 190 });
  const msb = shiftX(mpb, 54);
  const market = cross(s, mpb);
  const best = cross(s, msb);
  return (
    <Frame x="Quantity" y="Costs and benefits" caption={caption}>
      <Loss a={market} b={best} c={atX(msb, market.x)} label="welfare loss" />
      <Straight l={s} label="S = MSC" colour={CURVE} />
      <Straight l={mpb} label="D = MPB" colour={CURVE} />
      <Straight l={clip(msb)} label="MSB" colour={SHIFT} />
      <Eq at={market} px="P₁" qx="Q₁" colour={CURVE} />
      <Eq at={best} px="P*" qx="Q*" colour={SHIFT} />
    </Frame>
  );
}

/**
 * Monopoly. Marginal revenue falls twice as fast as demand, output is where MC cuts MR, and the
 * price is read up from there to the demand curve — never off MC. The shaded box is abnormal
 * profit, the difference between price and average cost over the quantity sold.
 */
function Monopoly({ caption }: { caption?: string }) {
  const d = line({ x: 58, y: 40 }, { x: 274, y: 192 });
  // Marginal revenue starts at the same point and falls twice as steeply.
  const mr = line({ x: 58, y: 40 }, { x: 166, y: 192 });
  // Average cost is a parabola; marginal cost runs through its lowest point, as it must.
  const vertex = { x: 170, y: 150 };
  const ac: Pt[] = [];
  for (let i = 0; i <= 40; i++) {
    const x = 80 + (i / 40) * 160;
    ac.push({ x, y: vertex.y - Math.pow((x - vertex.x) / 42, 2) * 26 });
  }
  const mc = thru(vertex, { x: 1, y: -1.6 }, 70, 52);
  const qm = cross(mr, mc);
  const price = atX(d, qm.x);
  const cost = { x: qm.x, y: vertex.y - Math.pow((qm.x - vertex.x) / 42, 2) * 26 };
  return (
    <Frame x="Quantity" y="Price and cost" caption={caption}>
      <Box x1={44} x2={qm.x} y1={price.y} y2={cost.y} label="abnormal profit" />
      <path d={`M${ac.map((p) => `${d2(p.x)} ${d2(p.y)}`).join(" L")}`} fill="none" stroke={CURVE} strokeWidth="1.8" />
      <text x={d2(ac[ac.length - 1]!.x) + 4} y={d2(ac[ac.length - 1]!.y) + 4} className="dgmcur">AC</text>
      <Straight l={clip(mc)} label="MC" colour={CURVE} />
      <Straight l={d} label="D = AR" colour={CURVE} />
      <Straight l={mr} label="MR" colour={AXIS} />
      <line x1={d2(qm.x)} y1="200" x2={d2(qm.x)} y2={d2(qm.y)} stroke={GUIDE} strokeWidth="1" strokeDasharray="3 3" />
      <circle cx={d2(qm.x)} cy={d2(qm.y)} r="3" fill={AXIS} />
      <text x={d2(qm.x)} y="214" textAnchor="middle" className="dgmlab" fill={SHIFT}>Qm</text>
      <circle cx={d2(price.x)} cy={d2(price.y)} r="3.5" fill={SHIFT} />
      <line x1="44" y1={d2(price.y)} x2={d2(price.x)} y2={d2(price.y)} stroke={GUIDE} strokeWidth="1" strokeDasharray="3 3" />
      <text x="40" y={d2(price.y) + 4} textAnchor="end" className="dgmlab" fill={SHIFT}>Pm</text>
      <line x1="44" y1={d2(cost.y)} x2={d2(cost.x)} y2={d2(cost.y)} stroke={GUIDE} strokeWidth="1" strokeDasharray="3 3" />
      <text x="40" y={d2(cost.y) + 4} textAnchor="end" className="dgmlab" fill={AXIS}>AC</text>
    </Frame>
  );
}

/** A figure with no axes, for the diagrams that are a cycle rather than a market. */
function Plain({ children, caption, label }: { children: React.ReactNode; caption?: string; label: string }) {
  return (
    <figure className="dgm">
      <svg viewBox="0 0 320 240" role="img" aria-label={caption ?? label}>
        <defs>
          <marker id="dgmarrowink" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill={CURVE} />
          </marker>
        </defs>
        {children}
      </svg>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

/**
 * The poverty cycle, which twelve past questions ask to be drawn. Each stage causes the next, and
 * the question is always where an intervention breaks the ring.
 */
function PovertyCycle({ caption }: { caption?: string }) {
  const nodes = [
    { x: 92, y: 44, text: "Low income" },
    { x: 238, y: 92, text: "Low saving" },
    { x: 196, y: 196, text: "Low investment" },
    { x: 66, y: 148, text: "Low productivity" },
  ];
  // Each arrow starts and ends clear of the words it joins, so no arrowhead lands on a letter.
  const arrow = (a: (typeof nodes)[number], b: (typeof nodes)[number]) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const half = (n: (typeof nodes)[number]) => n.text.length * 3.4 + 5;
    return {
      x1: d2(a.x + ux * half(a)),
      y1: d2(a.y + uy * 13 + 4),
      x2: d2(b.x - ux * half(b)),
      y2: d2(b.y - uy * 13 + 4),
    };
  };
  return (
    <Plain caption={caption} label="the poverty cycle">
      {nodes.map((n, i) => {
        const next = nodes[(i + 1) % nodes.length]!;
        return (
          <g key={n.text}>
            <line {...arrow(n, next)} stroke={CURVE} strokeWidth="1.6" markerEnd="url(#dgmarrowink)" />
            <text x={d2(n.x)} y={d2(n.y)} textAnchor="middle" className="dgmcur">{n.text}</text>
          </g>
        );
      })}
    </Plain>
  );
}

/**
 * The international trade diagram with a tariff. Domestic supply and demand, a world price below
 * the domestic equilibrium, and the tariff that lifts it. Four quantities are read off the two
 * price lines, and the shaded box is the revenue the tariff raises.
 */
function Tariff({ caption }: { caption?: string }) {
  const d = line({ x: 58, y: 36 }, { x: 268, y: 192 });
  const sup = line({ x: 58, y: 192 }, { x: 240, y: 36 });
  const home = cross(d, sup);
  const pw = home.y + 48;
  const pt = pw - 26;
  const q1 = atY(sup, pw).x;
  const q2 = atY(sup, pt).x;
  const q3 = atY(d, pt).x;
  const q4 = atY(d, pw).x;
  return (
    <Frame x="Quantity" y="Price" caption={caption}>
      <Box x1={q2} x2={q3} y1={pw} y2={pt} label="revenue" />
      <Straight l={sup} label="S domestic" colour={CURVE} />
      <Straight l={d} label="D domestic" colour={CURVE} />
      <line x1="48" y1={d2(pw)} x2="296" y2={d2(pw)} stroke={AXIS} strokeWidth="1.6" />
      <text x="300" y={d2(pw) - 5} textAnchor="end" className="dgmlab">Pw</text>
      <line x1="48" y1={d2(pt)} x2="296" y2={d2(pt)} stroke={SHIFT} strokeWidth="1.6" />
      <text x="300" y={d2(pt) - 5} textAnchor="end" className="dgmlab" fill={SHIFT}>Pw + tariff</text>
      {[
        [q1, "Q₁"],
        [q2, "Q₂"],
        [q3, "Q₃"],
        [q4, "Q₄"],
      ].map(([x, t]) => (
        <g key={t as string}>
          <line x1={d2(x as number)} y1="200" x2={d2(x as number)} y2={d2(x === q1 || x === q4 ? pw : pt)} stroke={GUIDE} strokeWidth="1" strokeDasharray="3 3" />
          <text x={d2(x as number)} y="214" textAnchor="middle" className="dgmlab">{t as string}</text>
        </g>
      ))}
    </Frame>
  );
}

/**
 * The production possibilities curve: the combinations an economy can produce with everything it
 * has. A point inside is unemployment or inefficiency; the outward shift is growth.
 */
function Ppc({ caption }: { caption?: string }) {
  const curve = (r: number): Pt[] => {
    const out: Pt[] = [];
    for (let i = 0; i <= 40; i++) {
      const t = (i / 40) * (Math.PI / 2);
      out.push({ x: 50 + Math.sin(t) * r, y: 198 - Math.cos(t) * r * 0.82 });
    }
    return out;
  };
  const p1 = curve(150);
  const p2 = curve(196);
  const at = p1[16]!;
  const inside = { x: at.x - 36, y: at.y + 26 };
  return (
    <Frame x="Consumer goods" y="Capital goods" caption={caption}>
      <path d={`M${p1.map((p) => `${d2(p.x)} ${d2(p.y)}`).join(" L")}`} fill="none" stroke={CURVE} strokeWidth="2" />
      <path d={`M${p2.map((p) => `${d2(p.x)} ${d2(p.y)}`).join(" L")}`} fill="none" stroke={SHIFT} strokeWidth="2" strokeDasharray="5 4" />
      <text x={d2(p1[37]!.x) + 6} y={d2(p1[37]!.y) - 6} className="dgmcur">PPC₁</text>
      <text x={d2(p2[7]!.x) + 8} y={d2(p2[7]!.y) + 2} className="dgmcur" fill={SHIFT}>PPC₂</text>
      <Shift from={p1[20]!} to={p2[20]!} />
      <circle cx={d2(at.x)} cy={d2(at.y)} r="3.5" fill={CURVE} />
      <text x={d2(at.x) + 6} y={d2(at.y) + 4} className="dgmlab">A · efficient</text>
      <circle cx={d2(inside.x)} cy={d2(inside.y)} r="3.5" fill={AXIS} />
      <text x={d2(inside.x) + 6} y={d2(inside.y) + 4} className="dgmlab">B · unemployment</text>
    </Frame>
  );
}

/**
 * The Lorenz curve. The straight line is perfect equality; the further the curve bends away from
 * it, the more unequal the distribution. The Gini coefficient is the area between the two divided
 * by the whole area under the line of equality.
 */
function Lorenz({ caption }: { caption?: string }) {
  const x0 = 46;
  const y0 = 198;
  const w = 212;
  const h = 164;
  const bend = (power: number): Pt[] => {
    const out: Pt[] = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      out.push({ x: x0 + t * w, y: y0 - Math.pow(t, power) * h });
    }
    return out;
  };
  const c1 = bend(2.1);
  const c2 = bend(3.4);
  const path = (ps: Pt[]) => `M${ps.map((p) => `${d2(p.x)} ${d2(p.y)}`).join(" L")}`;
  return (
    <Frame x="Cumulative % of population" y="Cumulative % of income" caption={caption}>
      <line x1={x0} y1={y0} x2={d2(x0 + w)} y2={d2(y0 - h)} stroke={AXIS} strokeWidth="1.6" />
      <text x={d2(x0 + w) - 2} y={d2(y0 - h) - 7} textAnchor="end" className="dgmlab">line of equality</text>
      <path d={path(c1)} fill="none" stroke={CURVE} strokeWidth="2" />
      <text x={d2(c1[30]!.x) + 6} y={d2(c1[30]!.y) + 12} className="dgmcur">L₁</text>
      <path d={path(c2)} fill="none" stroke={SHIFT} strokeWidth="2" strokeDasharray="5 4" />
      <text x={d2(c2[34]!.x) + 6} y={d2(c2[34]!.y) + 12} className="dgmcur" fill={SHIFT}>L₂</text>
      <Shift from={c1[24]!} to={c2[24]!} />
      <text x={d2(x0 + w * 0.46)} y={d2(y0 - h * 0.52)} className="dgmlab">A</text>
      <text x={d2(x0 + w * 0.72)} y={d2(y0 - h * 0.12)} className="dgmlab">B</text>
    </Frame>
  );
}

/**
 * A fixed rate under downward pressure. Demand for the currency falls, the announced rate ē does
 * not move, and the gap at that rate is what the central bank has to buy with its reserves. The
 * hollow point is where the rate would have gone if it had been left to float.
 */
function FixedRate({ caption }: { caption?: string }) {
  const d1 = line({ x: 62, y: 46 }, { x: 246, y: 184 });
  const s1 = line({ x: 62, y: 184 }, { x: 258, y: 42 });
  const dFall = shiftX(d1, -44);
  const e1 = cross(d1, s1);
  const floatTo = cross(dFall, s1);
  const qd = atY(dFall, e1.y);
  return (
    <Frame x="Quantity of $" y="Price of $ in €" caption={caption}>
      <Straight l={s1} label="S₁" colour={CURVE} />
      <Straight l={d1} label="D₁" colour={CURVE} />
      <Straight l={clip(dFall)} label="D₂" colour={SHIFT} dashed />
      <Shift from={along(d1, 0.72)} to={along(dFall, 0.72)} />
      <line x1="44" y1={d2(e1.y)} x2="296" y2={d2(e1.y)} stroke={CURVE} strokeWidth="1.6" />
      <text x="300" y={d2(e1.y) - 5} textAnchor="end" className="dgmlab">ē fixed</text>
      <circle cx={d2(qd.x)} cy={d2(e1.y)} r="3" fill={SHIFT} />
      <circle cx={d2(e1.x)} cy={d2(e1.y)} r="3.5" fill={CURVE} />
      <Gap from={qd.x} to={e1.x} y={e1.y} drop={-18} label="central bank buys" />
      <circle cx={d2(floatTo.x)} cy={d2(floatTo.y)} r="3.5" fill={AXIS} />
      <line x1="44" y1={d2(floatTo.y)} x2={d2(floatTo.x)} y2={d2(floatTo.y)} stroke={GUIDE} strokeWidth="1" strokeDasharray="3 3" />
      <text x="40" y={d2(floatTo.y) + 4} textAnchor="end" className="dgmlab" fill={AXIS}>e₂</text>
    </Frame>
  );
}

/** Demand for the currency falls: the rate depreciates. */
function ExchangeRateFall({ caption }: { caption?: string }) {
  const d1 = line({ x: 62, y: 46 }, { x: 246, y: 184 });
  const s1 = line({ x: 62, y: 184 }, { x: 258, y: 42 });
  const dFall = shiftX(d1, -46);
  const e1 = cross(d1, s1);
  const e2 = cross(dFall, s1);
  return (
    <Frame x="Quantity of the currency" y="Exchange rate" caption={caption}>
      <Straight l={s1} label="S₁" colour={CURVE} />
      <Straight l={d1} label="D₁" colour={CURVE} />
      <Straight l={clip(dFall)} label="D₂" colour={SHIFT} dashed />
      <Shift from={along(d1, 0.3)} to={along(dFall, 0.3)} />
      <Eq at={e1} px="e₁" qx="Q₁" colour={CURVE} />
      <Eq at={e2} px="e₂" qx="Q₂" colour={SHIFT} />
    </Frame>
  );
}

/** More of the currency is sold to pay for imports: supply shifts right and the rate falls. */
function ExchangeRateSupply({ caption }: { caption?: string }) {
  const d1 = line({ x: 62, y: 46 }, { x: 246, y: 184 });
  const s1 = line({ x: 62, y: 184 }, { x: 240, y: 42 });
  const s2 = shiftX(s1, 48);
  const e1 = cross(d1, s1);
  const e2 = cross(d1, s2);
  return (
    <Frame x="Quantity of the currency" y="Exchange rate" caption={caption}>
      <Straight l={s1} label="S₁" colour={CURVE} />
      <Straight l={clip(s2)} label="S₂" colour={SHIFT} dashed />
      <Straight l={d1} label="D₁" colour={CURVE} />
      <Shift from={along(s1, 0.34)} to={along(s2, 0.34)} />
      <Eq at={e1} px="e₁" qx="Q₁" colour={CURVE} />
      <Eq at={e2} px="e₂" qx="Q₂" colour={SHIFT} />
    </Frame>
  );
}

/**
 * The J-curve. After a depreciation the trade balance falls further before it recovers, because
 * quantities take time to respond, and it crosses back above its starting level once they do.
 */
function JCurve({ caption }: { caption?: string }) {
  const zero = 118;
  const start = 70;
  const pts: Pt[] = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    const x = start + t * 200;
    // down into a trough, then up through the zero line into surplus
    pts.push({ x, y: zero + Math.sin(t * Math.PI * 1.1) * 40 - t * 56 });
  }
  const trough = pts.reduce((a, b) => (b.y > a.y ? b : a), pts[0]!);
  const crossing = pts.find((p) => p.x > trough.x && p.y < zero) ?? pts[pts.length - 1]!;
  return (
    <Frame x="Time" y="Trade balance" caption={caption}>
      <line x1="48" y1={zero} x2="300" y2={zero} stroke={AXIS} strokeWidth="1.4" strokeDasharray="4 4" />
      <text x="304" y={zero + 4} textAnchor="end" className="dgmlab">0</text>
      <line x1={start} y1="200" x2={start} y2="34" stroke={GUIDE} strokeWidth="1" strokeDasharray="3 3" />
      <text x={start} y="214" textAnchor="middle" className="dgmlab" fill={SHIFT}>depreciation</text>
      <path d={`M${pts.map((p) => `${d2(p.x)} ${d2(p.y)}`).join(" L")}`} fill="none" stroke={CURVE} strokeWidth="2" />
      <circle cx={d2(trough.x)} cy={d2(trough.y)} r="3.5" fill={SHIFT} />
      <text x={d2(trough.x)} y={d2(trough.y) + 17} textAnchor="middle" className="dgmlab" fill={SHIFT}>deficit widens</text>
      <circle cx={d2(crossing.x)} cy={d2(crossing.y)} r="3.5" fill={SHIFT} />
      <text x={d2(crossing.x) + 7} y={d2(crossing.y) - 7} className="dgmlab" fill={SHIFT}>surplus</text>
    </Frame>
  );
}

/**
 * A minimum price set above equilibrium: the mirror of the price ceiling, and the diagram behind a
 * minimum wage question. Quantity supplied runs past quantity demanded, and the gap is the surplus
 * somebody has to buy or store.
 */
function PriceFloor({ caption }: { caption?: string }) {
  const e1 = cross(D1, S1);
  // Up the page is a higher price, so a floor above equilibrium is a smaller y.
  const pf = e1.y - 34;
  const qd = atY(D1, pf);
  const qs = atY(S1, pf);
  return (
    <Frame x="Quantity" y="Price" caption={caption}>
      <Straight l={S1} label="S₁" colour={CURVE} />
      <Straight l={D1} label="D₁" colour={CURVE} />
      <Eq at={e1} px="P₁" qx="Q₁" colour={CURVE} />
      <Flat y={pf} label="Pf" />
      <circle cx={d2(qd.x)} cy={d2(pf)} r="3" fill={SHIFT} />
      <circle cx={d2(qs.x)} cy={d2(pf)} r="3" fill={SHIFT} />
      <Gap from={qd.x} to={qs.x} y={pf} drop={-16} label="surplus" />
      <text x={d2(qd.x)} y="214" textAnchor="middle" className="dgmlab" fill={SHIFT}>Qd</text>
      <text x={d2(qs.x)} y="214" textAnchor="middle" className="dgmlab" fill={SHIFT}>Qs</text>
    </Frame>
  );
}

/**
 * An import quota: imports are capped at a quantity rather than taxed, so the domestic price rises
 * until home supply plus the quota meets home demand. The difference from a tariff is the shaded
 * box — with a quota it goes to whoever holds the licence to import, not to the government, which
 * is the comparison the essay is asking for.
 */
function Quota({ caption }: { caption?: string }) {
  const d = line({ x: 58, y: 36 }, { x: 268, y: 192 });
  const sup = line({ x: 58, y: 192 }, { x: 240, y: 36 });
  const pw = cross(d, sup).y + 48;
  const QUOTA = 56;
  // The price at which home supply plus the quota exactly meets home demand.
  let pq = pw;
  for (let i = 0; i < 40; i++) {
    const gap = atY(d, pq).x - atY(sup, pq).x;
    if (gap <= QUOTA) break;
    pq -= 1;
  }
  const q1 = atY(sup, pw).x;
  const q4 = atY(d, pw).x;
  const q2 = atY(sup, pq).x;
  const q3 = atY(d, pq).x;
  return (
    <Frame x="Quantity" y="Price" caption={caption}>
      <Box x1={q2} x2={q3} y1={pw} y2={pq} label="gain" />
      <Straight l={sup} label="S domestic" colour={CURVE} />
      <Straight l={d} label="D domestic" colour={CURVE} />
      <line x1="48" y1={d2(pw)} x2="296" y2={d2(pw)} stroke={AXIS} strokeWidth="1.6" />
      <text x="300" y={d2(pw) + 13} textAnchor="end" className="dgmlab">Pw</text>
      <line x1="48" y1={d2(pq)} x2="296" y2={d2(pq)} stroke={SHIFT} strokeWidth="1.6" />
      <text x="300" y={d2(pq) - 5} textAnchor="end" className="dgmlab" fill={SHIFT}>Pq</text>
      <Gap from={q2} to={q3} y={pw} drop={18} label="quota" />
      {([[q1, "Q₁"], [q2, "Q₂"], [q3, "Q₃"], [q4, "Q₄"]] as [number, string][]).map(([x, t]) => (
        <g key={t}>
          <line x1={d2(x)} y1="200" x2={d2(x)} y2={d2(x === q1 || x === q4 ? pw : pq)} stroke={GUIDE} strokeWidth="1" strokeDasharray="3 3" />
          <text x={d2(x)} y="214" textAnchor="middle" className="dgmlab">{t}</text>
        </g>
      ))}
    </Frame>
  );
}

/**
 * Cost-push inflation: short-run supply shifts left, so the price level rises and output falls at
 * the same time. This is the diagram a stagflation question wants, and the one a student who has
 * only learnt the demand-pull picture draws wrongly.
 */
function AdAsCostPush({ caption }: { caption?: string }) {
  const e1 = { x: 168, y: 140 };
  const sras1 = thru(e1, { x: 1, y: -0.85 }, 104, 70);
  const ad1 = thru(e1, { x: 1, y: 0.95 }, 100, 60);
  const sras2 = shiftX(sras1, -54);
  const e2 = cross(ad1, sras2);
  return (
    <Frame x="Real output" y="Price level" caption={caption}>
      <Straight l={clip(sras1)} label="SRAS₁" colour={CURVE} />
      <Straight l={clip(sras2)} label="SRAS₂" colour={SHIFT} dashed />
      <Straight l={clip(ad1)} label="AD" colour={CURVE} />
      <Shift from={along(clip(sras1), 0.35)} to={along(clip(sras2), 0.35)} />
      <Eq at={e1} px="P₁" qx="Y₁" colour={CURVE} />
      <Eq at={e2} px="P₂" qx="Y₂" colour={SHIFT} />
    </Frame>
  );
}

/**
 * What a supply-side policy is for: long-run supply shifts right, so output rises and the price
 * level falls. Growth and inflation are dealt with at once, which is the evaluation point the
 * fifteen-mark question is set up to reward.
 */
function AdAsSupplySide({ caption }: { caption?: string }) {
  const YF = 150;
  const YF2 = 212;
  // Flat enough that the second equilibrium stays clear of the axis and the label clears the dot.
  const ad1 = thru({ x: YF, y: 104 }, { x: 1, y: 0.58 }, 96, 86);
  const e1 = atX(ad1, YF);
  const e2 = atX(ad1, YF2);
  return (
    <Frame x="Real output" y="Price level" caption={caption}>
      <line x1={YF} y1="200" x2={YF} y2="34" stroke={CURVE} strokeWidth="2" />
      <text x={YF} y="30" textAnchor="middle" className="dgmcur">LRAS₁</text>
      <line x1={YF2} y1="200" x2={YF2} y2="34" stroke={SHIFT} strokeWidth="2" strokeDasharray="5 4" />
      <text x={YF2} y="30" textAnchor="middle" className="dgmcur" fill={SHIFT}>LRAS₂</text>
      <Straight l={clip(ad1)} label="AD" colour={CURVE} />
      <Shift from={{ x: YF, y: 182 }} to={{ x: YF2, y: 182 }} />
      <Eq at={e1} px="P₁" qx="Y₁" colour={CURVE} />
      <Eq at={e2} px="P₂" qx="Y₂" colour={SHIFT} />
    </Frame>
  );
}

/**
 * The money market, which is how unit 13 asks a monetary policy question when it does not ask for
 * AD/AS: the supply of money is set by the central bank, so it is vertical, and increasing it moves
 * the interest rate down along a fixed demand for money.
 */
function MoneyMarket({ caption }: { caption?: string }) {
  const dm = line({ x: 60, y: 44 }, { x: 268, y: 188 });
  const sm1 = line({ x: 136, y: 196 }, { x: 136, y: 30 });
  const sm2 = line({ x: 196, y: 196 }, { x: 196, y: 30 });
  const e1 = cross(dm, sm1);
  const e2 = cross(dm, sm2);
  return (
    <Frame x="Quantity of money" y="Interest rate" caption={caption}>
      <Straight l={dm} label="Dm" colour={CURVE} />
      <Straight l={sm1} label="Sm₁" colour={CURVE} />
      <Straight l={sm2} label="Sm₂" colour={SHIFT} dashed />
      <Shift from={{ x: sm1.a.x, y: 150 }} to={{ x: sm2.a.x, y: 150 }} />
      <Eq at={e1} px="r₁" qx="M₁" colour={CURVE} />
      <Eq at={e2} px="r₂" qx="M₂" colour={SHIFT} />
    </Frame>
  );
}

/**
 * The Phillips curve. The short-run curve carries the trade-off the fifteen-mark question asks
 * about; the long-run curve is vertical at the natural rate, which is the answer to whether the
 * trade-off lasts. Expected inflation rising moves the short-run curve out, which is stagflation.
 */
function Phillips({ caption }: { caption?: string }) {
  const NAT = 130;
  const LOW = 90;
  // A rectangular hyperbola: inflation climbs steeply as unemployment is pushed below the natural rate.
  const at = (x: number) => ({ x, y: 196 - 4380 / (x - 40) });
  const src: Pt[] = [];
  for (let i = 0; i <= 48; i++) src.push(at(70 + (248 - 70) * (i / 48)));
  const a = at(NAT);
  const b = at(LOW);
  return (
    <Frame x="Unemployment rate" y="Inflation rate" caption={caption}>
      <line x1={NAT} y1="200" x2={NAT} y2="30" stroke={CURVE} strokeWidth="2" />
      <text x={NAT} y="26" textAnchor="middle" className="dgmcur">LRPC</text>
      <path d={`M${src.map((q) => `${d2(q.x)} ${d2(q.y)}`).join(" L")}`} fill="none" stroke={CURVE} strokeWidth="2" />
      <text x="252" y={d2(at(248).y) - 8} className="dgmcur">SRPC</text>
      <Eq at={a} px="π₁" qx="Un" colour={CURVE} />
      <Eq at={b} px="π₂" qx="U₂" colour={SHIFT} />
      <Shift from={{ x: a.x - 4, y: a.y - 6 }} to={{ x: b.x + 4, y: b.y + 6 }} />
    </Frame>
  );
}

const DIAGRAMS: Record<string, (p: { caption?: string }) => React.ReactElement> = {
  "exchange-rate": ExchangeRate,
  "ad-as": AdAs,
  "ad-as-cost-push": AdAsCostPush,
  "ad-as-supply-side": AdAsSupplySide,
  "money-market": MoneyMarket,
  "phillips": Phillips,
  "indirect-tax": IndirectTax,
  subsidy: Subsidy,
  "price-ceiling": PriceCeiling,
  "price-floor": PriceFloor,
  quota: Quota,
  "supply-elasticity": SupplyElasticity,
  "ad-as-monetarist": AdAsMonetarist,
  "business-cycle": BusinessCycle,
  "externality-production": ExternalityProduction,
  "externality-consumption": ExternalityConsumption,
  "demand-shift": DemandShift,
  "externality-positive": ExternalityPositive,
  monopoly: Monopoly,
  "poverty-cycle": PovertyCycle,
  tariff: Tariff,
  ppc: Ppc,
  lorenz: Lorenz,
  "fixed-rate": FixedRate,
  "exchange-rate-fall": ExchangeRateFall,
  "exchange-rate-supply": ExchangeRateSupply,
  "j-curve": JCurve,
};

export function Diagram({ name, caption }: { name: string; caption?: string }) {
  const D = DIAGRAMS[name];
  if (!D) return null;
  return <D caption={caption} />;
}

export const hasDiagram = (name: string) => name in DIAGRAMS;
