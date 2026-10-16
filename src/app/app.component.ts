import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppStore } from './store/app-store';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './app.component.scss',
  standalone: true
})
export class AppComponent implements OnInit {
  readonly store = inject(AppStore);

  ngOnInit(): void {
    // Fetch once for the application; route changes keep local edits and payments.
    this.store.loadProducts();
  }
}
