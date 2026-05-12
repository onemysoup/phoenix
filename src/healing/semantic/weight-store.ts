/**
 * Weight Store — Self-Evolving Weights
 *
 * When Tier 3 (LLM) successfully repairs a selector, we analyze why
 * Tier 2 (semantic matching) failed and adjust weights to make Tier 2
 * succeed next time for similar patterns.
 *
 * Weights are stored per-domain because different sites have different
 * DOM patterns (e.g., e-commerce sites use data-testid heavily, while
 * news sites rely on text and headings).
 *
 * Learning rate is conservative (5-15% per adjustment) to avoid
 * overfitting to a single example.
 */

import fs from "fs";

export interface WeightAdjustment {
  signal: string;
  delta: number;       // Change amount (e.g., +0.3)
  reason: string;      // Why this adjustment was made
  timestamp: number;
}

export interface DomainWeights {
  domain: string;
  weights: Record<string, number>;
  adjustments: WeightAdjustment[];
  lastUpdated: number;
  successCount: number;  // Times Tier 2 succeeded after adjustment
  failCount: number;     // Times Tier 2 still failed after adjustment
}

const DEFAULT_WEIGHTS: Record<string, number> = {
  text: 3.0,
  tag: 1.5,
  id: 4.0,
  classes: 1.0,
  behavior: 2.0,
  editable: 2.0,
  submit: 2.5,
  attributes: 3.0,
  structure: 1.0,
  context: 1.5,
  href: 2.0,
  placeholder: 2.5,
};

const LEARNING_RATE = 0.1;    // 10% adjustment per learning event
const DISCRIMINATOR_BOOST = 1.5; // 50% extra boost for the discriminator signal
const MAX_ADJUSTMENT = 2.0;   // Max absolute adjustment per signal
const DECAY_RATE = 0.01;      // Slow decay toward defaults

export class WeightStore {
  private domains = new Map<string, DomainWeights>();
  private persistPath?: string;

  constructor(options?: { persistPath?: string }) {
    this.persistPath = options?.persistPath;
    if (this.persistPath) this.loadFromDisk();
  }

  /**
   * Get weights for a domain (with dynamic overrides applied).
   */
  getWeights(domain: string): Record<string, number> {
    const domainData = this.domains.get(domain);
    if (!domainData) return { ...DEFAULT_WEIGHTS };

    // Merge: default + domain adjustments
    const merged = { ...DEFAULT_WEIGHTS };
    for (const [signal, value] of Object.entries(domainData.weights)) {
      merged[signal] = value;
    }
    return merged;
  }

  /**
   * Learn from a successful LLM repair.
   * Analyzes why Tier 2 failed and adjusts weights.
   */
  learn(
    domain: string,
    correctSignalBreakdown: Record<string, number>,
    tier2TopScores: Array<{ index: number; combined: number; breakdown: Record<string, number> }>,
    correctElementIndex: number
  ): WeightAdjustment[] {
    // Find where the correct element ranked in Tier 2
    const correctRank = tier2TopScores.findIndex(s => s.index === correctElementIndex);
    if (correctRank <= 0) return []; // Tier 2 already found it or not in candidates

    const correctBreakdown = tier2TopScores[correctRank]?.breakdown ?? {};
    const topBreakdown = tier2TopScores[0]?.breakdown ?? {};

    const adjustments: WeightAdjustment[] = [];
    const domainData = this.getOrCreateDomain(domain);

    // First pass: identify the discriminator signal — the one with the largest gap
    let discriminatorSignal = "";
    let maxGap = 0;
    for (const signal of Object.keys(correctSignalBreakdown)) {
      const correctValue = correctSignalBreakdown[signal] ?? 0;
      const topValue = topBreakdown[signal] ?? 0;
      const gap = correctValue - topValue;
      if (gap > maxGap + 0.05) {
        maxGap = gap;
        discriminatorSignal = signal;
      }
    }

    // Second pass: adjust weights, with extra boost for the discriminator
    for (const signal of Object.keys(correctSignalBreakdown)) {
      const correctValue = correctSignalBreakdown[signal] ?? 0;
      const topValue = topBreakdown[signal] ?? 0;

      // If correct element had a much stronger signal but was ranked lower,
      // the weight for this signal is too low
      if (correctValue > topValue + 0.1 && correctValue > 0.3) {
        let rate = LEARNING_RATE;
        let reason = `correct element had ${signal}=${correctValue.toFixed(2)} vs top=${topValue.toFixed(2)}`;

        // Discriminator boost: the signal that most clearly separated correct from wrong
        if (signal === discriminatorSignal && maxGap > 0.2) {
          rate *= DISCRIMINATOR_BOOST;
          reason += ` [DISCRIMINATOR, gap=${maxGap.toFixed(2)}]`;
        }

        const delta = rate * (correctValue - topValue);
        const clampedDelta = Math.min(Math.max(delta, -MAX_ADJUSTMENT), MAX_ADJUSTMENT);

        domainData.weights[signal] = (domainData.weights[signal] ?? DEFAULT_WEIGHTS[signal] ?? 2.0) + clampedDelta;

        adjustments.push({
          signal,
          delta: clampedDelta,
          reason,
          timestamp: Date.now(),
        });
      }

      // If correct element had a weaker signal but was ranked higher,
      // the weight for this signal might be too high (decay toward default)
      if (topValue > correctValue + 0.2 && topValue > 0.5) {
        const defaultVal = DEFAULT_WEIGHTS[signal] ?? 2.0;
        const current = domainData.weights[signal] ?? defaultVal;
        const decay = (current - defaultVal) * DECAY_RATE;
        if (Math.abs(decay) > 0.01) {
          domainData.weights[signal] = current - decay;
        }
      }
    }

    domainData.adjustments.push(...adjustments);
    domainData.lastUpdated = Date.now();
    this.saveToDisk();

    return adjustments;
  }

  /**
   * Record a Tier 2 success (after learning) to track effectiveness.
   */
  recordSuccess(domain: string): void {
    const domainData = this.getOrCreateDomain(domain);
    domainData.successCount++;
    this.saveToDisk();
  }

  /**
   * Record a Tier 2 failure (after learning) to detect weight drift.
   */
  recordFailure(domain: string): void {
    const domainData = this.getOrCreateDomain(domain);
    domainData.failCount++;

    // If too many failures after adjustment, reset to defaults
    if (domainData.failCount > 10 && domainData.failCount > domainData.successCount * 2) {
      this.resetDomain(domain);
    }
    this.saveToDisk();
  }

  /**
   * Get stats for a domain.
   */
  stats(domain: string): { weights: Record<string, number>; adjustments: number; successRate: number } {
    const domainData = this.domains.get(domain);
    if (!domainData) {
      return { weights: { ...DEFAULT_WEIGHTS }, adjustments: 0, successRate: 0 };
    }
    const total = domainData.successCount + domainData.failCount;
    return {
      weights: domainData.weights,
      adjustments: domainData.adjustments.length,
      successRate: total > 0 ? domainData.successCount / total : 0,
    };
  }

  private getOrCreateDomain(domain: string): DomainWeights {
    let domainData = this.domains.get(domain);
    if (!domainData) {
      domainData = {
        domain,
        weights: { ...DEFAULT_WEIGHTS },
        adjustments: [],
        lastUpdated: Date.now(),
        successCount: 0,
        failCount: 0,
      };
      this.domains.set(domain, domainData);
    }
    return domainData;
  }

  private resetDomain(domain: string): void {
    const domainData = this.domains.get(domain);
    if (domainData) {
      domainData.weights = { ...DEFAULT_WEIGHTS };
      domainData.adjustments = [];
      domainData.failCount = 0;
      domainData.successCount = 0;
    }
  }

  private saveToDisk(): void {
    if (!this.persistPath) return;
    try {
      const data = JSON.stringify(Array.from(this.domains.entries()), null, 2);
      fs.writeFileSync(this.persistPath, data, "utf-8");
    } catch {}
  }

  private loadFromDisk(): void {
    if (!this.persistPath) return;
    try {
      if (fs.existsSync(this.persistPath)) {
        const data = JSON.parse(fs.readFileSync(this.persistPath, "utf-8"));
        for (const [key, value] of data) {
          this.domains.set(key, value);
        }
      }
    } catch {}
  }
}
