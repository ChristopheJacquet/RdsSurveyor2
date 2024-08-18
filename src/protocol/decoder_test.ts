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
