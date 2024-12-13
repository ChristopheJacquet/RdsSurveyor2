# EON.
bitstruct group_14A(station: Station) {
    group_common: unparsed<27>

    # Rest of Block B.
    tp_on: bool
    variant: uint<4>

    # Block C: depends on variant.
    _: uint<16>

    # Block D.
    pi_on: uint<16>
} action {
    log "EON v={variant:u}"
    log "ON.PI={pi_on:04x}"
    log "ON.TP={tp_on:bool}"

    station.other_networks[pi_on].tp = tp_on
    station.other_networks[pi_on].pi = pi_on

    switch variant {
        case 0, 1, 2, 3 {
            parse _ "group_14A_ps"
        }
        case 4 {
            parse _ "group_14A_af_a"
        }
        case 5, 6, 7, 8 {
            parse _ "group_14A_mapped_af"
        }
        case 9 {
            # TODO: Mapped AM AF.
        }
        case 12 {
            # TODO: Linkage information.
        }
        case 13 {
            parse _ "group_14A_pty_ta"
        }
        case 14 {
            parse _ "group_14A_pin"
        }
    }
}

bitstruct group_14A_ps(station: Station) {
    common: unparsed<30>

    # End of Block B.
    addr: uint<2>

    # Block C.
    ps_seg: byte<2>

    # Block D.
    pi_on: uint<16>
} action {
    log "ON.PS seg @{addr:u}: \"{ps_seg:rdstext}\""

    copy station.other_networks[pi_on].ps, addr, 2, ps_seg
}

bitstruct group_14A_af_a(station: Station) {
    common: unparsed<32>

    # Block C.
    af1: uint<8>
    af2: uint<8>

    # Block D.
    pi_on: uint<16>
} action {
    log "ON.AFs {af1:freq} {af2:freq}"

    station.other_networks[pi_on].addAfPair(af1, af2)
}

bitstruct group_14A_mapped_af(station: Station) {
    common: unparsed<32>

    # Block C.
    channel: uint<8>
    mapped_channel: uint<8>

    # Block D.
    pi_on: uint<16>
} action {
    log "ON.AF mapped {channel:freq} → {mapped_channel:freq}"

    station.other_networks[pi_on].addMappedAF(channel, mapped_channel)
}

bitstruct group_14A_pty_ta(station: Station) {
    common: unparsed<32>

    # Block C.
    pty_on: uint<5>
    _: unparsed<10>
    ta_on: bool

    # Block D.
    pi_on: uint<16>
} action {
    log "ON.PTY = {pty_on:u}"
    log "ON.TA = {ta_on:bool}"

    station.other_networks[pi_on].pty = pty_on
    station.other_networks[pi_on].ta = ta_on
}

bitstruct group_14A_pin(station: Station) {
    common: unparsed<32>

    # Block C.
    pin_day_on: uint<5>
    pin_hour_on: uint<5>
    pin_minute_on: uint<6>

    # Block D.
    pi_on: uint<16>
} action {
    log "ON.PIN=(D={pin_day_on:u}, {pin_hour_on:02u}:{pin_minute_on:02u})"

    station.other_networks[pi_on].pin_day = pin_day_on
    station.other_networks[pi_on].pin_hour = pin_hour_on
    station.other_networks[pi_on].pin_minute = pin_minute_on
}

bitstruct group_14B(station: Station) {
    group_common: unparsed<27>

    # Rest of Block B.
    tp_on: bool
    ta_on: bool
    _: unparsed<3>

    # Block C.
    pi: unparsed<16>

    # Block D.
    pi_on: uint<16>
} action {
    log "Other network switch ON.TA={ta_on:bool}"

    station.other_networks[pi_on].ta = ta_on
    station.reportOtherNetworkSwitch(pi_on, ta_on)
}
