# Radio Paging.
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
            log "Beep"
            parse _ "group_7A_address"
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
    rp_common: unparsed<32>

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
}

# 10-digit numeric RP.
bitstruct group_7A_numeric_10(station: Station) {
    rp_common: unparsed<31>
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
            parse _ "group_7A_address"
            log "Part 1/2: {a7:bcd}{a8:bcd}"
        }
        case 1 {
            log "Part 2/2: {a1:bcd}{a2:bcd}{a3:bcd}{a4:bcd}{a5:bcd}{a6:bcd}{a7:bcd}{a8:bcd}"
        }
    }
}

# 18-digit numeric RP.
bitstruct group_7A_numeric_18(station: Station) {
    rp_common: unparsed<30>
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
            parse _ "group_7A_address"
            log "Part 1/3: {a7:bcd}{a8:bcd}"
        }
        case 1 {
            log "Part 2/3: {a1:bcd}{a2:bcd}{a3:bcd}{a4:bcd}{a5:bcd}{a6:bcd}{a7:bcd}{a8:bcd}"
        }
        case 2 {
            log "Part 3/3: {a1:bcd}{a2:bcd}{a3:bcd}{a4:bcd}{a5:bcd}{a6:bcd}{a7:bcd}{a8:bcd}"
        }
    }
}

# Alphanumeric RP.
bitstruct group_7A_alphanumeric(station: Station) {
    rp_common: unparsed<29>
    addr: uint<3>

    # Blocks C and D.
    text_seg: byte<4>
} action {
    switch addr {
        case 0 {
            parse _ "group_7A_address"
        }
        case 1, 2, 3, 4, 5, 6 {
            log "Part ({addr:u} + 6k)/n: \"{text_seg:rdstext}\""
        }
        case 7 {
            log "Part n/n: \"{text_seg:rdstext}\""
        }
    }
}
