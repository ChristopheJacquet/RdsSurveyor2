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
      switch fn {
        case 0 {
          parse _ "group_c_oda_assignment"
        }
        # Ignore other FN values, notably used by the obsolete RPP protocol.
      }
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
      log "Tunnelled A/B group"
      parse _ "group_ab_without_pi"
    }
    case 2 {
      parse _ "group_c_rft"
    }
  }
}

bitstruct group_c_rft(station: Station) {
  fid: unparsed<2>    # Function Id
  type: unparsed<2>
  pipe: uint<4>

  toggle: uint<1>
  addr: uint<15>

  # Data bytes accept any correctable block: RftPipe keeps the least
  # corrected copy of each byte, and files are checked by CRCs. Addresses
  # (and byte1, which shares block B with addr) remain strict, as a wrong
  # address would corrupt other bytes.
  byte1: uint<8> tolerate 5
  byte2: uint<8> tolerate 5
  byte3: uint<8> tolerate 5
  byte4: uint<8> tolerate 5
  byte5: uint<8> tolerate 5
} action {
  log "RFT pipe {pipe:u}"
  log "toggle {toggle:u}"
  log "addr {addr:u}"
  # An RFT pipe carries files for the ODA assigned to the channel with the
  # same number (see group_c_oda_rft_assignment).
  station.addToPipeStats(pipe)
  station.reportRftByte(pipe, 5*addr, byte1, errors(byte1))
  station.reportRftByte(pipe, 5*addr + 1, byte2, errors(byte2))
  station.reportRftByte(pipe, 5*addr + 2, byte3, errors(byte3))
  station.reportRftByte(pipe, 5*addr + 3, byte4, errors(byte4))
  station.reportRftByte(pipe, 5*addr + 4, byte5, errors(byte5))
  station.updateRftPipe(pipe)
}

bitstruct group_c_oda(station: Station) {
  fid: unparsed<2>    # Function Id
  channel: uint<6>

  # The rest (7 bytes) depends on the ODA.
  app_data: unparsed<56>
} action {
  log "ODA channel {channel:u}"
  station.addToChannelStats(channel)
  parse _ lookup(station.channel_app_mapping, channel, "group_unknown")
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
      put station.channel_app_mapping channel lookup(station.odas, aid1, "group_unknown")
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
