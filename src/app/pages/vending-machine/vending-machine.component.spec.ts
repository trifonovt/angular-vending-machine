import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { VendingMachineComponent } from './vending-machine.component';
import { AppStore } from '../../store/app-store';
import { IProduct } from '../../models/IProduct';
import { ProductsService } from '../../services/products.service';

describe('VendingMachineComponent', () => {
  let fixture: ComponentFixture<VendingMachineComponent>;
  let element: HTMLElement;
  let productsService: jasmine.SpyObj<ProductsService>;
  let products: IProduct[];

  function button(selector: string): HTMLButtonElement {
    const result = element.querySelector<HTMLButtonElement>(selector);
    if (!result) {
      throw new Error(`Missing button: ${selector}`);
    }
    return result;
  }

  function click(selector: string): void {
    button(selector).click();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    products = [
      { id: '1', name: 'Coke', priceCents: 199, quantity: 2, category: 'drink' },
      { id: '2', name: 'Chips', priceCents: 219, quantity: 1, category: 'snack' },
      { id: '3', name: 'Water', priceCents: 99, quantity: 0, category: 'drink' },
    ];
    productsService = jasmine.createSpyObj<ProductsService>('ProductsService', ['getProducts']);
    productsService.getProducts.and.returnValue(of(products));

    await TestBed.configureTestingModule({
      imports: [VendingMachineComponent],
      providers: [provideRouter([]), { provide: ProductsService, useValue: productsService }],
    }).compileComponents();

    fixture = TestBed.createComponent(VendingMachineComponent);
    element = fixture.nativeElement;
  });

  it('renders product names, prices and stock without loading inventory itself', () => {
    TestBed.inject(AppStore).loadProducts();

    fixture.detectChanges();
    fixture.detectChanges();

    expect(productsService.getProducts).toHaveBeenCalledTimes(1);
    expect(Array.from(element.querySelectorAll('.product-name'), item => item.textContent?.trim()))
      .toEqual(['Coke', 'Chips', 'Water']);
    expect(button('[data-product-id="1"]').textContent).toContain('€1.99');
    expect(button('[data-product-id="1"]').textContent).toContain('2 available');
    expect(button('[data-product-id="3"]').disabled).toBeTrue();
    expect(button('[data-product-id="3"]').textContent).toContain('Sold out');
  });

  it('enables coins after selection and locks other products until cancellation', () => {
    TestBed.inject(AppStore).loadProducts();
    fixture.detectChanges();
    expect(button('[data-coin-cents="100"]').disabled).toBeTrue();

    click('[data-product-id="1"]');

    expect(button('[data-product-id="1"]').getAttribute('aria-pressed')).toBe('true');
    expect(button('[data-product-id="2"]').disabled).toBeTrue();
    expect(button('[data-coin-cents="100"]').disabled).toBeFalse();

    click('.cancel');

    expect(button('[data-product-id="2"]').disabled).toBeFalse();
    expect(button('[data-coin-cents="100"]').disabled).toBeTrue();
  });

  it('shows payment progress, dispenses automatically and renders change coins', () => {
    TestBed.inject(AppStore).loadProducts();
    fixture.detectChanges();
    click('[data-product-id="1"]');
    click('[data-coin-cents="100"]');

    expect(element.querySelector('.credit-value')?.textContent).toContain('€1.00');
    expect(element.querySelector('.amount-due')?.textContent).toContain('€0.99');
    expect(element.querySelector('.receipt')).toBeNull();

    click('[data-coin-cents="100"]');

    expect(button('[data-product-id="1"]').textContent).toContain('1 available');
    expect(element.querySelector('.receipt')?.textContent).toContain('Enjoy your Coke!');
    expect(element.querySelector('.receipt')?.textContent).toContain('Change: €0.01');
    expect(element.querySelector('.returned-coins')?.textContent).toContain('€0.01');
    expect(element.querySelector('.credit-value')?.textContent).toContain('€0.00');
    expect(button('[data-coin-cents="100"]').disabled).toBeTrue();

    click('[data-product-id="2"]');
    expect(element.querySelector('.receipt')).toBeNull();
  });

  it('returns inserted denominations on cancellation without reducing stock', () => {
    TestBed.inject(AppStore).loadProducts();
    fixture.detectChanges();
    click('[data-product-id="1"]');
    click('[data-coin-cents="50"]');
    click('[data-coin-cents="20"]');
    click('.cancel');

    expect(element.querySelector('.receipt')?.textContent).toContain('Purchase cancelled');
    expect(element.querySelector('.receipt')?.textContent).toContain('Refund: €0.70');
    expect(Array.from(element.querySelectorAll('.returned-coins span'), coin => coin.textContent?.trim()))
      .toEqual(['€0.50', '€0.20']);
    expect(button('[data-product-id="1"]').textContent).toContain('2 available');
    expect(button('.cancel').disabled).toBeTrue();
  });

  it('shows the loading message until the product request completes', () => {
    const response = new Subject<IProduct[]>();
    productsService.getProducts.and.returnValue(response);
    TestBed.inject(AppStore).loadProducts();

    fixture.detectChanges();
    expect(element.textContent).toContain('Loading products...');

    response.next(products);
    response.complete();
    fixture.detectChanges();

    expect(element.textContent).not.toContain('Loading products...');
    expect(element.querySelectorAll('.product').length).toBe(3);
  });

  it('shows a request error and allows a successful retry', () => {
    productsService.getProducts.and.returnValue(throwError(() => new Error('Products unavailable')));
    TestBed.inject(AppStore).loadProducts();
    fixture.detectChanges();

    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Products unavailable');
    expect(element.textContent).not.toContain('Loading products...');

    productsService.getProducts.and.returnValue(of(products));
    click('.error button');

    expect(element.querySelector('[role="alert"]')).toBeNull();
    expect(element.querySelectorAll('.product').length).toBe(3);
  });

  it('shows an empty inventory without enabling coins', () => {
    productsService.getProducts.and.returnValue(of([]));
    TestBed.inject(AppStore).loadProducts();
    fixture.detectChanges();

    expect(element.textContent).toContain('No products available.');
    expect(element.querySelectorAll('.product').length).toBe(0);
    expect(button('[data-coin-cents="100"]').disabled).toBeTrue();
  });
});
