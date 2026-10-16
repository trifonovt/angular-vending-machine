import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AppComponent } from './app.component';
import { routes } from './app.routes';
import { IProduct } from './models/IProduct';
import { ProductsService } from './services/products.service';
import { AppStore } from './store/app-store';

// Use the actual routes and root shell so destroying a page cannot hide a reload bug.
describe('AppComponent routing', () => {
  let fixture: ComponentFixture<AppComponent>;
  let element: HTMLElement;
  let router: Router;
  let store: InstanceType<typeof AppStore>;
  let productsService: jasmine.SpyObj<ProductsService>;

  async function navigate(url: string): Promise<void> {
    await router.navigateByUrl(url);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    const products: IProduct[] = [
      { id: '1', name: 'Coke', priceCents: 199, quantity: 2, category: 'drink' },
      { id: '2', name: 'Chips', priceCents: 219, quantity: 1, category: 'snack' },
    ];
    productsService = jasmine.createSpyObj<ProductsService>('ProductsService', ['getProducts']);
    productsService.getProducts.and.returnValue(of(products));

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter(routes), { provide: ProductsService, useValue: productsService }],
    }).compileComponents();

    router = TestBed.inject(Router);
    store = TestBed.inject(AppStore);
    fixture = TestBed.createComponent(AppComponent);
    element = fixture.nativeElement;
  });

  it('opens management from the title link and keeps the initial inventory request to one', async () => {
    expect(productsService.getProducts).not.toHaveBeenCalled();
    fixture.detectChanges();
    await navigate('/');

    const link = element.querySelector<HTMLAnchorElement>('header a.manage');
    expect(link?.textContent).toContain('Manage Products');
    link!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(router.url).toBe('/manage-products');
    expect(element.querySelector('app-manage-products')).not.toBeNull();
    expect(element.querySelector('app-vending-machine')).toBeNull();

    await navigate('/');
    expect(element.querySelector('app-vending-machine')).not.toBeNull();
    expect(productsService.getProducts).toHaveBeenCalledTimes(1);
  });

  it('loads and displays inventory when management is the first page opened', async () => {
    fixture.detectChanges();
    await navigate('/manage-products');

    expect(element.querySelector('app-manage-products')).not.toBeNull();
    expect(element.querySelector('table')?.textContent).toContain('Coke');
    expect(element.querySelector('table')?.textContent).toContain('Chips');
    expect(productsService.getProducts).toHaveBeenCalledTimes(1);
  });

  it('preserves edited inventory, product selection and inserted coins when changing pages', async () => {
    fixture.detectChanges();
    await navigate('/manage-products');
    expect(store.updateProduct('1', {
      name: 'Cherry Coke', priceCents: 249, quantity: 8, category: 'drink',
    })).toBeTrue();

    await navigate('/');
    store.selectProduct('1');
    store.insertCoin(50);

    await navigate('/manage-products');
    expect(store.selectedProductId()).toBe('1');
    expect(store.insertedCoins()).toEqual([50]);

    await navigate('/');
    expect(element.querySelector('[data-product-id="1"]')?.textContent).toContain('8 available');
    expect(element.querySelector('[data-product-id="1"]')?.textContent).toContain('Cherry Coke');
    expect(element.querySelector('[data-product-id="1"]')?.textContent).toContain('€2.49');
    expect(element.querySelector('.credit-value')?.textContent).toContain('€0.50');
    expect(store.selectedProductId()).toBe('1');
    expect(productsService.getProducts).toHaveBeenCalledTimes(1);
  });
});
