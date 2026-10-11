import { SnapEngine } from './snap-engine';

describe('SnapEngine', () => {
  it('snaps to the nearest 15 minutes', () => {
    expect(SnapEngine.snapMinutes(7)).toBe(0);
    expect(SnapEngine.snapMinutes(8)).toBe(15);
    expect(SnapEngine.snapMinutes(22)).toBe(15);
    expect(SnapEngine.snapMinutes(23)).toBe(30);
    expect(SnapEngine.snapMinutes(-8)).toBe(-15);
  });

  it('floors and ceils to the 15-minute grid', () => {
    expect(SnapEngine.floorMinutes(29)).toBe(15);
    expect(SnapEngine.ceilMinutes(16)).toBe(30);
    expect(SnapEngine.floorMinutes(30)).toBe(30);
    expect(SnapEngine.ceilMinutes(30)).toBe(30);
  });

  it('clamps to the day (0 to 1440 minutes)', () => {
    expect(SnapEngine.clampMinutes(-5)).toBe(0);
    expect(SnapEngine.clampMinutes(1500)).toBe(1440);
    expect(SnapEngine.clampMinutes(600)).toBe(600);
  });

  it('snaps before clamping', () => {
    expect(SnapEngine.snapAndClamp(1439)).toBe(1440);
    expect(SnapEngine.floorAndClamp(-1)).toBe(0);
    expect(SnapEngine.ceilAndClamp(1441)).toBe(1440);
  });
});
