import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject } from '@angular/core';
import { tapResponse } from '@ngrx/operators';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { filter, pipe, switchMap, tap } from 'rxjs';
import { ACCEPTED_COINS_CENTS } from '../models/coin';
import { IProduct } from '../models/IProduct';
import { TransactionResult } from '../models/transaction';
import { ProductsService } from '../services/products.service';

type AppState = {
  products: IProduct[];
  isLoading: boolean;
  error: string | null;
  selectedProductId: string | null;
  insertedCoins: number[];
  transactionError: string | null;
  lastTransaction: TransactionResult | null;
};

const initialState: AppState = {
  products: [],
  isLoading: false,
  error: null,
  selectedProductId: null,
  insertedCoins: [],
  transactionError: null,
  lastTransaction: null,
};

function makeChange(amountCents: number): number[] {
  const coins: number[] = [];
  let remaining = amountCents;

  // Taking the largest euro coins first gives exact change with the fewest coins.
  for (const coin of [...ACCEPTED_COINS_CENTS].reverse()) {
    while (remaining >= coin) {
      coins.push(coin);
      remaining -= coin;
    }
  }

  return coins;
}

export const AppStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed(({ products, selectedProductId, insertedCoins }) => ({
    selectedProduct: computed(() =>
      products().find(product => product.id === selectedProductId()) ?? null
    ),
    creditCents: computed(() => insertedCoins().reduce((total, coin) => total + coin, 0)),
  })),
  withComputed(({ selectedProduct, creditCents }) => ({
    amountDueCents: computed(() =>
      Math.max(0, (selectedProduct()?.priceCents ?? 0) - creditCents())
    ),
  })),
  withMethods((store, productService = inject(ProductsService)) => ({
    loadProducts: rxMethod<void>(
      pipe(
        // Reloading must not replace inventory while someone is paying.
        filter(() => store.selectedProductId() === null),
        tap(() => patchState(store, { isLoading: true, error: null })),
        switchMap(() => productService.getProducts().pipe(
          tapResponse({
            next: products => patchState(store, { products, isLoading: false }),
            error: (error: unknown) => patchState(store, {
              error: error instanceof HttpErrorResponse || error instanceof Error
                ? error.message
                : 'Failed to fetch products',
              isLoading: false,
            }),
          })
        ))
      )
    ),

    selectProduct(productId: string): void {
      if (store.isLoading() || store.selectedProductId() !== null) {
        return;
      }

      const product = store.products().find(item => item.id === productId);
      if (!product || product.quantity <= 0) {
        patchState(store, { transactionError: 'Select a product that is in stock.' });
        return;
      }

      patchState(store, {
        selectedProductId: product.id,
        insertedCoins: [],
        transactionError: null,
        lastTransaction: null,
      });
    },

    insertCoin(coinCents: number): void {
      const product = store.selectedProduct();
      if (!product || store.isLoading()) {
        return;
      }

      if (!ACCEPTED_COINS_CENTS.includes(coinCents)) {
        patchState(store, { transactionError: 'This coin denomination is not accepted.' });
        return;
      }

      if (product.quantity <= 0) {
        patchState(store, { transactionError: 'This product is sold out. Cancel to return your coins.' });
        return;
      }

      const insertedCoins = [...store.insertedCoins(), coinCents];
      const paidCents = store.creditCents() + coinCents;

      if (paidCents < product.priceCents) {
        patchState(store, { insertedCoins, transactionError: null });
        return;
      }

      const returnedCents = paidCents - product.priceCents;

      // Complete the purchase in one action. A later coin click sees no selection.
      patchState(store, {
        products: store.products().map(item => item.id === product.id
          ? { ...item, quantity: item.quantity - 1 }
          : item
        ),
        selectedProductId: null,
        insertedCoins: [],
        transactionError: null,
        lastTransaction: {
          kind: 'purchase',
          productName: product.name,
          priceCents: product.priceCents,
          paidCents,
          returnedCents,
          returnedCoins: makeChange(returnedCents),
        },
      });
    },

    cancelPurchase(): void {
      if (store.selectedProductId() === null) {
        return;
      }

      // Refund the same denominations that were inserted, without touching stock.
      patchState(store, {
        lastTransaction: {
          kind: 'refund',
          returnedCents: store.creditCents(),
          returnedCoins: [...store.insertedCoins()],
        },
        selectedProductId: null,
        insertedCoins: [],
        transactionError: null,
      });
    },
  }))
);
