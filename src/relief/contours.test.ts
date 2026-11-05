import { describe, expect, it } from "vitest";
import { contours } from "./contours";

describe("contours", () => {
  it("draws the same ground for the same seed", () => {
    expect(contours({ seed: 31, density: 2 })).toEqual(
      contours({ seed: 31, density: 2 }),
    );
  });

  it("draws another ground for another seed", () => {
    expect(contours({ seed: 31, density: 2 }).thin).not.toBe(
      contours({ seed: 7, density: 2 }).thin,
    );
  });

  it("gives thin lines and bold lines inside its view box", () => {
    const { viewBox, thin, bold } = contours({ seed: 31, density: 5 });
    expect(viewBox).toBe("0 0 1000 187");
    expect(thin.length).toBeGreaterThan(0);
    expect(bold.length).toBeGreaterThan(0);
    const numbers = `${thin}${bold}`.match(/-?\d+\.\d/g) ?? [];
    for (const value of numbers.slice(0, 2000).map(Number)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1000);
    }
  });

  it("raises more lines where a hill stands", () => {
    const flat = contours({ seed: 31, density: 3 });
    const hill = contours({ seed: 31, density: 3, hills: [[15, 3, 0.8]] });
    expect(hill.thin.length + hill.bold.length).toBeGreaterThan(
      flat.thin.length + flat.bold.length,
    );
  });
});
