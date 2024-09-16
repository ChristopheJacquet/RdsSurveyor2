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
}