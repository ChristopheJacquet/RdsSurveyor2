// Generated file. DO NOT EDIT.

import { RDS_CHARMAP, LogMessage, RdsString, StationImpl, channelToFrequency } from "./rds_types";

export interface Station {
	pi?: number;
	pty?: number;
	ptyn: RdsString;
	tp?: boolean;
	ta?: boolean;
	ps: RdsString;
	lps: RdsString;
	rt: RdsString;
	rt_flag?: number;
	music?: boolean;
	di_dynamic_pty?: boolean;
	di_compressed?: boolean;
	di_artificial_head?: boolean;
	di_stereo?: boolean;
	odas: Map<number, string>;
	transmitted_odas: Map<number, number>;
	app_mapping: Map<number, string>;
	oda_3A_mapping: Map<number, string>;
	rt_plus_app: RtPlusApp;
	dab_cross_ref_app: DabCrossRefApp;
	linkage_actuator?: boolean;
	pin_day?: number;
	pin_hour?: number;
	pin_minute?: number;
	ecc?: number;
	language_code?: number;
	other_networks: Map<number, StationImpl>;
	addToGroupStats(type: number): void;
	setClockTime(mjd: number, hour: number, minute: number, tz_sign: boolean, tz_offset: number): void;
	addAfPair(af1: number, af2: number): void;
	addMappedAF(channel: number, mapped_channel: number): void;
	reportOtherNetworkSwitch(pi: number, ta: boolean): void;
}

export function parse_group(block: Uint16Array, ok: boolean[], log: LogMessage, station: Station) {
	// Field pi: uint<16> at +0, width 16.
	let pi = (ok[0]) ?
		((block[0]))
		: null;
	// Field type: uint<5> at +16, width 5.
	let type = (ok[1]) ?
		((block[1] & 0b1111100000000000) >> 11)
		: null;
	// Field tp: bool at +21, width 1.
	let tp = (ok[1]) ?
		((block[1] & 0b10000000000) >> 10) == 1
		: null;
	// Field pty: uint<5> at +22, width 5.
	let pty = (ok[1]) ?
		((block[1] & 0b1111100000) >> 5)
		: null;
	// Field payload: unparsed<37> at +27, width 37.

	// Actions.
	if ((pi != null)) {
		log.add(`PI=${pi.toString(16).toUpperCase().padStart(4, '0')}`);
	}
	if ((type != null)) {
		log.add(`Group ${(type>>1).toString() + ((type & 1) == 0 ? 'A' : 'B')}`);
	}
	if ((tp != null)) {
		log.add(`TP=${tp ? '1': '0'}`);
	}
	if ((pty != null)) {
		log.add(`PTY=${pty}`);
	}
	if ((pi != null)) {
		station.pi = pi;
	}
	if ((tp != null)) {
		station.tp = tp;
	}
	if ((pty != null)) {
		station.pty = pty;
	}
	if ((station != null) && (type != null)) {
		station.addToGroupStats(type);
	}
	if ((type != null)) {
		get_parse_function(station.app_mapping.get(type) ?? "group_unknown")(block, ok, log, station);
	}
}

export function parse_group_unknown(block: Uint16Array, ok: boolean[], log: LogMessage, station: Station) {
	// Field group_common: unparsed<27> at +0, width 27.
	// Field block_b_rest: uint<5> at +27, width 5.
	let block_b_rest = (ok[1]) ?
		((block[1] & 0b11111))
		: null;
	// Field block_c: uint<16> at +32, width 16.
	let block_c = (ok[2]) ?
		((block[2]))
		: null;
	// Field block_d: uint<16> at +48, width 16.
	let block_d = (ok[3]) ?
		((block[3]))
		: null;

	// Actions.
}

export function parse_group_0A(block: Uint16Array, ok: boolean[], log: LogMessage, station: Station) {
	// Field group_common: unparsed<27> at +0, width 27.
	// Field _: unparsed<5> at +27, width 5.
	// Field af1: uint<8> at +32, width 8.
	let af1 = (ok[2]) ?
		((block[2] & 0b1111111100000000) >> 8)
		: null;
	// Field af2: uint<8> at +40, width 8.
	let af2 = (ok[2]) ?
		((block[2] & 0b11111111))
		: null;
	// Field _: unparsed<16> at +48, width 16.

	// Actions.
	if ((af1 != null) && (af2 != null)) {
		log.add(`AFs ${formatAf(af1)}, ${formatAf(af2)}`);
	}
	if ((af1 != null) && (af2 != null) && (station != null)) {
		station.addAfPair(af1, af2);
	}
	get_parse_function("group_0B_0_common")(block, ok, log, station);
}

export function parse_group_0B_0_common(block: Uint16Array, ok: boolean[], log: LogMessage, station: Station) {
	// Field group_common: unparsed<27> at +0, width 27.
	// Field ta: bool at +27, width 1.
	let ta = (ok[1]) ?
		((block[1] & 0b10000) >> 4) == 1
		: null;
	// Field music: bool at +28, width 1.
	let music = (ok[1]) ?
		((block[1] & 0b1000) >> 3) == 1
		: null;
	// Field di: bool at +29, width 1.
	let di = (ok[1]) ?
		((block[1] & 0b100) >> 2) == 1
		: null;
	// Field addr: uint<2> at +30, width 2.
	let addr = (ok[1]) ?
		((block[1] & 0b11))
		: null;
	// Field _: uint<16> at +32, width 16.
	// Field ps_seg: byte<2> at +48, width 16.
	let ps_seg__0 = (ok[3]) ?
		((block[3] & 0b1111111100000000) >> 8)
		: null;
	let ps_seg__1 = (ok[3]) ?
		((block[3] & 0b11111111))
		: null;
	const ps_seg = [ps_seg__0, ps_seg__1];

	// Actions.
	if ((ta != null)) {
		log.add(`TA=${ta ? '1': '0'}`);
	}
	if ((addr != null) && (ps_seg != null)) {
		log.add(`PS seg @${addr} "${formatRdsText(ps_seg)}"`);
	}
	if ((ta != null)) {
		station.ta = ta;
	}
	if ((music != null)) {
		station.music = music;
	}
	if ((station != null)) {
		if ((addr != null) && (ps_seg__0 != null)) {
			station.ps.setByte(addr*2 + 0, ps_seg__0);
		}
		if ((addr != null) && (ps_seg__1 != null)) {
			station.ps.setByte(addr*2 + 1, ps_seg__1);
		}
	}
	if ((addr != null)) {
		switch (addr) {
			case 0:
				if ((di != null)) {
					station.di_dynamic_pty = di;
				}
				break;

			case 1:
				if ((di != null)) {
					station.di_compressed = di;
				}
				break;

			case 2:
				if ((di != null)) {
					station.di_artificial_head = di;
				}
				break;

			case 3:
				if ((di != null)) {
					station.di_stereo = di;
				}
				break;

		}
	}
}

export function parse_group_1A(block: Uint16Array, ok: boolean[], log: LogMessage, station: Station) {
	// Field group_common: unparsed<27> at +0, width 27.
	// Field _: unparsed<5> at +27, width 5.
	// Field linkage_actuator: bool at +32, width 1.
	let linkage_actuator = (ok[2]) ?
		((block[2] & 0b1000000000000000) >> 15) == 1
		: null;
	// Field variant: uint<3> at +33, width 3.
	let variant = (ok[2]) ?
		((block[2] & 0b111000000000000) >> 12)
		: null;
	// Field payload: uint<12> at +36, width 12.
	let payload = (ok[2]) ?
		((block[2] & 0b111111111111))
		: null;
	// Field pin: unparsed<16> at +48, width 16.

	// Actions.
	if ((linkage_actuator != null)) {
		log.add(`LA=${linkage_actuator ? '1': '0'}`);
	}
	if ((variant != null)) {
		log.add(`v=${variant}`);
	}
	if ((linkage_actuator != null)) {
		station.linkage_actuator = linkage_actuator;
	}
	get_parse_function("group_1B_1_common")(block, ok, log, station);
	if ((variant != null)) {
		switch (variant) {
			case 0:
				get_parse_function("group_1A_ecc")(block, ok, log, station);
				break;

			case 3:
				if ((payload != null)) {
					station.language_code = payload;
				}
				break;

		}
	}
}

export function parse_group_1A_ecc(block: Uint16Array, ok: boolean[], log: LogMessage, station: Station) {
	// Field _: unparsed<32> at +0, width 32.
	// Field linkage_actuator: unparsed<1> at +32, width 1.
	// Field variant: unparsed<3> at +33, width 3.
	// Field paging: unparsed<4> at +36, width 4.
	// Field ecc: uint<8> at +40, width 8.
	let ecc = (ok[2]) ?
		((block[2] & 0b11111111))
		: null;
	// Field pin: unparsed<16> at +48, width 16.

	// Actions.
	if ((ecc != null)) {
		log.add(`ECC=${ecc.toString(16).toUpperCase().padStart(2, '0')}`);
	}
	if ((ecc != null)) {
		station.ecc = ecc;
	}
}

export function parse_group_1B_1_common(block: Uint16Array, ok: boolean[], log: LogMessage, station: Station) {
	// Field group_common: unparsed<27> at +0, width 27.
	// Field _: unparsed<5> at +27, width 5.
	// Field _: unparsed<16> at +32, width 16.
	// Field pin_day: uint<5> at +48, width 5.
	let pin_day = (ok[3]) ?
		((block[3] & 0b1111100000000000) >> 11)
		: null;
	// Field pin_hour: uint<5> at +53, width 5.
	let pin_hour = (ok[3]) ?
		((block[3] & 0b11111000000) >> 6)
		: null;
	// Field pin_minute: uint<6> at +58, width 6.
	let pin_minute = (ok[3]) ?
		((block[3] & 0b111111))
		: null;

	// Actions.
	if ((pin_day != null) && (pin_hour != null) && (pin_minute != null)) {
		log.add(`PIN=(D=${pin_day}, ${pin_hour.toString().padStart(2, '0')}:${pin_minute.toString().padStart(2, '0')})`);
	}
	if ((pin_day != null)) {
		station.pin_day = pin_day;
	}
	if ((pin_hour != null)) {
		station.pin_hour = pin_hour;
	}
	if ((pin_minute != null)) {
		station.pin_minute = pin_minute;
	}
}

export function parse_group_2A(block: Uint16Array, ok: boolean[], log: LogMessage, station: Station) {
	// Field group_common: unparsed<27> at +0, width 27.
	// Field flag: uint<1> at +27, width 1.
	let flag = (ok[1]) ?
		((block[1] & 0b10000) >> 4)
		: null;
	// Field addr: uint<4> at +28, width 4.
	let addr = (ok[1]) ?
		((block[1] & 0b1111))
		: null;
	// Field rt_seg: byte<4> at +32, width 32.
	let rt_seg__0 = (ok[2]) ?
		((block[2] & 0b1111111100000000) >> 8)
		: null;
	let rt_seg__1 = (ok[2]) ?
		((block[2] & 0b11111111))
		: null;
	let rt_seg__2 = (ok[3]) ?
		((block[3] & 0b1111111100000000) >> 8)
		: null;
	let rt_seg__3 = (ok[3]) ?
		((block[3] & 0b11111111))
		: null;
	const rt_seg = [rt_seg__0, rt_seg__1, rt_seg__2, rt_seg__3];

	// Actions.
	if ((flag != null)) {
		log.add(`RT flag=${flag ? 'A' : 'B'}`);
	}
	if ((addr != null) && (rt_seg != null)) {
		log.add(`RT seg @${addr} "${formatRdsText(rt_seg)}"`);
	}
	if ((station != null)) {
		if ((addr != null) && (rt_seg__0 != null)) {
			station.rt.setByte(addr*4 + 0, rt_seg__0);
		}
		if ((addr != null) && (rt_seg__1 != null)) {
			station.rt.setByte(addr*4 + 1, rt_seg__1);
		}
		if ((addr != null) && (rt_seg__2 != null)) {
			station.rt.setByte(addr*4 + 2, rt_seg__2);
		}
		if ((addr != null) && (rt_seg__3 != null)) {
			station.rt.setByte(addr*4 + 3, rt_seg__3);
		}
	}
	if ((flag != null)) {
		station.rt_flag = flag;
	}
}

export function parse_group_2B(block: Uint16Array, ok: boolean[], log: LogMessage, station: Station) {
	// Field group_common: unparsed<27> at +0, width 27.
	// Field flag: uint<1> at +27, width 1.
	let flag = (ok[1]) ?
		((block[1] & 0b10000) >> 4)
		: null;
	// Field addr: uint<4> at +28, width 4.
	let addr = (ok[1]) ?
		((block[1] & 0b1111))
		: null;
	// Field pi: uint<16> at +32, width 16.
	let pi = (ok[2]) ?
		((block[2]))
		: null;
	// Field rt_seg: byte<2> at +48, width 16.
	let rt_seg__0 = (ok[3]) ?
		((block[3] & 0b1111111100000000) >> 8)
		: null;
	let rt_seg__1 = (ok[3]) ?
		((block[3] & 0b11111111))
		: null;
	const rt_seg = [rt_seg__0, rt_seg__1];

	// Actions.
	if ((flag != null)) {
		log.add(`RT flag=${flag ? 'A' : 'B'}`);
	}
	if ((addr != null) && (rt_seg != null)) {
		log.add(`RT seg @${addr} "${formatRdsText(rt_seg)}"`);
	}
	if ((station != null)) {
		if ((addr != null) && (rt_seg__0 != null)) {
			station.rt.setByte(addr*2 + 0, rt_seg__0);
		}
		if ((addr != null) && (rt_seg__1 != null)) {
			station.rt.setByte(addr*2 + 1, rt_seg__1);
		}
	}
	if ((flag != null)) {
		station.rt_flag = flag;
	}
}

export function parse_group_3A(block: Uint16Array, ok: boolean[], log: LogMessage, station: Station) {
	// Field group_common: unparsed<27> at +0, width 27.
	// Field app_group_type: uint<5> at +27, width 5.
	let app_group_type = (ok[1]) ?
		((block[1] & 0b11111))
		: null;
	// Field app_data: unparsed<16> at +32, width 16.
	// Field aid: uint<16> at +48, width 16.
	let aid = (ok[3]) ?
		((block[3]))
		: null;

	// Actions.
	if ((aid != null) && (app_group_type != null)) {
		log.add(`ODA AID=${aid.toString(16).toUpperCase().padStart(4, '0')} in group ${(app_group_type>>1).toString() + ((app_group_type & 1) == 0 ? 'A' : 'B')}`);
	}
	if ((aid != null) && (app_group_type != null)) {
		station.transmitted_odas.set(app_group_type, aid);
	}
	if ((aid != null) && (app_group_type != null)) {
		station.app_mapping.set(app_group_type, station.odas.get(aid) ?? "group_unknown");
	}
	if ((aid != null)) {
		get_parse_function(station.oda_3A_mapping.get(aid) ?? "group_unknown")(block, ok, log, station);
	}
}

export function parse_group_4A(block: Uint16Array, ok: boolean[], log: LogMessage, station: Station) {
	// Field group_common: unparsed<27> at +0, width 27.
	// Field _: uint<3> at +27, width 3.
	// Field mjd: uint<17> at +30, width 17.
	let mjd = (ok[1] && ok[2]) ?
		((block[1] & 0b11) << 15) | ((block[2] & 0b1111111111111110) >> 1)
		: null;
	// Field hour: uint<5> at +47, width 5.
	let hour = (ok[2] && ok[3]) ?
		((block[2] & 0b1) << 4) | ((block[3] & 0b1111000000000000) >> 12)
		: null;
	// Field minute: uint<6> at +52, width 6.
	let minute = (ok[3]) ?
		((block[3] & 0b111111000000) >> 6)
		: null;
	// Field tz_sign: bool at +58, width 1.
	let tz_sign = (ok[3]) ?
		((block[3] & 0b100000) >> 5) == 1
		: null;
	// Field tz_offset: uint<5> at +59, width 5.
	let tz_offset = (ok[3]) ?
		((block[3] & 0b11111))
		: null;

	// Actions.
	if ((mjd != null)) {
		log.add(`MJD=${mjd}`);
	}
	if ((hour != null)) {
		log.add(`Hour=${hour.toString().padStart(2, '0')}`);
	}
	if ((minute != null)) {
		log.add(`Minute=${minute.toString().padStart(2, '0')}`);
	}
	if ((tz_offset != null) && (tz_sign != null)) {
		log.add(`TZ=${tz_sign ? '+' : '-'}${tz_offset}`);
	}
	if ((hour != null) && (minute != null) && (mjd != null) && (station != null) && (tz_offset != null) && (tz_sign != null)) {
		station.setClockTime(mjd, hour, minute, tz_sign, tz_offset);
	}
}

export function parse_group_10A(block: Uint16Array, ok: boolean[], log: LogMessage, station: Station) {
	// Field group_common: unparsed<27> at +0, width 27.
	// Field flag_ab: bool at +27, width 1.
	let flag_ab = (ok[1]) ?
		((block[1] & 0b10000) >> 4) == 1
		: null;
	// Field _: uint<3> at +28, width 3.
	// Field addr: uint<1> at +31, width 1.
	let addr = (ok[1]) ?
		((block[1] & 0b1))
		: null;
	// Field ptyn_seg: byte<4> at +32, width 32.
	let ptyn_seg__0 = (ok[2]) ?
		((block[2] & 0b1111111100000000) >> 8)
		: null;
	let ptyn_seg__1 = (ok[2]) ?
		((block[2] & 0b11111111))
		: null;
	let ptyn_seg__2 = (ok[3]) ?
		((block[3] & 0b1111111100000000) >> 8)
		: null;
	let ptyn_seg__3 = (ok[3]) ?
		((block[3] & 0b11111111))
		: null;
	const ptyn_seg = [ptyn_seg__0, ptyn_seg__1, ptyn_seg__2, ptyn_seg__3];

	// Actions.
	if ((flag_ab != null)) {
		log.add(`PTYN flag=${flag_ab ? 'A' : 'B'}`);
	}
	if ((addr != null) && (ptyn_seg != null)) {
		log.add(`PTYN seg @${addr} "${formatRdsText(ptyn_seg)}"`);
	}
	if ((station != null)) {
		if ((addr != null) && (ptyn_seg__0 != null)) {
			station.ptyn.setByte(addr*4 + 0, ptyn_seg__0);
		}
		if ((addr != null) && (ptyn_seg__1 != null)) {
			station.ptyn.setByte(addr*4 + 1, ptyn_seg__1);
		}
		if ((addr != null) && (ptyn_seg__2 != null)) {
			station.ptyn.setByte(addr*4 + 2, ptyn_seg__2);
		}
		if ((addr != null) && (ptyn_seg__3 != null)) {
			station.ptyn.setByte(addr*4 + 3, ptyn_seg__3);
		}
	}
}

export function parse_group_15A(block: Uint16Array, ok: boolean[], log: LogMessage, station: Station) {
	// Field group_common: unparsed<27> at +0, width 27.
	// Field ta: bool at +27, width 1.
	let ta = (ok[1]) ?
		((block[1] & 0b10000) >> 4) == 1
		: null;
	// Field _: bool at +28, width 1.
	// Field addr: uint<3> at +29, width 3.
	let addr = (ok[1]) ?
		((block[1] & 0b111))
		: null;
	// Field lps_seg: byte<4> at +32, width 32.
	let lps_seg__0 = (ok[2]) ?
		((block[2] & 0b1111111100000000) >> 8)
		: null;
	let lps_seg__1 = (ok[2]) ?
		((block[2] & 0b11111111))
		: null;
	let lps_seg__2 = (ok[3]) ?
		((block[3] & 0b1111111100000000) >> 8)
		: null;
	let lps_seg__3 = (ok[3]) ?
		((block[3] & 0b11111111))
		: null;
	const lps_seg = [lps_seg__0, lps_seg__1, lps_seg__2, lps_seg__3];

	// Actions.
	if ((ta != null)) {
		log.add(`TA=${ta ? '1': '0'}`);
	}
	if ((addr != null) && (lps_seg != null)) {
		log.add(`Long PS seg @${addr} ${formatBytes(lps_seg)}`);
	}
	if ((station != null)) {
		if ((addr != null) && (lps_seg__0 != null)) {
			station.lps.setByte(addr*4 + 0, lps_seg__0);
		}
		if ((addr != null) && (lps_seg__1 != null)) {
			station.lps.setByte(addr*4 + 1, lps_seg__1);
		}
		if ((addr != null) && (lps_seg__2 != null)) {
			station.lps.setByte(addr*4 + 2, lps_seg__2);
		}
		if ((addr != null) && (lps_seg__3 != null)) {
			station.lps.setByte(addr*4 + 3, lps_seg__3);
		}
	}
}

export function parse_group_15B(block: Uint16Array, ok: boolean[], log: LogMessage, station: Station) {
	// Field group_common: unparsed<27> at +0, width 27.
	// Field ta: bool at +27, width 1.
	let ta = (ok[1]) ?
		((block[1] & 0b10000) >> 4) == 1
		: null;
	// Field music: bool at +28, width 1.
	let music = (ok[1]) ?
		((block[1] & 0b1000) >> 3) == 1
		: null;
	// Field di: bool at +29, width 1.
	let di = (ok[1]) ?
		((block[1] & 0b100) >> 2) == 1
		: null;
	// Field addr: uint<2> at +30, width 2.
	let addr = (ok[1]) ?
		((block[1] & 0b11))
		: null;
	// Field pi: uint<16> at +32, width 16.
	let pi = (ok[2]) ?
		((block[2]))
		: null;
	// Field repeat: unparsed<16> at +48, width 16.

	// Actions.
	if ((ta != null)) {
		log.add(`TA=${ta ? '1': '0'}`);
	}
	if ((pi != null)) {
		log.add(`PI=${pi}`);
	}
	if ((ta != null)) {
		station.ta = ta;
	}
	if ((music != null)) {
		station.music = music;
	}
	if ((addr != null)) {
		switch (addr) {
			case 0:
				if ((di != null)) {
					station.di_dynamic_pty = di;
				}
				break;

			case 1:
				if ((di != null)) {
					station.di_compressed = di;
				}
				break;

			case 2:
				if ((di != null)) {
					station.di_artificial_head = di;
				}
				break;

			case 3:
				if ((di != null)) {
					station.di_stereo = di;
				}
				break;

		}
	}
}

export function parse_group_14A(block: Uint16Array, ok: boolean[], log: LogMessage, station: Station) {
	// Field group_common: unparsed<27> at +0, width 27.
	// Field tp_on: bool at +27, width 1.
	let tp_on = (ok[1]) ?
		((block[1] & 0b10000) >> 4) == 1
		: null;
	// Field variant: uint<4> at +28, width 4.
	let variant = (ok[1]) ?
		((block[1] & 0b1111))
		: null;
	// Field _: uint<16> at +32, width 16.
	// Field pi_on: uint<16> at +48, width 16.
	let pi_on = (ok[3]) ?
		((block[3]))
		: null;

	// Actions.
	if ((variant != null)) {
		log.add(`EON v=${variant}`);
	}
	if ((pi_on != null)) {
		log.add(`ON.PI=${pi_on.toString(16).toUpperCase().padStart(4, '0')}`);
	}
	if ((tp_on != null)) {
		log.add(`ON.TP=${tp_on ? '1': '0'}`);
	}
	let elt0: StationImpl | undefined;
	if ((pi_on != null)) {
		elt0 = station.other_networks.get(pi_on);
		if (elt0 == undefined) {
			elt0 = new StationImpl();
			station.other_networks.set(pi_on, elt0);
		}
	}
	if ((elt0 != undefined) && (tp_on != null)) {
		elt0.tp = tp_on;
	}
	let elt1: StationImpl | undefined;
	if ((pi_on != null)) {
		elt1 = station.other_networks.get(pi_on);
		if (elt1 == undefined) {
			elt1 = new StationImpl();
			station.other_networks.set(pi_on, elt1);
		}
	}
	if ((elt1 != undefined) && (pi_on != null)) {
		elt1.pi = pi_on;
	}
	if ((variant != null)) {
		switch (variant) {
			case 0:
			case 1:
			case 2:
			case 3:
				get_parse_function("group_14A_ps")(block, ok, log, station);
				break;

			case 4:
				get_parse_function("group_14A_af_a")(block, ok, log, station);
				break;

			case 5:
			case 6:
			case 7:
			case 8:
				get_parse_function("group_14A_mapped_af")(block, ok, log, station);
				break;

			case 9:
				break;

			case 12:
				break;

			case 13:
				get_parse_function("group_14A_pty_ta")(block, ok, log, station);
				break;

			case 14:
				get_parse_function("group_14A_pin")(block, ok, log, station);
				break;

		}
	}
}

export function parse_group_14A_ps(block: Uint16Array, ok: boolean[], log: LogMessage, station: Station) {
	// Field common: unparsed<30> at +0, width 30.
	// Field addr: uint<2> at +30, width 2.
	let addr = (ok[1]) ?
		((block[1] & 0b11))
		: null;
	// Field ps_seg: byte<2> at +32, width 16.
	let ps_seg__0 = (ok[2]) ?
		((block[2] & 0b1111111100000000) >> 8)
		: null;
	let ps_seg__1 = (ok[2]) ?
		((block[2] & 0b11111111))
		: null;
	const ps_seg = [ps_seg__0, ps_seg__1];
	// Field pi_on: uint<16> at +48, width 16.
	let pi_on = (ok[3]) ?
		((block[3]))
		: null;

	// Actions.
	if ((addr != null) && (ps_seg != null)) {
		log.add(`ON.PS seg @${addr}: "${formatRdsText(ps_seg)}"`);
	}
	let elt2: StationImpl | undefined;
	if ((pi_on != null)) {
		elt2 = station.other_networks.get(pi_on);
		if (elt2 == undefined) {
			elt2 = new StationImpl();
			station.other_networks.set(pi_on, elt2);
		}
	}
	if ((elt2 != undefined) && (station != null)) {
		if ((addr != null) && (ps_seg__0 != null)) {
			elt2.ps.setByte(addr*2 + 0, ps_seg__0);
		}
		if ((addr != null) && (ps_seg__1 != null)) {
			elt2.ps.setByte(addr*2 + 1, ps_seg__1);
		}
	}
}

export function parse_group_14A_af_a(block: Uint16Array, ok: boolean[], log: LogMessage, station: Station) {
	// Field common: unparsed<32> at +0, width 32.
	// Field af1: uint<8> at +32, width 8.
	let af1 = (ok[2]) ?
		((block[2] & 0b1111111100000000) >> 8)
		: null;
	// Field af2: uint<8> at +40, width 8.
	let af2 = (ok[2]) ?
		((block[2] & 0b11111111))
		: null;
	// Field pi_on: uint<16> at +48, width 16.
	let pi_on = (ok[3]) ?
		((block[3]))
		: null;

	// Actions.
	if ((af1 != null) && (af2 != null)) {
		log.add(`ON.AFs ${formatAf(af1)} ${formatAf(af2)}`);
	}
	let elt3: StationImpl | undefined;
	if ((pi_on != null)) {
		elt3 = station.other_networks.get(pi_on);
		if (elt3 == undefined) {
			elt3 = new StationImpl();
			station.other_networks.set(pi_on, elt3);
		}
	}
	if ((af1 != null) && (af2 != null) && (elt3 != undefined) && (station != null)) {
		elt3.addAfPair(af1, af2);
	}
}

export function parse_group_14A_mapped_af(block: Uint16Array, ok: boolean[], log: LogMessage, station: Station) {
	// Field common: unparsed<32> at +0, width 32.
	// Field channel: uint<8> at +32, width 8.
	let channel = (ok[2]) ?
		((block[2] & 0b1111111100000000) >> 8)
		: null;
	// Field mapped_channel: uint<8> at +40, width 8.
	let mapped_channel = (ok[2]) ?
		((block[2] & 0b11111111))
		: null;
	// Field pi_on: uint<16> at +48, width 16.
	let pi_on = (ok[3]) ?
		((block[3]))
		: null;

	// Actions.
	if ((channel != null) && (mapped_channel != null)) {
		log.add(`ON.AF mapped ${formatAf(channel)} → ${formatAf(mapped_channel)}`);
	}
	let elt4: StationImpl | undefined;
	if ((pi_on != null)) {
		elt4 = station.other_networks.get(pi_on);
		if (elt4 == undefined) {
			elt4 = new StationImpl();
			station.other_networks.set(pi_on, elt4);
		}
	}
	if ((channel != null) && (elt4 != undefined) && (mapped_channel != null) && (station != null)) {
		elt4.addMappedAF(channel, mapped_channel);
	}
}

export function parse_group_14A_pty_ta(block: Uint16Array, ok: boolean[], log: LogMessage, station: Station) {
	// Field common: unparsed<32> at +0, width 32.
	// Field pty_on: uint<5> at +32, width 5.
	let pty_on = (ok[2]) ?
		((block[2] & 0b1111100000000000) >> 11)
		: null;
	// Field _: unparsed<10> at +37, width 10.
	// Field ta_on: bool at +47, width 1.
	let ta_on = (ok[2]) ?
		((block[2] & 0b1)) == 1
		: null;
	// Field pi_on: uint<16> at +48, width 16.
	let pi_on = (ok[3]) ?
		((block[3]))
		: null;

	// Actions.
	if ((pty_on != null)) {
		log.add(`ON.PTY = ${pty_on}`);
	}
	if ((ta_on != null)) {
		log.add(`ON.TA = ${ta_on ? '1': '0'}`);
	}
	let elt5: StationImpl | undefined;
	if ((pi_on != null)) {
		elt5 = station.other_networks.get(pi_on);
		if (elt5 == undefined) {
			elt5 = new StationImpl();
			station.other_networks.set(pi_on, elt5);
		}
	}
	if ((elt5 != undefined) && (pty_on != null)) {
		elt5.pty = pty_on;
	}
	let elt6: StationImpl | undefined;
	if ((pi_on != null)) {
		elt6 = station.other_networks.get(pi_on);
		if (elt6 == undefined) {
			elt6 = new StationImpl();
			station.other_networks.set(pi_on, elt6);
		}
	}
	if ((elt6 != undefined) && (ta_on != null)) {
		elt6.ta = ta_on;
	}
}

export function parse_group_14A_pin(block: Uint16Array, ok: boolean[], log: LogMessage, station: Station) {
	// Field common: unparsed<32> at +0, width 32.
	// Field pin_day_on: uint<5> at +32, width 5.
	let pin_day_on = (ok[2]) ?
		((block[2] & 0b1111100000000000) >> 11)
		: null;
	// Field pin_hour_on: uint<5> at +37, width 5.
	let pin_hour_on = (ok[2]) ?
		((block[2] & 0b11111000000) >> 6)
		: null;
	// Field pin_minute_on: uint<6> at +42, width 6.
	let pin_minute_on = (ok[2]) ?
		((block[2] & 0b111111))
		: null;
	// Field pi_on: uint<16> at +48, width 16.
	let pi_on = (ok[3]) ?
		((block[3]))
		: null;

	// Actions.
	if ((pin_day_on != null) && (pin_hour_on != null) && (pin_minute_on != null)) {
		log.add(`ON.PIN=(D=${pin_day_on}, ${pin_hour_on.toString().padStart(2, '0')}:${pin_minute_on.toString().padStart(2, '0')})`);
	}
	let elt7: StationImpl | undefined;
	if ((pi_on != null)) {
		elt7 = station.other_networks.get(pi_on);
		if (elt7 == undefined) {
			elt7 = new StationImpl();
			station.other_networks.set(pi_on, elt7);
		}
	}
	if ((elt7 != undefined) && (pin_day_on != null)) {
		elt7.pin_day = pin_day_on;
	}
	let elt8: StationImpl | undefined;
	if ((pi_on != null)) {
		elt8 = station.other_networks.get(pi_on);
		if (elt8 == undefined) {
			elt8 = new StationImpl();
			station.other_networks.set(pi_on, elt8);
		}
	}
	if ((elt8 != undefined) && (pin_hour_on != null)) {
		elt8.pin_hour = pin_hour_on;
	}
	let elt9: StationImpl | undefined;
	if ((pi_on != null)) {
		elt9 = station.other_networks.get(pi_on);
		if (elt9 == undefined) {
			elt9 = new StationImpl();
			station.other_networks.set(pi_on, elt9);
		}
	}
	if ((elt9 != undefined) && (pin_minute_on != null)) {
		elt9.pin_minute = pin_minute_on;
	}
}

export function parse_group_14B(block: Uint16Array, ok: boolean[], log: LogMessage, station: Station) {
	// Field group_common: unparsed<27> at +0, width 27.
	// Field tp_on: bool at +27, width 1.
	let tp_on = (ok[1]) ?
		((block[1] & 0b10000) >> 4) == 1
		: null;
	// Field ta_on: bool at +28, width 1.
	let ta_on = (ok[1]) ?
		((block[1] & 0b1000) >> 3) == 1
		: null;
	// Field _: unparsed<3> at +29, width 3.
	// Field pi: unparsed<16> at +32, width 16.
	// Field pi_on: uint<16> at +48, width 16.
	let pi_on = (ok[3]) ?
		((block[3]))
		: null;

	// Actions.
	if ((ta_on != null)) {
		log.add(`Other network switch ON.TA=${ta_on ? '1': '0'}`);
	}
	let elt10: StationImpl | undefined;
	if ((pi_on != null)) {
		elt10 = station.other_networks.get(pi_on);
		if (elt10 == undefined) {
			elt10 = new StationImpl();
			station.other_networks.set(pi_on, elt10);
		}
	}
	if ((elt10 != undefined) && (ta_on != null)) {
		elt10.ta = ta_on;
	}
	if ((pi_on != null) && (station != null) && (ta_on != null)) {
		station.reportOtherNetworkSwitch(pi_on, ta_on);
	}
}

export interface RtPlusApp {
	setTag(content_type: number, start: number, length: number): void;
}

export function parse_group_rtplus(block: Uint16Array, ok: boolean[], log: LogMessage, station: Station) {
	// Field group_common: unparsed<27> at +0, width 27.
	// Field item_toggle: bool at +27, width 1.
	let item_toggle = (ok[1]) ?
		((block[1] & 0b10000) >> 4) == 1
		: null;
	// Field item_running: bool at +28, width 1.
	let item_running = (ok[1]) ?
		((block[1] & 0b1000) >> 3) == 1
		: null;
	// Field content_type_1: uint<6> at +29, width 6.
	let content_type_1 = (ok[1] && ok[2]) ?
		((block[1] & 0b111) << 3) | ((block[2] & 0b1110000000000000) >> 13)
		: null;
	// Field start_1: uint<6> at +35, width 6.
	let start_1 = (ok[2]) ?
		((block[2] & 0b1111110000000) >> 7)
		: null;
	// Field length_1: uint<6> at +41, width 6.
	let length_1 = (ok[2]) ?
		((block[2] & 0b1111110) >> 1)
		: null;
	// Field content_type_2: uint<6> at +47, width 6.
	let content_type_2 = (ok[2] && ok[3]) ?
		((block[2] & 0b1) << 5) | ((block[3] & 0b1111100000000000) >> 11)
		: null;
	// Field start_2: uint<6> at +53, width 6.
	let start_2 = (ok[3]) ?
		((block[3] & 0b11111100000) >> 5)
		: null;
	// Field length_2: uint<5> at +59, width 5.
	let length_2 = (ok[3]) ?
		((block[3] & 0b11111))
		: null;

	// Actions.
	if ((content_type_1 != null) && (length_1 != null) && (start_1 != null) && (station != null)) {
		station.rt_plus_app.setTag(content_type_1, start_1, length_1);
	}
	if ((content_type_2 != null) && (length_2 != null) && (start_2 != null) && (station != null)) {
		station.rt_plus_app.setTag(content_type_2, start_2, length_2);
	}
}

export interface DabCrossRefApp {
	addEnsemble(mode: number, frequency: number, eid: number): void;
	addServiceEnsembleInfo(eid: number, sid: number): void;
	addServiceLinkageInfo(linkageInfo: number, sid: number): void;
}

export function parse_group_dabxref(block: Uint16Array, ok: boolean[], log: LogMessage, station: Station) {
	// Field group_common: unparsed<27> at +0, width 27.
	// Field es: uint<1> at +27, width 1.
	let es = (ok[1]) ?
		((block[1] & 0b10000) >> 4)
		: null;
	// Field _: unparsed<36> at +28, width 36.

	// Actions.
	if ((es != null)) {
		switch (es) {
			case 0:
				get_parse_function("group_dabxref_ensemble")(block, ok, log, station);
				break;

			case 1:
				get_parse_function("group_dabxref_service")(block, ok, log, station);
				break;

		}
	}
}

export function parse_group_dabxref_ensemble(block: Uint16Array, ok: boolean[], log: LogMessage, station: Station) {
	// Field _: unparsed<28> at +0, width 28.
	// Field mode: uint<2> at +28, width 2.
	let mode = (ok[1]) ?
		((block[1] & 0b1100) >> 2)
		: null;
	// Field frequency: uint<18> at +30, width 18.
	let frequency = (ok[1] && ok[2]) ?
		((block[1] & 0b11) << 16) | ((block[2]))
		: null;
	// Field eid: uint<16> at +48, width 16.
	let eid = (ok[3]) ?
		((block[3]))
		: null;

	// Actions.
	if ((eid != null) && (frequency != null) && (mode != null) && (station != null)) {
		station.dab_cross_ref_app.addEnsemble(mode, frequency, eid);
	}
}

export function parse_group_dabxref_service(block: Uint16Array, ok: boolean[], log: LogMessage, station: Station) {
	// Field _: unparsed<28> at +0, width 28.
	// Field variant: uint<4> at +28, width 4.
	let variant = (ok[1]) ?
		((block[1] & 0b1111))
		: null;
	// Field info: uint<16> at +32, width 16.
	let info = (ok[2]) ?
		((block[2]))
		: null;
	// Field sid: uint<16> at +48, width 16.
	let sid = (ok[3]) ?
		((block[3]))
		: null;

	// Actions.
	if ((variant != null)) {
		switch (variant) {
			case 0:
				if ((info != null) && (sid != null) && (station != null)) {
					station.dab_cross_ref_app.addServiceEnsembleInfo(info, sid);
				}
				break;

			case 1:
				if ((info != null) && (sid != null) && (station != null)) {
					station.dab_cross_ref_app.addServiceLinkageInfo(info, sid);
				}
				break;

		}
	}
}

export function get_parse_function(rule: string) {
	switch (rule) {
		case "group": return parse_group;
		case "group_unknown": return parse_group_unknown;
		case "group_0A": return parse_group_0A;
		case "group_0B_0_common": return parse_group_0B_0_common;
		case "group_1A": return parse_group_1A;
		case "group_1A_ecc": return parse_group_1A_ecc;
		case "group_1B_1_common": return parse_group_1B_1_common;
		case "group_2A": return parse_group_2A;
		case "group_2B": return parse_group_2B;
		case "group_3A": return parse_group_3A;
		case "group_4A": return parse_group_4A;
		case "group_10A": return parse_group_10A;
		case "group_15A": return parse_group_15A;
		case "group_15B": return parse_group_15B;
		case "group_14A": return parse_group_14A;
		case "group_14A_ps": return parse_group_14A_ps;
		case "group_14A_af_a": return parse_group_14A_af_a;
		case "group_14A_mapped_af": return parse_group_14A_mapped_af;
		case "group_14A_pty_ta": return parse_group_14A_pty_ta;
		case "group_14A_pin": return parse_group_14A_pin;
		case "group_14B": return parse_group_14B;
		case "group_rtplus": return parse_group_rtplus;
		case "group_dabxref": return parse_group_dabxref;
		case "group_dabxref_ensemble": return parse_group_dabxref_ensemble;
		case "group_dabxref_service": return parse_group_dabxref_service;
	}
	throw new RangeError("Invalid rule: " + rule);
}

function formatAf(af: number): string {
	const freq = channelToFrequency(af);
	return freq > 0 ? (freq/10).toString() : "None";
}

function formatRdsText(text: Array<number | null>): string {
	return text.map((c) => c == null ? "." : RDS_CHARMAP[c]).join("");
}

function formatBytes(bytes: Array<number | null>): string {
	return bytes.map((b) => b == null ? ".." : b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
}
