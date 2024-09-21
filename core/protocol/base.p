#enum group_type: uint<5> { TYPE_0A, TYPE_0B, 1A, 1B ... TYPE_15B }

#type_table<uint16> oda_own_group_types {
#    0x1234: rt_plus_group_payload
#    ...
#}

#type_table<uint16> oda_3a_group_types {
#    0x1234: rt_plus_3a_payload
#    ...
#}

struct Station {
    pi: uint<16>
    pty: uint<5>
    ptyn: str<8>
    tp: bool
    ta: bool
    ps: str<8>
    lps: str<32>
    rt: str<64>
    music: bool
    di_dynamic_pty: bool
    di_compressed: bool
    di_artificial_head: bool
    di_stereo: bool
    odas: map<uint<16>, tag>
    app_mapping: map<uint<5>, tag>
    oda_3A_mapping: map<uint<16>, tag>
    rt_plus_app: RtPlusApp
    dab_cross_ref_app: DabCrossRefApp

    addToGroupStats(type: uint<5>)
    setClockTime(mjd: uint<17>, hour: uint<5>, minute: uint<6>, tz_sign: bool, tz_offset: uint<5>)
    addAfPair(af1: uint<8>, af2: uint<8>)
}

bitstruct group(station: Station) {
    # Block A.
    pi: uint<16>
    
    # Block B.
    type: uint<5>
    tp: bool
    pty: uint<5>
    
    # Group-specific.
    payload: unparsed<37>
} action {
    station.pi = pi
    station.tp = tp
    station.pty = pty
    station.addToGroupStats(type)
    parse payload lookup(station.app_mapping, type, "group_unknown")
}

bitstruct group_unknown(station: Station) {
    group_common: unparsed<27>
    block_b_rest: uint<5>
    block_c: uint<16>
    block_d: uint<16>
}

bitstruct group_0A(station: Station) {
    group_common: unparsed<27>

    # Rest of Block B.
    ta: bool
    music: bool
    di: bool
    addr: uint<2>
    
    # Block C.
    af1: uint<8>
    af2: uint<8>
    
    # Block D.
    ps_seg: byte<2>
} action {
    station.ta = ta
    station.music = music
    station.addAfPair(af1, af2)
    copy station.ps, addr, 2, ps_seg

    switch addr {
        case 0 {
            station.di_dynamic_pty = di
        }
        case 1 {
            station.di_compressed = di
        }
        case 2 {
            station.di_artificial_head = di
        }
        case 3 {
            station.di_stereo = di
        }
    }
}

bitstruct group_0B(station: Station) {
    group_common: unparsed<27>

    # Rest of Block B.
    ta: bool
    _: bool
    di: bool
    addr: uint<2>
    
    # Block C.
    pi:  uint<16>
    
    # Block D.
    ps_seg: byte<2>
} action {
    station.pi = pi
    copy station.ps, addr, 2, ps_seg
}

bitstruct group_2A(station: Station) {
    group_common: unparsed<27>

    # Rest of Block B.
    flag_ab: bool
    addr: uint<4>
    
    # Blocks C and D.
    rt_seg: byte<4>
} action {
    copy station.rt, addr, 4, rt_seg
}

bitstruct group_2B(station: Station) {
    group_common: unparsed<27>

    # Rest of Block B.
    flag_ab: bool
    addr: uint<4>

    # Block C.
    pi:  uint<16>

    # Block D.
    rt_seg: byte<2>
} action {
    copy station.rt, addr, 2, rt_seg
}

bitstruct group_3A(station: Station) {
    group_common: unparsed<27>

    # Rest of Block B.
    app_group_type: uint<5>
    
    # Block C.
    app_data: unparsed<16>
    
    # Block D.
    aid: uint<16>
} action {
    #station.reportODA(aid, app_group_type)
    put station.app_mapping app_group_type lookup(station.odas, aid, "group_unknown")
    parse app_data lookup(station.oda_3A_mapping, aid, "group_unknown")
}

# Clock time.
bitstruct group_4A(station: Station) {
    group_common: unparsed<27>

    # Spare bits in Block B.
    _: uint<3>
    
    # The rest spans from the last 2 bits of Block B to Block D.
    mjd: uint<17>
    hour: uint<5>
    minute: uint<6>
    tz_sign: bool
    tz_offset: uint<5>
} action {
    station.setClockTime(mjd, hour, minute, tz_sign, tz_offset)
}

# PTYN.
bitstruct group_10A(station: Station) {
    group_common: unparsed<27>

    # Rest of Block B.
    flag_ab: bool
    _: uint<3>
    addr: uint<1>
    
    # Blocks C and D.
    ptyn_seg: byte<4>
} action {
    copy station.ptyn, addr, 4, ptyn_seg
}

# Long PS.
bitstruct group_15A(station: Station) {
    group_common: unparsed<27>

    # Rest of Block B.
    ta: bool
    _: bool
    addr: uint<3>
    lps_seg: byte<4>
} action {
    copy station.lps, addr, 4, lps_seg
}

#include odas.p
