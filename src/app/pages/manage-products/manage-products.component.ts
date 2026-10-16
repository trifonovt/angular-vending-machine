import { CurrencyPipe } from '@angular/common';
import { afterNextRender, ChangeDetectionStrategy, Component, ElementRef, inject, Injector, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IProduct, ProductInput } from '../../models/IProduct';
import { AppStore } from '../../store/app-store';

@Component({
  selector: 'app-manage-products',
  standalone: true,
  imports: [CurrencyPipe, ReactiveFormsModule, RouterLink],
  templateUrl: './manage-products.component.html',
  styleUrl: './manage-products.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManageProductsComponent {
  readonly store = inject(AppStore);
  private readonly injector = inject(Injector);
  private readonly formBuilder = inject(FormBuilder);
  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');
  private readonly addButton = viewChild<ElementRef<HTMLButtonElement>>('addButton');
  private readonly errorMessage = viewChild<ElementRef<HTMLElement>>('errorMessage');

  readonly editorOpen = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly pendingDelete = signal<IProduct | null>(null);
  readonly status = signal('');
  readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.pattern(/\S/)]],
    category: ['', [Validators.required, Validators.pattern(/\S/)]],
    price: ['', [Validators.required, Validators.pattern(/^\d+(?:\.\d{1,2})?$/), Validators.min(0.01)]],
    quantity: [0, [Validators.required, Validators.min(0), Validators.max(15), Validators.pattern(/^\d+$/)]],
  });

  add(): void {
    if (!this.store.canManageProducts()) return;
    this.resetMessages();
    this.editingId.set(null);
    this.form.reset({ name: '', category: '', price: '', quantity: 0 });
    this.editorOpen.set(true);
    this.focusName();
  }

  edit(product: IProduct): void {
    if (!this.store.canManageProducts()) return;
    this.resetMessages();
    this.editingId.set(product.id);
    this.form.reset({
      name: product.name,
      category: product.category,
      price: (product.priceCents / 100).toFixed(2),
      quantity: product.quantity,
    });
    this.editorOpen.set(true);
    this.focusName();
  }

  cancelEdit(): void {
    this.editorOpen.set(false);
    this.editingId.set(null);
    this.store.clearProductError();
    this.focusAdd();
  }

  save(): void {
    if (!this.store.canManageProducts()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      afterNextRender(() => {
        const firstInvalid = this.nameInput()?.nativeElement.form?.querySelector<HTMLInputElement>('input.ng-invalid');
        firstInvalid?.focus();
      }, { injector: this.injector });
      return;
    }

    const value = this.form.getRawValue();
    const [euros, cents = ''] = value.price.split('.');
    const input: ProductInput = {
      name: value.name.trim(),
      category: value.category.trim(),
      // Parse the two decimal parts separately to avoid floating-point rounding.
      priceCents: Number(euros) * 100 + Number(cents.padEnd(2, '0')),
      quantity: value.quantity,
    };
    const id = this.editingId();
    const saved = id === null ? this.store.addProduct(input) : this.store.updateProduct(id, input);
    if (!saved) {
      this.focusError();
      return;
    }

    this.status.set(`${input.name} ${id === null ? 'added' : 'updated'}.`);
    this.editorOpen.set(false);
    this.editingId.set(null);
    this.focusAdd();
  }

  askDelete(product: IProduct): void {
    if (!this.store.canManageProducts()) return;
    this.resetMessages();
    this.editorOpen.set(false);
    this.pendingDelete.set(product);
  }

  cancelDelete(): void {
    this.pendingDelete.set(null);
    this.store.clearProductError();
    this.focusAdd();
  }

  confirmDelete(): void {
    const product = this.pendingDelete();
    if (!product || !this.store.canManageProducts()) return;
    if (!this.store.deleteProduct(product.id)) {
      this.focusError();
      return;
    }
    this.pendingDelete.set(null);
    this.status.set(`${product.name} deleted.`);
    this.focusAdd();
  }

  invalid(field: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[field];
    return control.touched && control.invalid;
  }

  private resetMessages(): void {
    this.status.set('');
    this.pendingDelete.set(null);
    this.store.clearProductError();
  }

  private focusName(): void {
    afterNextRender(() => this.nameInput()?.nativeElement.focus(), { injector: this.injector });
  }

  private focusAdd(): void {
    afterNextRender(() => this.addButton()?.nativeElement.focus(), { injector: this.injector });
  }

  private focusError(): void {
    afterNextRender(() => this.errorMessage()?.nativeElement.focus(), { injector: this.injector });
  }
}
