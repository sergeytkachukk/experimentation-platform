// Geometry helpers for the GrowthBook-style "violin" of the relative effect posterior.

export interface Range {
  lo: number
  hi: number
}

// Axis wide enough to show the whole posterior and always include 0 (the "no change" line).
export function axisRange(mean: number, sd: number): Range {
  const half = 3.5 * sd
  return { lo: Math.min(mean - half, -0.6 * sd), hi: Math.max(mean + half, 0.6 * sd) }
}

// Round tick values (1, 2, 5 x 10^k) covering the range, roughly `target` of them.
export function niceTicks({ lo, hi }: Range, target = 7): number[] {
  const raw = (hi - lo) / target
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag
  const ticks: number[] = []
  for (let t = Math.ceil(lo / step) * step; t <= hi + step * 1e-9; t += step) ticks.push(Number(t.toFixed(10)))
  return ticks
}

// Half-height of the violin at x, normalized so the peak (x = mean) is 1.
function halfHeight(x: number, mean: number, sd: number): number {
  return Math.exp(-0.5 * ((x - mean) / sd) ** 2)
}

// Closed polygon (data x, normalized y offset from the center line) for the part of the violin between a and b.
// Returns the upper edge left-to-right, then the lower edge right-to-left.
export function violinSlice(mean: number, sd: number, a: number, b: number, samples = 80): { x: number; h: number }[] {
  if (!(b > a)) return []
  const xs = Array.from({ length: samples + 1 }, (_, i) => a + ((b - a) * i) / samples)
  const upper = xs.map((x) => ({ x, h: halfHeight(x, mean, sd) }))
  const lower = [...upper].reverse().map((p) => ({ x: p.x, h: -p.h }))
  return [...upper, ...lower]
}
