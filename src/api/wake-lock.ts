export class WakeLockManager {
  private sentinel: WakeLockSentinel | null = null;

  async acquire(): Promise<void> {
    try {
      this.sentinel = await navigator.wakeLock.request('screen');
    } catch {
      // Wake Lock not supported or permission denied; non-fatal.
    }
  }

  async release(): Promise<void> {
    await this.sentinel?.release();
    this.sentinel = null;
  }
}
