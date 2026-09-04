import { describe, expect, it } from "vitest";
import {
  nextRowBoundary,
  normalizeWheelDelta,
  shouldUseNativeWheel,
} from "./useSmoothWheelScroll";

describe("normalizeWheelDelta", () => {
  it("maps any large mouse-wheel event to one row", () => {
    expect(normalizeWheelDelta(120, 0, 192)).toBe(32);
    expect(normalizeWheelDelta(240, 0, 192)).toBe(32);
  });

  it("maps line-mode wheels to one table row", () => {
    expect(normalizeWheelDelta(3, 1, 192)).toBe(32);
  });

  it("keeps small high-resolution deltas precise", () => {
    expect(normalizeWheelDelta(8, 0, 192)).toBe(8);
  });
});

describe("shouldUseNativeWheel", () => {
  it("leaves small pixel-mode deltas to native scrolling", () => {
    expect(shouldUseNativeWheel(0, 8, 0)).toBe(true);
    expect(shouldUseNativeWheel(-12.5, 0, 0)).toBe(true);
  });

  it("keeps discrete and large wheel events on the custom path", () => {
    expect(shouldUseNativeWheel(0, 50, 0)).toBe(false);
    expect(shouldUseNativeWheel(0, 120, 0)).toBe(false);
    expect(shouldUseNativeWheel(0, 8, 1)).toBe(false);
  });
});

describe("nextRowBoundary", () => {
  it("moves exactly one row from an aligned position", () => {
    expect(nextRowBoundary(0, 32, 32, 320)).toBe(32);
    expect(nextRowBoundary(32, 32, 32, 320)).toBe(64);
    expect(nextRowBoundary(64, -32, 32, 320)).toBe(32);
  });

  it("snaps a partially visible row to the adjacent whole-row boundary", () => {
    expect(nextRowBoundary(16, 32, 32, 320)).toBe(32);
    expect(nextRowBoundary(48, -32, 32, 320)).toBe(32);
  });

  it("advances past browser-quantized boundaries at 80 percent zoom", () => {
    expect(nextRowBoundary(32.5, 32, 32, 320)).toBe(64);
    expect(nextRowBoundary(63.75, 32, 32, 320)).toBe(96);
    expect(nextRowBoundary(63.75, -32, 32, 320)).toBe(32);
  });

  it("uses the native lower edge so the final row is fully visible", () => {
    expect(nextRowBoundary(288, 32, 32, 319)).toBe(319);
  });
});
