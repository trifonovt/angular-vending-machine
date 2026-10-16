import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ACCEPTED_COINS_CENTS } from '../../models/coin';
import { AppStore } from '../../store/app-store';

@Component({
  selector: 'app-vending-machine',
  imports: [CurrencyPipe, RouterLink],
  templateUrl: './vending-machine.component.html',
  styleUrl: './vending-machine.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VendingMachineComponent {
  readonly store = inject(AppStore);
  readonly acceptedCoins = ACCEPTED_COINS_CENTS;
}
