type AfListLength = {
	kind: "AfListLength"
	length: number
}

type AfFrequency = {
	kind: "AfFrequency"
	freq: number
}

type AfInvalid = {
	kind: "AfInvalid"
	code: number
}

type AfFiller = {
	kind: "AfFiller"
}

type AfAmIndicator = {
	kind: "AfAmIndicator"
}

type AfCode = AfFrequency | AfListLength | AfFiller | AfAmIndicator | AfInvalid;

/**
 * @brief Parse an RDS AF code.
 * 
 * @return The parsed AF code, as an object of type AfCode.
 */
export function parseAfCode(af: number): AfCode {
  if (af >= 1 && af <= 204) return { kind: "AfFrequency", freq: 875 + af};
  if (af == 205) return { kind: "AfFiller" };
	if (af >= 224 && af <= 249) return { kind: "AfListLength", length: af - 224};
	if (af == 250) return { kind: "AfAmIndicator" };
  return { kind: "AfInvalid", code: af }
}

export function formatAf(af: number): string {
	const afCode = parseAfCode(af);
	switch (afCode.kind) {
		case "AfAmIndicator": return "AM_Ind";
		case "AfFiller": return "Filler";
		case "AfFrequency": return (afCode.freq/10).toFixed(1);
		case "AfInvalid": return `Invalid(${afCode.code})`;
		case "AfListLength": return `ListLength(${afCode.length})`;
	}
}

export class AFList {
	public transmitterFrequency: number;
  public afs = new Set<number>();
	public method = '?';
	
	constructor(transmitterFrequency: number) {
		this.transmitterFrequency = transmitterFrequency;
	}
	
	public addPair(a: AfCode, b: AfCode): boolean {
		if (a.kind == "AfFrequency" && a.freq == this.transmitterFrequency) {  // method B.
			this.method = 'B';
			if (b.kind == "AfFrequency") this.afs.add(b.freq);
			return true;
		} else if (b.kind == "AfFrequency" && b.freq == this.transmitterFrequency) {  // method B.
			this.method = 'B';
			if (a.kind == "AfFrequency") this.afs.add(a.freq);
			return true;
		} else if (a.kind == "AfFrequency" || b.kind == "AfFrequency"){  // method A.
			if (this.transmitterFrequency != 0) {
				if (this.method == 'B') {
					// If the two frequencies are transmitted
					// if a transmitter frequency has previously been provided
					// if none of them corresponds to the transmitter frequency
					// and if method B had been identified...
					// then the only possible explanation is that a new B-list has
					// begun. So we return false, so that the caller creates a new AFList.
					return false;
				} // else
				this. method = 'A';
			}
			if (a.kind == "AfFrequency") {
				this.afs.add(a.freq);
			}
			if (b.kind == "AfFrequency") {
				this.afs.add(b.freq);
			}
			return true;
		} else return true;
	}
}
