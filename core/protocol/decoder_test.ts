import { LogMessage, StationImpl } from './rds_types';
import { Station, parse_group_ab } from './base';


function send(s: string, station: Station) {
  for (let l of s.split('\n')) {
    let groups = l.trim().split(' ');
    const logMessage = new LogMessage();
    parse_group_ab(
      Uint16Array.from([
        parseInt(groups[0], 16), parseInt(groups[1], 16),
        parseInt(groups[2], 16), parseInt(groups[3], 16)]),
      [true, true, true, true],
      logMessage,
      station);
    console.log(logMessage.text);
  }
}

// France Inter sample from 2011 (France, Lomont transmitter).
// Tests PI and PS.
describe('France Inter', () => {
  let station = new StationImpl();
  send(`F201 0408 2037 2020
        F201 0409 383B 494E
        F201 040A 3D45 5445
        F201 040F 474E 5220`, station);

  it('should have PI 0xF201', () => {
    expect(station.pi).toBe(0xF201);
  });

  it('should have PS "  INTER "', () => {
    expect(station.getPS()).toBe("  INTER ");
  });

});

// Radio LoRa sample from 2024 (Switzerland, Zurich).
// Tests PS via 0B groups.
describe('Radio LoRa', () => {
  let station = new StationImpl();
  send(`4001 0D48 4001 4C4F
        4001 0D49 4001 5241
        4001 0D4A 4001 2020
        4001 0D4F 4001 2020`, station);

  it('should have PS "LORA    "', () => {
    expect(station.getPS()).toBe("LORA    ");
  });

});

// Radio Classique sample from 2023 (France, Montbeliard/Fort Lachaux transmitter).
// Tests RT (via 2A groups).
describe('Radio Classique', () => {
  let station = new StationImpl();
  send(`F221 040E CDCD 7565
        F221 2401 7274 203A
        F221 2402 2053 796D
        F221 2403 7068 6F6E
        F221 040B CDCD 2020
        F221 2404 6965 206E
        F221 2405 3338 2050
        F221 2406 7261 6775
        F221 0408 CDCD 5072
        F221 2407 6520 3A20
        F221 2408 3165 7220
        F221 2409 6D76 7420
        F221 0409 CDCD 6167
        F221 240A 2020 2020
        F221 240B 2020 2020
        F221 240C 2020 2020
        F221 040E CDCD 7565
        F221 240D 2020 2020
        F221 240E 2020 2020
        F221 240F 2020 2020
        F221 040B CDCD 2020
        F221 2400 4D6F 7A61
        F221 2401 7274 203A
        F221 2402 2053 796D
        F221 0408 CDCD 3165
        F221 2403 7068 6F6E
        F221 2404 6965 206E
        F221 2405 3338 2050`, station);

  it('should have expected RT', () => {
    expect(station.getRT()).toBe("Mozart : Symphonie n38 Prague : 1er mvt                         ");
  });
});

// Radio Campus example transmitting RT with non-ASCII characters, via 2B groups.
describe('Radio Campus', () => {
  let station = new StationImpl();
  send(`FC3A 2C10 FC3A 3838 
        FC3A 0408 E20D 2043 
        FC3A 0409 95CD 414D 
        FC3A 2C11 FC3A 2E38 
        FC3A 040A E20D 5055 
        FC3A 040F 95CD 5320 
        FC3A 2C12 FC3A 206C 
        FC3A 2C13 FC3A 6120 
        FC3A 2C14 FC3A 6672 
        FC3A 2C15 FC3A 8271 
        FC3A 2C16 FC3A 7565 
        FC3A 2C17 FC3A 6E63 
        FC3A 2C18 FC3A 6520 
        FC3A 2C19 FC3A 7374 
        FC3A 2C1A FC3A 796C 
        FC3A 2C1B FC3A 8265 
        FC3A 2C1C FC3A 2020 
        FC3A 2C1D FC3A 2020 
        FC3A 2C1E FC3A 2020 
        FC3A 2C1F FC3A 2020 `, station);

  it('should have PS "  INTER "', () => {
    expect(station.getPS()).toBe(" CAMPUS ");
  });

  it('should have expected RT', () => {
    expect(station.getRT()).toBe("88.8 la fréquence stylée                                        ");
  });
});

// Synthetic example advertising an ODA without an associated group (group type
// code 0). It must not override group decoder for group 0A.
describe('ODA without an associated group', () => {
  let station = new StationImpl();
  send(`FFFF 3000 0000 1234 
        FFFF 0408 E20D 2043 
        FFFF 0409 95CD 414D 
        FFFF 040A E20D 5055 
        FFFF 040F 95CD 5320 `, station);

  it('must not override group 0A decoder', () => {
    expect(station.getPS()).toBe(" CAMPUS ");
  });
});

// BBC sample from 2017 transmitting Clock Time.
describe('BBC Clock Time', () => {
  const station = new StationImpl();
  send('C202 41E1 C565 1802', station);
  it('should have expected CT', () => {
    expect(station.datetime).toBe("17:32+60min 2017-10-08");
  });
});

// Synthetic example with CT epoch before 1 March 1900.
// The usual formulae do not apply. It is ignored.
describe('Bad Clock Time', () => {
  const station = new StationImpl();
  send('1134 42C0 0000 0000', station);
  it('should have expected CT', () => {
    expect(station.datetime).toBe("");
  });
});

// Synthetic example with CT on epoch origin.
describe('Bad Clock Time', () => {
  const station = new StationImpl();
  send('FFFF 41E0 75CE 0000', station);
  it('should have expected CT', () => {
    expect(station.datetime).toBe("00:00+0min 1900-03-01");
  });
});

// Radio Mont-Blanc sample from 2024 transmitting PTYN.
describe('Radio Mont-Blanc ', () => {
  const station = new StationImpl();
  send(`F847 A000 4D54 2042
        F847 A001 4C41 4E43`, station);
  it('should have expected PTYN', () => {
    expect(station.getPTYN()).toBe("MT BLANC");
  });
});

// Synthetic sample with Long PS containing valid UTF-8.
describe('Long PS', () => {
  const station = new StationImpl();
  send(`F999 F400 7065 6163
        F999 F401 6520 D0BC
        F999 F402 D0B8 D180
        F999 F403 20E5 B9B3
        F999 F404 E592 8C00`, station);
  it('should have expected Long PS', () => {
    expect(station.getLPS()).toBe("peace мир 平和");
  });
});

// BBC sample from 2019 using ECC in group 1A.
describe('BBC ECC', () => {
  const station = new StationImpl();
  send(`C201 1120 80E1 E340`, station);
  it('should have expected country', () => {
    expect(station.ecc).toBe(0xE1);
    expect(station.getCountryName()).toBe("United Kingdom");
  });
});

// Synthetic sample setting a language code.
describe('1A group with a language code', () => {
  const station = new StationImpl();
  send(`FFFF 1120 300F E340`, station);
  it('should set the language', () => {
    expect(station.getLanguage()).toBe("French");
  });
});

// 14B group for an known Other Network with PS.
describe('14B group for a known Other Network with PS', () => {
  const station = new StationImpl();
  send(`F202 E410 7220 F222
        F202 E411 3130 F222
        F202 E412 372E F222
        F202 E413 3720 F222
        F202 EC10 F202 F222`, station);
  it('should be labeled with PS', () => {
    expect(station.trafficEvents.map((e) => e.toString()))
      .toEqual(['Switch back from Other Network: PI=F222 (r 107.7).']);
  });
});

// 14B group for an known Other Network without PS.
describe('14B group for a known Other Network without PS', () => {
  const station = new StationImpl();
  send(`F202 E415 0B97 F405
        F202 EC10 F202 F222`, station);
  it('should only have the PI code', () => {
    expect(station.trafficEvents.map((e) => e.toString()))
      .toEqual(['Switch back from Other Network: PI=F222.']);
  });
});

// 14B group for an unknown Other Network.
describe('14B group for an unknown Other Network', () => {
  const station = new StationImpl();
  send(`F202 EC10 F202 F222`, station);
  it('should be handled gracefully', () => {
    expect(station.trafficEvents.map((e) => e.toString()))
      .toEqual(['Switch back from Other Network: PI=F222.']);
  });
});

// eRT encoded in UTF-8. Real sample from Järviradio.
describe('eRT encoded in UTF-8', () => {
  const station = new StationImpl();
  send(`6255 3538 0001 6552
        6255 C520 4AC3 A472
        6255 C521 7669 7261
        6255 C522 6469 6F20
        6255 C523 5244 5332
        6255 C524 2045 5254
        6255 C525 0D0D 0D0D`, station);
  it('should be detected', () => {
    expect(station.ert_app.enabled).toBe(true);
  });
  it('should be decoded correctly', () => {
    expect(station.ert_app.ert.getLatestCompleteOrPartialText())
        .toBe('Järviradio RDS2 ERT');
  });
});

// eRT encoded in UCS-2. Synthetic example inspired from Järviradio.
describe('eRT encoded in UCS-2', () => {
  const station = new StationImpl();
  send(`6255 3538 0000 6552
        6255 C520 4700 E900
        6255 C521 6100 6E00
        6255 C522 7400 0D00`, station);
  it('should be detected', () => {
    expect(station.ert_app.enabled).toBe(true);
  });
  it('should be decoded correctly', () => {
    expect(station.ert_app.ert.getLatestCompleteOrPartialText())
        .toBe('Géant');
  });
});
