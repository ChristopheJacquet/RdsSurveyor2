bitstruct group_c(station: Station) {
  # Block A.
  fid: uint<2>    # Function Id
  fn: uint<6>     # Function Number
  
  # Rest.
  payload: unparsed<56>
} action {
  log "FID={fid:u}"
  log "FN={fn:u}"

  switch fid {
    case 0 {
      parse _ "group_c_fid_0"
    }
    case 1 {
      parse _ "group_c_oda"
    }
    case 2 {
      parse _ "group_c_oda_assignment"
    }
    case 3 {
      # RFU.
    }
  }
}

bitstruct group_c_fid_0(station: Station) {
  # Block A.
  fid: unparsed<2>    # Function Id
  type: uint<2>
  _: unparsed<4>

  # Rest.
  _: unparsed<56>
} action {
  switch type {
    case 0 {
      parse _ "group_c_ab_tunnelling"
    }
    case 2 {
      parse _ "group_c_rft"
    }
  }
}

bitstruct group_c_ab_tunnelling(station: Station) {
  # TODO.
  _: unparsed<64>
}

bitstruct group_c_rft(station: Station) {
  fid: unparsed<2>    # Function Id
  type: unparsed<2>
  pipe: uint<4>

  toggle: uint<1>
  addr: uint<15>

  byte1: uint<8>
  byte2: uint<8>
  byte3: uint<8>
  byte4: uint<8>
  byte5: uint<8>
} action {
  log "RFT pipe {pipe:u}"
  log "toggle {toggle:u}"
  log "addr {addr:u}"
  station.reportRftData(pipe, addr, byte1, byte2, byte3, byte4, byte5)
}

bitstruct group_c_oda(station: Station) {
  # TODO.
  _: unparsed<64>
}

bitstruct group_c_oda_assignment(station: Station) {
  # Block A.
  header: unparsed<8>
  variant: uint<2>
  channel: uint<6>

  # Next blocks.
  aid1: uint<16>
  block_c: uint<16>
  block_d: uint<16>
} action {
  switch variant {
    case 0 {
      log "ODA assignment"
      log "Channel {channel:u} -> AID {aid1:04x}"
      #log "Data_1={block_c:04x}"
      #log "Data_2={block_d:04x}"
      put station.transmitted_channel_odas channel aid1
      switch channel {
        case 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15 {
          parse _ "group_c_oda_rft_assignment"
        }
        # TODO: Handle channels >= 16.
      }
    }
    case 1, 2, 3 {
      # TODO: implement other variants.
      log "Variant {variant:u} not implemented."
    }
  }
}

bitstruct group_c_oda_rft_assignment(station: Station) {
  # Block A.
  header: unparsed<8>
  zero: unparsed<4>
  pipe: unparsed<4>

  # Block B.
  aid: unparsed<16>

  # Block C.
  variant: uint<4>

  # Rest.
  _: unparsed<28>
} action {
  log "Variant {variant:u}"
  switch variant {
    case 0 {
      parse _ "group_c_oda_rft_assignment_v0"
    }
    case 1 {
      parse _ "group_c_oda_rft_assignment_v1"
    }
    # TODO: implement other variants.
  }
}

bitstruct group_c_oda_rft_assignment_v0(station: Station) {
  # Block A.
  header: unparsed<8>
  zero: unparsed<4>
  pipe: uint<4>

  # Block B.
  aid: unparsed<16>

  # Block C and D.
  variant: unparsed<4>
  crc_present: bool
  file_version: uint<3>
  file_id: uint<6>
  file_size: uint<18>
} action {
  log "CRC? {crc_present:bool}"
  log "File version: {file_version:u}"
  log "File id: {file_id:u}"
  log "File size: {file_size:u}"
  station.reportRftMetadata(pipe, file_size, file_id, file_version, crc_present)
}

bitstruct group_c_oda_rft_assignment_v1(station: Station) {
  # Block A.
  header: unparsed<8>
  zero: unparsed<4>
  pipe: uint<4>

  # Block B.
  aid: unparsed<16>

  # Block C.
  variant: unparsed<4>
  mode: uint<3>
  chunk_address: uint<9>

  # Block D.
  crc: uint<16>
} action {
  log "CRC mode: {mode:u}"
  log "Chunk addr: {chunk_address:u}"
  log "CRC: {crc:04x}"
  station.reportRftCrc(pipe, mode, chunk_address, crc)
}
