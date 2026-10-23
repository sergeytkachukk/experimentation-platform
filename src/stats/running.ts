import type { MeanSample } from './tests.ts'

// Welford running mean/variance, so each checkpoint of a simulation is O(1).
export class RunningStats {
  n = 0
  mean = 0
  m2 = 0

  push(v: number) {
    this.n++
    const delta = v - this.mean
    this.mean += delta / this.n
    this.m2 += delta * (v - this.mean)
  }

  toSample(): MeanSample {
    return { n: this.n, mean: this.mean, variance: this.n > 1 ? this.m2 / (this.n - 1) : 0 }
  }
}
