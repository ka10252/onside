/**
 * The diagram a past-paper question wants, from the tag the paper itself carries.
 *
 * IB mark schemes describe the required figure in words and print no model drawing, so there is no
 * image to lift out of them (Jin, 2026-10-14). The question bank does carry a diagram_type, and
 * these notes already hold a drawn version of most of them, so the answer side shows ours.
 *
 * A tag with no confident match draws nothing. A wrong model diagram beside a mark scheme is worse
 * than none: the tutor would teach it.
 */
const BY_TAG: Record<string, string> = {
  "ad/as": "ad-as",
  "ad/as (keynesian)": "ad-as",
  "exchange rate": "exchange-rate",
  "exchange rate (fixed)": "fixed-rate",
  "j-curve": "j-curve",
  "demand and supply": "demand-shift",
  "demand and supply (subsidy)": "subsidy",
  "demand and supply (indirect tax)": "indirect-tax",
  "indirect tax": "indirect-tax",
  "demand and supply (price ceiling)": "price-ceiling",
  "price ceiling": "price-ceiling",
  "demand and supply (price floor)": "price-floor",
  "price floor": "price-floor",
  "international trade (tariff)": "tariff",
  "international trade (quota)": "quota",
  "externality (negative production)": "externality-production",
  "externality (negative consumption)": "externality-consumption",
  "externality (positive consumption)": "externality-positive",
  "monopoly": "monopoly",
  "poverty cycle": "poverty-cycle",
  "lorenz curve": "lorenz",
  "ppc": "ppc",
  "ppc (comparative advantage)": "ppc",
  "phillips curve": "phillips",
  "money market": "money-market",
  "business cycle": "business-cycle",
};

export function diagramForTag(tag: string | null | undefined): string | null {
  if (!tag) return null;
  return BY_TAG[tag.trim().toLowerCase()] ?? null;
}
