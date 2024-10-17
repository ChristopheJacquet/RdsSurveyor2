import { Component } from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import { MatDialogModule} from '@angular/material/dialog';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [MatButtonModule, MatDialogModule],
  templateUrl: './about.component.html',
  styleUrl: './about.component.scss'
})
export class AboutComponent {

}
