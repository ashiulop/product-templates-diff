import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DemoPanel } from './demo-panel/demo-panel';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DemoPanel, RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {}
