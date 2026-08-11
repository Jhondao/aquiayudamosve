import { describe, expect, it } from "vitest";
import { applyDecay, determineTrustLevel } from "../src/modules/trust/trustScore.service";

describe("TrustScoreService — decay", () => {
  it("does not decay before the stale threshold", () => {
    const lastConfirmedAt = new Date(Date.now() - 2 * 3_600_000); // 2h ago
    expect(applyDecay(80, lastConfirmedAt, 6)).toBe(80);
  });

  it("decays progressively past the stale threshold", () => {
    const lastConfirmedAt = new Date(Date.now() - 10 * 3_600_000); // 10h ago, threshold 6h => 4h overdue
    const score = applyDecay(80, lastConfirmedAt, 6);
    expect(score).toBeLessThan(80);
    expect(score).toBe(72); // 80 - 4h*2pts
  });

  it("never goes below zero", () => {
    const lastConfirmedAt = new Date(Date.now() - 200 * 3_600_000);
    expect(applyDecay(20, lastConfirmedAt, 6)).toBe(0);
  });

  it("never exceeds 100", () => {
    const lastConfirmedAt = new Date();
    expect(applyDecay(140, lastConfirmedAt, 6)).toBe(100);
  });
});

describe("TrustScoreService — level classification", () => {
  const now = new Date();

  it("classifies a fresh, low-score report as sin_verificar", () => {
    const level = determineTrustLevel({ score: 20, lastConfirmedAt: now, isOrgBacked: false, incorrectCount: 0 });
    expect(level).toBe("sin_verificar");
  });

  it("classifies a mid-score report as en_proceso", () => {
    const level = determineTrustLevel({ score: 50, lastConfirmedAt: now, isOrgBacked: false, incorrectCount: 0 });
    expect(level).toBe("en_proceso");
  });

  it("classifies a high-score report as confirmado", () => {
    const level = determineTrustLevel({ score: 85, lastConfirmedAt: now, isOrgBacked: false, incorrectCount: 0 });
    expect(level).toBe("confirmado");
  });

  it("org-backed reports are institucional even with a high score", () => {
    const level = determineTrustLevel({ score: 90, lastConfirmedAt: now, isOrgBacked: true, incorrectCount: 0 });
    expect(level).toBe("institucional");
  });

  it("three or more unresolved incorrect signals override everything else as cuestionada", () => {
    const level = determineTrustLevel({ score: 95, lastConfirmedAt: now, isOrgBacked: true, incorrectCount: 3 });
    expect(level).toBe("cuestionada");
  });

  it("a long-silent report is desactualizada regardless of its stored score", () => {
    const staleLastConfirmed = new Date(Date.now() - 25 * 3_600_000); // way past 3x a 6h threshold
    const level = determineTrustLevel({ score: 90, lastConfirmedAt: staleLastConfirmed, isOrgBacked: false, incorrectCount: 0 });
    expect(level).toBe("desactualizada");
  });
});
