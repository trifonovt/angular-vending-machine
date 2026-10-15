import { CurrencyPipe } from '@angular/common';
import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ACCEPTED_COINS_CENTS } from './models/coin';
import { AppStore } from './store/app-store';

@Component({
  selector: 'app-root',
  imports: [CurrencyPipe, RouterOutlet],
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './app.component.scss',
  standalone: true
})
export class AppComponent implements OnInit {
  readonly store = inject(AppStore);
  readonly acceptedCoins = ACCEPTED_COINS_CENTS;

  ngOnInit(): void {
    this.store.loadProducts();
  }
}
