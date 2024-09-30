import { StationImpl } from './rds_types';
import { Station, parse_group } from './base';


function send(s: string, station: Station) {
  for (let l of s.split('\n')) {
    let groups = l.trim().split(' ');
    parse_group(Uint16Array.from([
      parseInt(groups[0], 16), parseInt(groups[1], 16),
      parseInt(groups[2], 16), parseInt(groups[3], 16)]), [true, true, true, true], station);
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
