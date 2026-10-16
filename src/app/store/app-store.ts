import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject } from '@angular/core';
import { tapResponse } from '@ngrx/operators';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { filter, pipe, switchMap, tap } from 'rxjs';
import { ACCEPTED_COINS_CENTS } from '../models/coin';
import { IProduct, ProductInput } from '../models/IProduct';
import { TransactionResult } from '../models/transaction';
import { ProductsService } from '../services/products.service';

type AppState = {
  products: IProduct[];
  isLoading: boolean;
  error: string | null;
  productError: string | null;
  selectedProductId: string | null;
  insertedCoins: number[];
  transactionError: string | null;
  lastTransaction: TransactionResult | null;
};

const initialState: AppState = {
  products: [],
  isLoading: false,
  error: null,
  productError: null,
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

function validateProduct(input: ProductInput, products: IProduct[], productId?: string): string | null {
  if (typeof input.name !== 'string' || !input.name.trim()) {
    return 'Enter a product name.';
  }

  if (typeof input.category !== 'string' || !input.category.trim()) {
    return 'Enter a product category.';
  }

  if (!Number.isSafeInteger(input.priceCents) || input.priceCents <= 0) {
    return 'Price must be a positive whole number of cents.';
  }

  if (!Number.isInteger(input.quantity) || input.quantity < 0 || input.quantity > 15) {
    return 'Quantity must be a whole number from 0 to 15.';
  }

  if (products.some(product => product.id !== productId && product.priceCents === input.priceCents)) {
    return 'Choose a different price: another product already has this price.';
  }

  return null;
}

function normalizeProduct(input: ProductInput): ProductInput {
  return {
    name: input.name.trim(),
    category: input.category.trim(),
    priceCents: input.priceCents,
    quantity: input.quantity,
  };
}

export const AppStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed(({ products, selectedProductId, insertedCoins, isLoading, error }) => ({
    selectedProduct: computed(() =>
      products().find(product => product.id === selectedProductId()) ?? null
    ),
    creditCents: computed(() => insertedCoins().reduce((total, coin) => total + coin, 0)),
    canManageProducts: computed(() =>
      !isLoading() && error() === null && selectedProductId() === null && insertedCoins().length === 0
    ),
  })),
  withComputed(({ selectedProduct, creditCents }) => ({
    amountDueCents: computed(() =>
      Math.max(0, (selectedProduct()?.priceCents ?? 0) - creditCents())
    ),
  })),
  withMethods((store, productService = inject(ProductsService)) => {
    let nextProductId = 1;

    function canChangeInventory(): boolean {
      if (store.canManageProducts()) {
        return true;
      }

      patchState(store, {
        productError: store.isLoading() || store.error() !== null
          ? 'Wait until products have loaded successfully before making changes.'
          : 'Finish or cancel the current purchase before managing products.',
      });
      return false;
    }

    return {
      loadProducts: rxMethod<void>(
        pipe(
          // Reloading must not replace inventory while someone is paying.
          filter(() => store.selectedProductId() === null),
          tap(() => patchState(store, { isLoading: true, error: null, productError: null })),
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

      clearProductError(): void {
        patchState(store, { productError: null });
      },

      addProduct(input: ProductInput): boolean {
        if (!canChangeInventory()) {
          return false;
        }

        const productError = validateProduct(input, store.products());
        if (productError) {
          patchState(store, { productError });
          return false;
        }

        // IDs only need to be unique within this in-memory inventory.
        let id: string;
        do {
          id = `local-${nextProductId++}`;
        } while (store.products().some(product => product.id === id));

        patchState(store, {
          products: [...store.products(), { ...normalizeProduct(input), id }],
          productError: null,
        });
        return true;
      },

      updateProduct(id: string, input: ProductInput): boolean {
        if (!canChangeInventory()) {
          return false;
        }

        if (!store.products().some(product => product.id === id)) {
          patchState(store, { productError: 'This product no longer exists.' });
          return false;
        }

        const productError = validateProduct(input, store.products(), id);
        if (productError) {
          patchState(store, { productError });
          return false;
        }

        patchState(store, {
          products: store.products().map(product => product.id === id
            ? { ...normalizeProduct(input), id }
            : product
          ),
          productError: null,
        });
        return true;
      },

      deleteProduct(id: string): boolean {
        if (!canChangeInventory()) {
          return false;
        }

        if (!store.products().some(product => product.id === id)) {
          patchState(store, { productError: 'This product no longer exists.' });
          return false;
        }

        patchState(store, {
          products: store.products().filter(product => product.id !== id),
          productError: null,
        });
        return true;
      },

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
    };
  })
);
