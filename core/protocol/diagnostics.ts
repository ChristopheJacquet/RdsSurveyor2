export class Diagnostics {
  readonly findings = new Map<Finding, number>();

  public addFinding(message: string, group: number) {
    const f = new Finding(message, group);
    for (let [existingFinding, num] of this.findings) {
      if (existingFinding.sameAs(f)) {
        this.findings.set(existingFinding, num+1);
        return;
      }
    }

    this.findings.set(f, 1);
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

  public sameAs(f: Finding): boolean {
    return this.group == f.group && this.message == f.message;
  }
}
