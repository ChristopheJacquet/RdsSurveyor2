# Radio Paging.

struct RpApp {
    newBeepMessage(flag_ab: bool)
    new10dMessage(flag_ab: bool)
    new18dMessage(flag_ab: bool)
    newAlphaMessage(flag_ab: bool)
    reportAddress(flag_ab: bool,
                    y1: uint<4>, y2: uint<4>,
                    z1: uint<4>, z2: uint<4>, z3: uint<4>, z4: uint<4>)
    reportBeep(flag_ab: bool)
    report10dPart(flag_ab: bool, addr: uint<3>, d1: uint<4>, d2: uint<4>)
    report18dPart(flag_ab: bool, addr: uint<4>, d1: uint<4>, d2: uint<4>)
    reportAlphaPart(flag_ab: bool, addr: uint<4>, offset: uint<1>, c1: uint<8>, c2: uint<8>, last: bool)
}

bitstruct group_7A(station: Station) {
    group_common: unparsed<27>

    # Rest of Block B.
    flag_ab: bool
    addr: uint<4>
    
    # Blocks C and D.
    paging_data: unparsed<32>
} action {
    log "Paging [flag={flag_ab:letter}]"
    switch addr {
        case 0 {
            station.rp_app.newBeepMessage(flag_ab)
            log "Beep"
            parse _ "group_7A_address"
            station.rp_app.reportBeep(flag_ab)
        }
        case 1 {
            log "Functions"
        }
        case 2, 3 {
            log "10-digit"
            parse _ "group_7A_numeric_10"
        }
        case 4, 5, 6, 7 {
            log "18-digit"
            parse _ "group_7A_numeric_18"
        }
        case 8, 9, 10, 11, 12, 13, 14, 15 {
            log "Alphanumeric"
            parse _ "group_7A_alphanumeric"
        }
    }
}

# RP address.
bitstruct group_7A_address(station: Station) {
    rp_common: unparsed<27>
    flag_ab: bool
    _: unparsed<4>

    # Block C.
    y1: uint<4>
    y2: uint<4>
    z1: uint<4>
    z2: uint<4>

    # Block D.
    z3: uint<4>
    z4: uint<4>
    _: unparsed<8>
} action {
    log "Address: {y1:bcd}{y2:bcd}/{z1:bcd}{z2:bcd}{z3:bcd}{z4:bcd}"
    station.rp_app.reportAddress(flag_ab, y1, y2, z1, z2, z3, z4)
}

# 10-digit numeric RP.
bitstruct group_7A_numeric_10(station: Station) {
    rp_common: unparsed<27>
    flag_ab: bool
    _: unparsed<3>
    addr: uint<1>

    # Block C.
    a1: uint<4>
    a2: uint<4>
    a3: uint<4>
    a4: uint<4>

    # Block D.
    a5: uint<4>
    a6: uint<4>
    a7: uint<4>
    a8: uint<4>
} action {
    switch addr {
        case 0 {
            station.rp_app.new10dMessage(flag_ab)
            parse _ "group_7A_address"
            log "Part 1/2: {a7:bcd}{a8:bcd}"
            station.rp_app.report10dPart(flag_ab, 0, a7, a8)
        }
        case 1 {
            log "Part 2/2: {a1:bcd}{a2:bcd}{a3:bcd}{a4:bcd}{a5:bcd}{a6:bcd}{a7:bcd}{a8:bcd}"
            station.rp_app.report10dPart(flag_ab, 1, a1, a2)
            station.rp_app.report10dPart(flag_ab, 2, a3, a4)
            station.rp_app.report10dPart(flag_ab, 3, a5, a6)
            station.rp_app.report10dPart(flag_ab, 4, a7, a8)
        }
    }
}

# 18-digit numeric RP.
bitstruct group_7A_numeric_18(station: Station) {
    rp_common: unparsed<27>
    flag_ab: bool
    _: unparsed<2>
    addr: uint<2>

    # Block C.
    a1: uint<4>
    a2: uint<4>
    a3: uint<4>
    a4: uint<4>

    # Block D.
    a5: uint<4>
    a6: uint<4>
    a7: uint<4>
    a8: uint<4>
} action {
    switch addr {
        case 0 {
            station.rp_app.new18dMessage(flag_ab)
            parse _ "group_7A_address"
            log "Part 1/3: {a7:bcd}{a8:bcd}"
            station.rp_app.report18dPart(flag_ab, 0, a7, a8)
        }
        case 1 {
            log "Part 2/3: {a1:bcd}{a2:bcd}{a3:bcd}{a4:bcd}{a5:bcd}{a6:bcd}{a7:bcd}{a8:bcd}"
            station.rp_app.report18dPart(flag_ab, 1, a1, a2)
            station.rp_app.report18dPart(flag_ab, 2, a3, a4)
            station.rp_app.report18dPart(flag_ab, 3, a5, a6)
            station.rp_app.report18dPart(flag_ab, 4, a7, a8)
        }
        case 2 {
            log "Part 3/3: {a1:bcd}{a2:bcd}{a3:bcd}{a4:bcd}{a5:bcd}{a6:bcd}{a7:bcd}{a8:bcd}"
            station.rp_app.report18dPart(flag_ab, 5, a1, a2)
            station.rp_app.report18dPart(flag_ab, 6, a3, a4)
            station.rp_app.report18dPart(flag_ab, 7, a5, a6)
            station.rp_app.report18dPart(flag_ab, 8, a7, a8)
        }
    }
}

# Alphanumeric RP.
bitstruct group_7A_alphanumeric(station: Station) {
    rp_common: unparsed<27>
    flag_ab: bool
    _: unparsed<1>
    addr: uint<3>

    # Block C.
    char1: uint<8>
    char2: uint<8>

    # Block D.
    char3: uint<8>
    char4: uint<8>
} action {
    switch addr {
        case 0 {
            station.rp_app.newAlphaMessage(flag_ab)
            parse _ "group_7A_address"
        }
        case 1, 2, 3, 4, 5, 6 {
            log "Part ({addr:u} + 6k)/n: \"{char1:rdschar}{char2:rdschar}{char3:rdschar}{char4:rdschar}\""
            station.rp_app.reportAlphaPart(flag_ab, addr, 0, char1, char2, false)
            station.rp_app.reportAlphaPart(flag_ab, addr, 1, char3, char4, false)
        }
        case 7 {
            log "Part n/n: \"{char1:rdschar}{char2:rdschar}{char3:rdschar}{char4:rdschar}\""
            station.rp_app.reportAlphaPart(flag_ab, addr, 0, char1, char2, false)
            station.rp_app.reportAlphaPart(flag_ab, addr, 1, char3, char4, true)
        }
    }
}
