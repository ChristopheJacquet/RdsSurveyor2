import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'hex',
  standalone: true
})
export class HexPipe implements PipeTransform {

  transform(value: number | undefined, width: number): string {
    const v = value ?? -1;
    if (v < 0) {
      return ''.padStart(width, '-');
    }
    return v.toString(16).toUpperCase().padStart(width, '0');
  }

}
