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