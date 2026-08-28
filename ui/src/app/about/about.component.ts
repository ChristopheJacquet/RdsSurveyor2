import { Component, ChangeDetectionStrategy } from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import { MatDialogModule} from '@angular/material/dialog';

@Component({
    selector: 'app-about',
    imports: [MatButtonModule, MatDialogModule],
    templateUrl: './about.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './about.component.scss'
})
export class AboutComponent {

}
