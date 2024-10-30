export function isAfListLengthIndicator(af: number): boolean {
  return af >= 224 && af <= 249;
}

/**
 * @brief Converts an RDS channel code to a frequency.
 * 
 * @param channel The RDS channel (an integer in the 0–205 range, 205 being the filler code)
 * @return The frequency in multiples of 100 kHz, or -1 for the filler code, or 0 if an invalid
 * code was supplied
 */
export function channelToFrequency(channel: number): number {
  if (channel >= 0 && channel <= 204) return 875 + channel;
  else if (channel == 205) return -1;     // -1 = filler code.
  else return 0;
}

export class AFList {
	public transmitterFrequency: number;
  public afs = new Set<number>();
	public method = '?';
	
	constructor(transmitterFrequency: number) {
		this.transmitterFrequency = channelToFrequency(transmitterFrequency);
	}
	
	public addPair(a: number, b: number): boolean {
		const fA = channelToFrequency(a);
		const fB = channelToFrequency(b);
		const typeIfB = fA < fB ? "same" : "variant"; 
		if (fA == this.transmitterFrequency && fA > 0) {  // method B.
			this.method = 'B';
			if (fB > 0) this.afs.add(fB);
			return true;
		} else if (fB == this.transmitterFrequency && fB > 0) {  // method B.
			this.method = 'B';
			if (fA > 0) this.afs.add(fA);
			return true;
		} else if (fA > 0 || fB > 0){  // method A.
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
			if (fA > 0) {
				this.afs.add(fA);
			}
			if (fB > 0) {
				this.afs.add(fB);
			}
			return true;
		} else return true;
	}
}
