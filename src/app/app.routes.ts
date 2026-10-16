import { Routes } from '@angular/router';
import { VendingMachineComponent } from './pages/vending-machine/vending-machine.component';

export const routes: Routes = [
  { path: '', component: VendingMachineComponent, pathMatch: 'full', title: 'Vending machine' },
  {
    path: 'manage-products',
    loadComponent: () => import('./pages/manage-products/manage-products.component')
      .then(module => module.ManageProductsComponent),
    title: 'Manage products | Vending machine',
  },
  { path: '**', redirectTo: '' },
];
