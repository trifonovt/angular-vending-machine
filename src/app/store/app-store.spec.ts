import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { IProduct } from '../models/IProduct';
import { ProductsService } from '../services/products.service';
import { AppStore } from './app-store';

describe('AppStore purchase flow', () => {
  let store: InstanceType<typeof AppStore>;
  let productsService: jasmine.SpyObj<ProductsService>;

  const initialProducts: IProduct[] = [
    { id: 'cola', name: 'Cola', category: 'drink', priceCents: 149, quantity: 3 },
    { id: 'water', name: 'Water', category: 'drink', priceCents: 150, quantity: 1 },
    { id: 'chips', name: 'Chips', category: 'snack', priceCents: 199, quantity: 0 },
  ];

  beforeEach(() => {
    productsService = jasmine.createSpyObj<ProductsService>('ProductsService', ['getProducts']);
    productsService.getProducts.and.returnValue(of(initialProducts.map(product => ({ ...product }))));

    TestBed.configureTestingModule({
      providers: [{ provide: ProductsService, useValue: productsService }],
    });

    store = TestBed.inject(AppStore);
    store.loadProducts();
  });

  it('tracks partial payment without dispensing or allowing a different selection', () => {
    store.selectProduct('cola');
    store.insertCoin(100);
    store.selectProduct('water');

    expect(store.selectedProduct()?.id).toBe('cola');
    expect(store.creditCents()).toBe(100);
    expect(store.amountDueCents()).toBe(49);
    expect(store.products()[0].quantity).toBe(3);
    expect(store.lastTransaction()).toBeNull();
  });

  it('automatically dispenses once on exact payment and clears the transaction', () => {
    store.selectProduct('water');
    store.insertCoin(100);
    store.insertCoin(50);

    expect(store.products().find(product => product.id === 'water')?.quantity).toBe(0);
    expect(store.products()[0].quantity).toBe(3);
    expect(store.selectedProduct()).toBeNull();
    expect(store.creditCents()).toBe(0);
    expect(store.insertedCoins()).toEqual([]);
    expect(store.amountDueCents()).toBe(0);
    expect(store.lastTransaction()).toEqual({
      kind: 'purchase',
      productName: 'Water',
      priceCents: 150,
      paidCents: 150,
      returnedCents: 0,
      returnedCoins: [],
    });

    store.insertCoin(200);

    expect(store.products().find(product => product.id === 'water')?.quantity).toBe(0);
    expect(store.creditCents()).toBe(0);
    expect(store.lastTransaction()?.kind).toBe('purchase');
  });

  it('returns exact change using accepted euro coins when overpaid', () => {
    store.selectProduct('cola');
    store.insertCoin(200);

    expect(store.products()[0].quantity).toBe(2);
    expect(store.lastTransaction()).toEqual({
      kind: 'purchase',
      productName: 'Cola',
      priceCents: 149,
      paidCents: 200,
      returnedCents: 51,
      returnedCoins: [50, 1],
    });
    expect(store.selectedProductId()).toBeNull();
    expect(store.creditCents()).toBe(0);
  });

  it('rejects unsupported coin values without changing the existing payment', () => {
    store.selectProduct('cola');
    store.insertCoin(50);

    for (const invalidCoin of [3, 0, -1, 0.5, NaN, Infinity]) {
      store.insertCoin(invalidCoin);

      expect(store.creditCents()).toBe(50);
      expect(store.insertedCoins()).toEqual([50]);
      expect(store.products()[0].quantity).toBe(3);
      expect(store.lastTransaction()).toBeNull();
      expect(store.transactionError()).toBeTruthy();
    }

    store.insertCoin(20);
    expect(store.creditCents()).toBe(70);
    expect(store.transactionError()).toBeNull();
  });

  it('cancels with a refund of the same inserted coins and preserves inventory', () => {
    const inventoryBeforePayment = store.products();
    store.selectProduct('cola');
    store.insertCoin(20);
    store.insertCoin(50);
    store.insertCoin(20);

    store.cancelPurchase();

    expect(store.products()).toEqual(inventoryBeforePayment);
    expect(store.lastTransaction()).toEqual({
      kind: 'refund',
      returnedCents: 90,
      returnedCoins: [20, 50, 20],
    });
    expect(store.selectedProductId()).toBeNull();
    expect(store.insertedCoins()).toEqual([]);
    expect(store.creditCents()).toBe(0);
    expect(store.transactionError()).toBeNull();

    store.selectProduct('water');
    expect(store.selectedProduct()?.id).toBe('water');
    expect(store.lastTransaction()).toBeNull();
    expect(store.amountDueCents()).toBe(150);
  });

  it('allows cancellation before any coins are inserted', () => {
    store.selectProduct('cola');
    store.cancelPurchase();

    expect(store.selectedProduct()).toBeNull();
    expect(store.products()[0].quantity).toBe(3);
    expect(store.lastTransaction()).toEqual({
      kind: 'refund',
      returnedCents: 0,
      returnedCoins: [],
    });
  });

  it('does not accept coins without a selection', () => {
    store.insertCoin(200);
    store.cancelPurchase();

    expect(store.creditCents()).toBe(0);
    expect(store.products()).toEqual(initialProducts);
    expect(store.lastTransaction()).toBeNull();
  });

  it('rejects sold-out and unknown products', () => {
    for (const productId of ['chips', 'missing']) {
      store.selectProduct(productId);
      store.insertCoin(200);

      expect(store.selectedProduct()).toBeNull();
      expect(store.creditCents()).toBe(0);
      expect(store.products()).toEqual(initialProducts);
      expect(store.transactionError()).toBeTruthy();
    }
  });

  it('does not reload inventory while a purchase is in progress', () => {
    store.selectProduct('cola');
    store.insertCoin(50);
    store.loadProducts();

    expect(productsService.getProducts).toHaveBeenCalledTimes(1);
    expect(store.selectedProduct()?.id).toBe('cola');
    expect(store.creditCents()).toBe(50);
    expect(store.isLoading()).toBeFalse();
  });

  it('blocks selection while loading and allows it when loading finishes', () => {
    const response = new Subject<IProduct[]>();
    productsService.getProducts.and.returnValue(response);
    store.loadProducts();
    store.selectProduct('cola');

    expect(store.isLoading()).toBeTrue();
    expect(store.selectedProduct()).toBeNull();

    response.next(initialProducts);
    response.complete();
    store.selectProduct('cola');

    expect(store.isLoading()).toBeFalse();
    expect(store.selectedProduct()?.id).toBe('cola');
  });

  it('reports loading failures and can load successfully after a retry', () => {
    productsService.getProducts.and.returnValue(throwError(() => new Error('API unavailable')));
    store.loadProducts();

    expect(store.isLoading()).toBeFalse();
    expect(store.error()).toBe('API unavailable');

    productsService.getProducts.and.returnValue(of(initialProducts));
    store.loadProducts();

    expect(store.isLoading()).toBeFalse();
    expect(store.error()).toBeNull();
    expect(store.products()).toEqual(initialProducts);
  });
});
