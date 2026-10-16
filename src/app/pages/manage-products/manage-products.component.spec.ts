import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { IProduct } from '../../models/IProduct';
import { ProductsService } from '../../services/products.service';
import { AppStore } from '../../store/app-store';
import { ManageProductsComponent } from './manage-products.component';

describe('ManageProductsComponent', () => {
  let fixture: ComponentFixture<ManageProductsComponent>;
  let element: HTMLElement;
  let store: InstanceType<typeof AppStore>;
  let productsService: jasmine.SpyObj<ProductsService>;
  let products: IProduct[];

  function render(): void {
    store.loadProducts();
    fixture.detectChanges();
  }

  function click(selector: string): void {
    const button = element.querySelector<HTMLButtonElement>(selector);
    if (!button) throw new Error(`Missing button: ${selector}`);
    button.click();
    fixture.detectChanges();
  }

  function fill(name: string, value: string): void {
    const input = element.querySelector<HTMLInputElement>(`#product-${name}`);
    if (!input) throw new Error(`Missing input: ${name}`);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function submit(): void {
    const form = element.querySelector('form');
    if (!form) throw new Error('Missing product form');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    products = [
      { id: '1', name: 'Coke', priceCents: 199, quantity: 2, category: 'drink' },
      { id: '2', name: 'Chips', priceCents: 219, quantity: 1, category: 'snack' },
    ];
    productsService = jasmine.createSpyObj<ProductsService>('ProductsService', ['getProducts']);
    productsService.getProducts.and.returnValue(of(products));
    await TestBed.configureTestingModule({
      imports: [ManageProductsComponent],
      providers: [provideRouter([]), { provide: ProductsService, useValue: productsService }],
    }).compileComponents();
    fixture = TestBed.createComponent(ManageProductsComponent);
    element = fixture.nativeElement;
    store = TestBed.inject(AppStore);
  });

  it('displays inventory already in the store without making its own request', () => {
    render();
    fixture.detectChanges();

    expect(productsService.getProducts).toHaveBeenCalledTimes(1);
    expect(element.querySelectorAll('tbody tr').length).toBe(2);
    expect(element.querySelector('[data-product-id="1"]')?.textContent).toContain('€1.99');
    expect(element.querySelector('[data-product-id="1"]')?.textContent).toContain('2 / 15');
    expect(element.querySelector('header a')?.getAttribute('href')).toBe('/');
  });

  it('adds a product using trimmed fields, integer cents and a numeric quantity', () => {
    render();
    click('main > button');
    fill('name', '  Tea  ');
    fill('category', '  drink  ');
    fill('price', '1.05');
    fill('quantity', '15');
    submit();

    expect(store.products().length).toBe(3);
    expect(store.products()[2]).toEqual(jasmine.objectContaining({
      name: 'Tea', category: 'drink', priceCents: 105, quantity: 15,
    }));
    expect(element.querySelector('form')).toBeNull();
    expect(element.querySelector('.success')?.textContent).toContain('Tea added.');
    expect(productsService.getProducts).toHaveBeenCalledTimes(1);
  });

  it('prefills edits and saves changes to the same product', () => {
    render();
    click('[aria-label="Edit Coke"]');
    expect(element.querySelector<HTMLInputElement>('#product-price')?.value).toBe('1.99');
    fill('name', 'Cola');
    fill('price', '2.05');
    fill('quantity', '0');
    submit();

    expect(store.products().length).toBe(2);
    expect(store.products()[0]).toEqual({ id: '1', name: 'Cola', priceCents: 205, quantity: 0, category: 'drink' });
    expect(element.querySelector('.success')?.textContent).toContain('Cola updated.');
  });

  it('discards a cancelled edit', () => {
    render();
    click('[aria-label="Edit Coke"]');
    fill('name', 'Unwanted edit');
    click('form button[type="button"]');

    expect(element.querySelector('form')).toBeNull();
    expect(store.products()).toEqual(products);
    click('[aria-label="Edit Coke"]');
    expect(element.querySelector<HTMLInputElement>('#product-name')?.value).toBe('Coke');
  });

  it('rejects blank names, fractional stock and prices with more than two decimals', () => {
    render();
    click('main > button');
    fill('name', '   ');
    fill('category', 'drink');
    fill('price', '1.005');
    fill('quantity', '1.5');
    submit();

    expect(element.querySelector('#name-error')).not.toBeNull();
    expect(element.querySelector('#price-error')).not.toBeNull();
    expect(element.querySelector('#quantity-error')).not.toBeNull();
    expect(store.products()).toEqual(products);

    fill('quantity', '16');
    submit();
    expect(element.querySelector('#quantity-error')).not.toBeNull();
  });

  it('shows the store validation error when another product already has that price', () => {
    render();
    click('[aria-label="Edit Coke"]');
    fill('price', '2.19');
    submit();

    expect(store.productError()).toBeTruthy();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(store.productError()!);
    expect(element.querySelector('form')).not.toBeNull();
    expect(store.products()).toEqual(products);

    fill('price', '1.99');
    submit();
    expect(element.querySelector('[role="alert"]')).toBeNull();
    expect(element.querySelector('form')).toBeNull();
  });

  it('requires confirmation to delete and lets the user keep the product', () => {
    render();
    click('[aria-label="Delete Coke"]');
    expect(element.querySelector('.confirmation')?.textContent).toContain('Coke');
    expect(store.products()).toEqual(products);
    click('.confirmation button:last-child');
    expect(element.querySelector('.confirmation')).toBeNull();
    expect(store.products()).toEqual(products);

    click('[aria-label="Delete Coke"]');
    click('.confirmation button:first-child');
    expect(store.products().map(product => product.id)).toEqual(['2']);
    expect(element.querySelector('[data-product-id="1"]')).toBeNull();
    expect(element.querySelector('.success')?.textContent).toContain('Coke deleted.');
  });

  it('locks editing during a purchase while preserving the selection and inserted coins', () => {
    render();
    store.selectProduct('1');
    store.insertCoin(100);
    fixture.detectChanges();

    expect(element.querySelector('.notice')?.textContent).toContain('Finish or cancel');
    expect(element.querySelector<HTMLButtonElement>('main > button')?.disabled).toBeTrue();
    expect(element.querySelector<HTMLButtonElement>('[aria-label="Edit Coke"]')?.disabled).toBeTrue();
    expect(element.querySelector<HTMLButtonElement>('[aria-label="Delete Coke"]')?.disabled).toBeTrue();
    click('main > button');
    expect(element.querySelector('form')).toBeNull();
    expect(store.selectedProductId()).toBe('1');
    expect(store.creditCents()).toBe(100);
  });

  it('shows loading, retries an initial failure, and handles an empty inventory', () => {
    const response = new Subject<IProduct[]>();
    productsService.getProducts.and.returnValue(response);
    render();
    expect(element.textContent).toContain('Loading products...');
    expect(element.querySelector<HTMLButtonElement>('main > button')?.disabled).toBeTrue();

    response.error(new Error('Inventory unavailable'));
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Inventory unavailable');
    expect(element.querySelector<HTMLButtonElement>('main > button')?.disabled).toBeTrue();

    productsService.getProducts.and.returnValue(of([]));
    click('.error button');
    expect(element.querySelector('[role="alert"]')).toBeNull();
    expect(element.querySelector('.empty')?.textContent).toContain('No products yet.');
    expect(element.querySelector<HTMLButtonElement>('main > button')?.disabled).toBeFalse();
    expect(productsService.getProducts).toHaveBeenCalledTimes(2);
  });
});
