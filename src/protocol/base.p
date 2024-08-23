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
    odas: map<uint<5>, uint<16>>
    app_mapping: map<uint<5>, tag>
    setClockTime(mjd: uint<17>, hour: uint<5>, minute: uint<6>, tz_sign: bool, tz_offset: uint<5>)
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
    _: bool
    di: bool
    addr: uint<2>
    
    # Block C.
    af1: uint<8>
    af2: uint<8>
    
    # Block D.
    ps_seg: byte<2>
} action {
    station.ta = ta
    copy station.ps, addr, 2, ps_seg
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
    app_data: uint<16>
    ####app_data: lookup(oda_3a_group_types, aid, uint<16>)  # Forward reference to AID
    # Syntax lookup(type_table, key, default type)
    
    # Block D.
    aid: uint<16>
} action {
    #station.odas[app_group_type] = aid
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
