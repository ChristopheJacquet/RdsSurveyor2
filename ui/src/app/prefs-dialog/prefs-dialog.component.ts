import { Component, ChangeDetectionStrategy } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialogModule } from '@angular/material/dialog';
import { MatInputModule } from '@angular/material/input';
import { MatSliderModule } from '@angular/material/slider';
import { Pref, prefs } from '../prefs';

@Component({
    selector: 'app-prefs-dialog',
    imports: [DecimalPipe, FormsModule, MatButtonModule, MatButtonToggleModule, MatCheckboxModule, MatDialogModule, MatInputModule, MatSliderModule],
    templateUrl: './prefs-dialog.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './prefs-dialog.component.scss'
})
export class PrefsDialogComponent {
  readonly prefs: Pref<any>[] = Object.values(prefs);
}
