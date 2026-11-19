export class ScreenSetup {
  private result: 'checking' | 'granted' | 'permission_required' | 'capture_failed' = 'checking';
  private pending: Promise<void> | null = null;

  constructor(
    private permission: () => string,
    private probe: () => Promise<void>,
    private report: (error: unknown) => void,
  ) {}

  status() {
    if (this.pending) return 'checking';
    const permission = this.permission();
    if (permission !== 'granted') {
      if (this.result === 'granted') this.result = 'permission_required';
      return permission;
    }
    return this.result === 'permission_required' ? 'checking' : this.result;
  }

  needsCheckAfterGrant() {
    return (
      !this.pending && this.result === 'permission_required' && this.permission() === 'granted'
    );
  }

  check() {
    if (this.pending) return this.pending;
    this.pending = Promise.resolve()
      .then(this.probe)
      .then(() => {
        this.result = this.permission() === 'granted' ? 'granted' : 'permission_required';
      })
      .catch((error) => {
        this.result = this.permission() === 'granted' ? 'capture_failed' : 'permission_required';
        this.report(error);
      })
      .finally(() => {
        this.pending = null;
      });
    return this.pending;
  }
}
