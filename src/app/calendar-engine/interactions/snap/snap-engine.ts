export class SnapEngine {

  static readonly SNAP_MINUTES = 15;

  static snapMinutes(minutes: number): number {
    return Math.round(minutes / this.SNAP_MINUTES) * this.SNAP_MINUTES;
  }

  static clampMinutes(minutes: number): number {
    return Math.max(0, Math.min(24 * 60, minutes));
  }

  static snapAndClamp(minutes: number): number {
    return this.clampMinutes(
      this.snapMinutes(minutes)
    );
  }
}