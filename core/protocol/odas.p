struct RtPlusApp {
  setTag(content_type: uint<6>, start: uint<6>, length: uint<6>)
}

bitstruct group_rtplus(station: Station) {
  group_common: unparsed<27>

  # After PTY, the ODA-specific part of the RT+ groups is not aligned with
  # block boundaries.
  item_toggle: bool
  item_running: bool

  # Tag 1.
  content_type_1: uint<6>
  start_1: uint<6>
  length_1: uint<6>

  # Tag 2.
  content_type_2: uint<6>
  start_2: uint<6>
  length_2: uint<5>
} action {
  station.rt_plus_app.setTag(content_type_1, start_1, length_1)
  station.rt_plus_app.setTag(content_type_2, start_2, length_2)
} log {
  "RT+ item_toggle={item_toggle:bool} item_running={item_running:bool}"
  "Tag 1: type={content_type_1:u}, start={start_1:u}, length={length_1:u}"
  "Tag 2: type={content_type_2:u}, start={start_2:u}, length={length_2:u}"
}

# ETSI standard EN 301700 describes a way to cross-reference DAB (aka Eureka
# 147) services from their FM/RDS counterparts. This is achieved through the
# use of an ODA, of AID 0x0093 (dec 147).
struct DabCrossRefApp {
  addEnsemble(mode: uint<2>, frequency: uint<18>, eid: uint<16>)
  addServiceEnsembleInfo(eid: uint<16>, sid: uint<16>)
  addServiceLinkageInfo(linkageInfo: uint<16>, sid: uint<16>)
}

bitstruct group_dabxref(station: Station) {
  group_common: unparsed<27>

  es: uint<1>

  _: unparsed<36>
} action {
  switch es {
    case 0 {
      parse _ "group_dabxref_ensemble"
    }
    case 1 {
      parse _ "group_dabxref_service"
    }
  }
}

bitstruct group_dabxref_ensemble(station: Station) {
  _: unparsed<28>

  mode: uint<2>
  frequency: uint<18>
  eid: uint<16>
} action {
  station.dab_cross_ref_app.addEnsemble(mode, frequency, eid)
}

bitstruct group_dabxref_service(station: Station) {
  _: unparsed<28>

  variant: uint<4>
  info: uint<16>
  sid: uint<16>
} action {
  switch variant {
    case 0 {
      station.dab_cross_ref_app.addServiceEnsembleInfo(info, sid)
    }
    case 1 {
      station.dab_cross_ref_app.addServiceLinkageInfo(info, sid)
    }
  }
} log {
  "DAB xref"
  "v={variant:u}"
  "info={info:04x}"
  "sid={sid:04x}"
}

# Extended Radiotext (eRT).
struct ERtApp {
  ert: str<128>
  utf8_encoding: bool
  enabled: bool
}

bitstruct group_ert_declaration(station: Station) {
  # Blocks A and B.
  group_3A_common: unparsed<32>

  # Block C.
  rfu: unparsed<15>
  utf8_encoding: bool

  # Block D.
  ert_aid: unparsed<16>
} action {
  station.ert_app.utf8_encoding = utf8_encoding
  station.ert_app.enabled = true
} log {
  "eRT utf8 encoding? {utf8_encoding:bool}"
}

bitstruct group_ert(station: Station) {
  group_common: unparsed<27>

  # Rest of Block B.
  addr: uint<5>
  
  # Blocks C and D.
  ert_seg: byte<4>
} action {
  copy station.ert_app.ert, addr, 4, ert_seg
} log {
  "eRT seg @{addr:u} \"{ert_seg:bytes}\""
}
