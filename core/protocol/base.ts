// Generated file. DO NOT EDIT.

import { RdsString } from "./rds_types";

export interface Station {
	pi?: number;
	pty?: number;
	ptyn: RdsString;
	tp?: boolean;
	ta?: boolean;
	ps: RdsString;
	lps: RdsString;
	rt: RdsString;
	di_dynamic_pty?: boolean;
	di_compressed?: boolean;
	di_artificial_head?: boolean;
	di_stereo?: boolean;
	odas: Map<number, string>;
	app_mapping: Map<number, string>;
	oda_3A_mapping: Map<number, string>;
	rt_plus_app: RtPlusApp;
	addToGroupStats(type: number): void;
	setClockTime(mjd: number, hour: number, minute: number, tz_sign: boolean, tz_offset: number): void;
}

export function parse_group(block: Uint16Array, ok: boolean[], station: Station) {
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
		get_parse_function(station.app_mapping.get(type) ?? "group_unknown")(block, ok, station);
	}
}

export function parse_group_unknown(block: Uint16Array, ok: boolean[], station: Station) {
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

export function parse_group_0A(block: Uint16Array, ok: boolean[], station: Station) {
	// Field group_common: unparsed<27> at +0, width 27.
	// Field ta: bool at +27, width 1.
	let ta = (ok[1]) ?
		((block[1] & 0b10000) >> 4) == 1
		: null;
	// Field _: bool at +28, width 1.
	// Field di: bool at +29, width 1.
	let di = (ok[1]) ?
		((block[1] & 0b100) >> 2) == 1
		: null;
	// Field addr: uint<2> at +30, width 2.
	let addr = (ok[1]) ?
		((block[1] & 0b11))
		: null;
	// Field af1: uint<8> at +32, width 8.
	let af1 = (ok[2]) ?
		((block[2] & 0b1111111100000000) >> 8)
		: null;
	// Field af2: uint<8> at +40, width 8.
	let af2 = (ok[2]) ?
		((block[2] & 0b11111111))
		: null;
	// Field ps_seg: byte<2> at +48, width 16.
	let ps_seg__0 = (ok[3]) ?
		((block[3] & 0b1111111100000000) >> 8)
		: null;
	let ps_seg__1 = (ok[3]) ?
		((block[3] & 0b11111111))
		: null;

	// Actions.
	if ((ta != null)) {
		station.ta = ta;
	}
	if ((addr != null) && (ps_seg__0 != null)) {
		station.ps.setByte(addr*2 + 0, ps_seg__0);
	}
	if ((addr != null) && (ps_seg__1 != null)) {
		station.ps.setByte(addr*2 + 1, ps_seg__1);
	}
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

export function parse_group_0B(block: Uint16Array, ok: boolean[], station: Station) {
	// Field group_common: unparsed<27> at +0, width 27.
	// Field ta: bool at +27, width 1.
	let ta = (ok[1]) ?
		((block[1] & 0b10000) >> 4) == 1
		: null;
	// Field _: bool at +28, width 1.
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
	// Field ps_seg: byte<2> at +48, width 16.
	let ps_seg__0 = (ok[3]) ?
		((block[3] & 0b1111111100000000) >> 8)
		: null;
	let ps_seg__1 = (ok[3]) ?
		((block[3] & 0b11111111))
		: null;

	// Actions.
	if ((pi != null)) {
		station.pi = pi;
	}
	if ((addr != null) && (ps_seg__0 != null)) {
		station.ps.setByte(addr*2 + 0, ps_seg__0);
	}
	if ((addr != null) && (ps_seg__1 != null)) {
		station.ps.setByte(addr*2 + 1, ps_seg__1);
	}
}

export function parse_group_2A(block: Uint16Array, ok: boolean[], station: Station) {
	// Field group_common: unparsed<27> at +0, width 27.
	// Field flag_ab: bool at +27, width 1.
	let flag_ab = (ok[1]) ?
		((block[1] & 0b10000) >> 4) == 1
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

	// Actions.
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

export function parse_group_2B(block: Uint16Array, ok: boolean[], station: Station) {
	// Field group_common: unparsed<27> at +0, width 27.
	// Field flag_ab: bool at +27, width 1.
	let flag_ab = (ok[1]) ?
		((block[1] & 0b10000) >> 4) == 1
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

	// Actions.
	if ((addr != null) && (rt_seg__0 != null)) {
		station.rt.setByte(addr*2 + 0, rt_seg__0);
	}
	if ((addr != null) && (rt_seg__1 != null)) {
		station.rt.setByte(addr*2 + 1, rt_seg__1);
	}
}

export function parse_group_3A(block: Uint16Array, ok: boolean[], station: Station) {
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
		station.app_mapping.set(app_group_type, station.odas.get(aid) ?? "group_unknown");
	}
	if ((aid != null)) {
		get_parse_function(station.oda_3A_mapping.get(aid) ?? "group_unknown")(block, ok, station);
	}
}

export function parse_group_4A(block: Uint16Array, ok: boolean[], station: Station) {
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
	if ((hour != null) && (minute != null) && (mjd != null) && (station != null) && (tz_offset != null) && (tz_sign != null)) {
		station.setClockTime(mjd, hour, minute, tz_sign, tz_offset);
	}
}

export function parse_group_10A(block: Uint16Array, ok: boolean[], station: Station) {
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

	// Actions.
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

export function parse_group_15A(block: Uint16Array, ok: boolean[], station: Station) {
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

	// Actions.
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

export interface RtPlusApp {
	setTag(content_type: number, start: number, length: number): void;
}

export function parse_group_rtplus(block: Uint16Array, ok: boolean[], station: Station) {
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

export function get_parse_function(rule: string) {
	switch (rule) {
		case "group": return parse_group;
		case "group_unknown": return parse_group_unknown;
		case "group_0A": return parse_group_0A;
		case "group_0B": return parse_group_0B;
		case "group_2A": return parse_group_2A;
		case "group_2B": return parse_group_2B;
		case "group_3A": return parse_group_3A;
		case "group_4A": return parse_group_4A;
		case "group_10A": return parse_group_10A;
		case "group_15A": return parse_group_15A;
		case "group_rtplus": return parse_group_rtplus;
	}
	throw new RangeError("Invalid rule: " + rule);
}
