export class Diagnostics {
  readonly findings = new Map<Finding, number>();

  public addFinding(message: string, group: number) {
    const f = new Finding(message, group);
    const numExisting = this.findings.get(f);
    if (numExisting) {
      this.findings.set(f, numExisting+1);
    } else {
      this.findings.set(f, 1);
    }
  }

  public reset() {
    this.findings.clear();
  }
}

class Finding {
  public constructor(public message: string, public group: number) {}

  public toString() {
    return this.message;
  }
}
