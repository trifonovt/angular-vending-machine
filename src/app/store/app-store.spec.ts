import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { IProduct, ProductInput } from '../models/IProduct';
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

describe('AppStore product management', () => {
  let store: InstanceType<typeof AppStore>;
  let productsService: jasmine.SpyObj<ProductsService>;
  let apiProducts: IProduct[];

  const newProduct: ProductInput = {
    name: '  Biscuits  ', category: '  snack  ', priceCents: 250, quantity: 15,
  };

  beforeEach(() => {
    apiProducts = [
      { id: 'cola', name: 'Cola', category: 'drink', priceCents: 149, quantity: 3 },
      { id: 'local-1', name: 'Water', category: 'drink', priceCents: 150, quantity: 1 },
    ];
    productsService = jasmine.createSpyObj<ProductsService>('ProductsService', ['getProducts']);
    productsService.getProducts.and.returnValue(of(apiProducts));
    TestBed.configureTestingModule({
      providers: [{ provide: ProductsService, useValue: productsService }],
    });
    store = TestBed.inject(AppStore);
    store.loadProducts();
  });

  it('creates, edits and deletes locally without changing API data or requesting it again', () => {
    const originalApiProducts = apiProducts.map(product => ({ ...product }));

    expect(store.addProduct(newProduct)).toBeTrue();
    const addedProduct = store.products()[2];
    expect(addedProduct).toEqual({
      id: jasmine.any(String), name: 'Biscuits', category: 'snack', priceCents: 250, quantity: 15,
    });
    expect(store.updateProduct(addedProduct.id, {
      name: '  Cookies  ', category: '  sweet  ', priceCents: 250, quantity: 0,
    })).toBeTrue();
    expect(store.products()[2]).toEqual({
      id: addedProduct.id, name: 'Cookies', category: 'sweet', priceCents: 250, quantity: 0,
    });

    // The root store retains edits for another consumer, such as the vending page.
    expect(TestBed.inject(AppStore).products()[2].name).toBe('Cookies');
    expect(store.deleteProduct('cola')).toBeTrue();
    expect(store.products().map(product => product.id)).toEqual(['local-1', addedProduct.id]);
    expect(apiProducts).toEqual(originalApiProducts);
    expect(productsService.getProducts).toHaveBeenCalledTimes(1);
    expect(store.productError()).toBeNull();
  });

  it('generates distinct IDs even when the API supplies a matching ID and a product is deleted', () => {
    store.addProduct(newProduct);
    const firstId = store.products()[2].id;
    expect(firstId).not.toBe('local-1');
    expect(firstId).not.toBe('cola');

    store.deleteProduct(firstId);
    store.addProduct(newProduct);
    const secondId = store.products()[2].id;
    expect(secondId).not.toBe(firstId);
    expect(new Set(store.products().map(product => product.id)).size).toBe(store.products().length);
  });

  it('accepts the stock boundaries and positive safe integer prices', () => {
    expect(store.addProduct({ ...newProduct, quantity: 0, priceCents: 1 })).toBeTrue();
    expect(store.addProduct({ ...newProduct, quantity: 15, priceCents: Number.MAX_SAFE_INTEGER })).toBeTrue();
  });

  const invalidInputs: { description: string; changes: Partial<ProductInput> }[] = [
    { description: 'blank name', changes: { name: '  ' } },
    { description: 'blank category', changes: { category: '  ' } },
    { description: 'zero price', changes: { priceCents: 0 } },
    { description: 'negative price', changes: { priceCents: -1 } },
    { description: 'fractional price', changes: { priceCents: 1.5 } },
    { description: 'non-finite price', changes: { priceCents: Infinity } },
    { description: 'NaN price', changes: { priceCents: NaN } },
    { description: 'unsafe price', changes: { priceCents: Number.MAX_SAFE_INTEGER + 1 } },
    { description: 'negative quantity', changes: { quantity: -1 } },
    { description: 'more than 15 units', changes: { quantity: 16 } },
    { description: 'fractional quantity', changes: { quantity: 1.5 } },
    { description: 'NaN quantity', changes: { quantity: NaN } },
    { description: 'non-finite quantity', changes: { quantity: Infinity } },
  ];

  for (const { description, changes } of invalidInputs) {
    it(`rejects ${description} on creation and update without mutating inventory`, () => {
      const inventory = store.products();
      const input = { ...newProduct, ...changes };

      expect(store.addProduct(input)).toBeFalse();
      expect(store.products()).toBe(inventory);
      expect(store.productError()).toBeTruthy();
      expect(store.updateProduct('cola', input)).toBeFalse();
      expect(store.products()).toBe(inventory);
      expect(store.productError()).toBeTruthy();
    });
  }

  it('rejects duplicate prices but lets an edited product keep its own price', () => {
    const inventory = store.products();
    expect(store.addProduct({ ...newProduct, priceCents: 150 })).toBeFalse();
    expect(store.updateProduct('cola', { ...newProduct, priceCents: 150 })).toBeFalse();
    expect(store.products()).toBe(inventory);
    expect(store.productError()).toContain('another product');

    expect(store.updateProduct('cola', { ...newProduct, priceCents: 149 })).toBeTrue();
    expect(store.products()[0].id).toBe('cola');
    expect(store.products()[0].name).toBe('Biscuits');
    expect(store.productError()).toBeNull();
  });

  it('rejects updates and deletion of a missing product without changing inventory', () => {
    const inventory = store.products();
    expect(store.updateProduct('missing', newProduct)).toBeFalse();
    expect(store.deleteProduct('missing')).toBeFalse();
    expect(store.products()).toBe(inventory);
    expect(store.productError()).toBe('This product no longer exists.');
    store.clearProductError();
    expect(store.productError()).toBeNull();
  });

  function expectManagementBlocked(): void {
    const inventory = store.products();
    expect(store.canManageProducts()).toBeFalse();
    expect(store.addProduct(newProduct)).toBeFalse();
    expect(store.updateProduct('cola', newProduct)).toBeFalse();
    expect(store.deleteProduct('cola')).toBeFalse();
    expect(store.products()).toBe(inventory);
    expect(store.productError()).toBeTruthy();
  }

  it('blocks every mutation before and during payment, then permits changes after cancellation', () => {
    store.selectProduct('cola');
    expectManagementBlocked();

    store.insertCoin(100);
    expectManagementBlocked();
    expect(store.creditCents()).toBe(100);
    expect(store.selectedProductId()).toBe('cola');
    store.cancelPurchase();

    expect(store.canManageProducts()).toBeTrue();
    expect(store.addProduct(newProduct)).toBeTrue();
    expect(store.productError()).toBeNull();
    expect(store.lastTransaction()?.returnedCents).toBe(100);
  });

  it('blocks every mutation during loading and after failure until a successful retry', () => {
    const response = new Subject<IProduct[]>();
    productsService.getProducts.and.returnValue(response);
    store.loadProducts();
    expectManagementBlocked();

    response.error(new Error('API unavailable'));
    expect(store.isLoading()).toBeFalse();
    expectManagementBlocked();

    productsService.getProducts.and.returnValue(of(apiProducts));
    store.loadProducts();
    expect(store.canManageProducts()).toBeTrue();
    expect(store.addProduct(newProduct)).toBeTrue();
  });

  it('makes newly created inventory available to the purchase flow', () => {
    store.addProduct({ ...newProduct, priceCents: 200, quantity: 1 });
    const product = store.products()[2];
    store.selectProduct(product.id);
    store.insertCoin(200);

    expect(store.products()[2].quantity).toBe(0);
    expect(store.lastTransaction()?.kind).toBe('purchase');
    expect(store.canManageProducts()).toBeTrue();
    expect(productsService.getProducts).toHaveBeenCalledTimes(1);
  });
});
