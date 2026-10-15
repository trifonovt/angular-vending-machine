# AngularVendingMachine

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 18.2.3.

## Purchase flow example

1. Select an in-stock product. Other products stay locked until the transaction ends.
2. Insert coins using the coin buttons. The display shows your credit and the amount still due.
3. Once enough money is inserted, the machine automatically dispenses one product and returns change. The receipt lists the returned coins.
4. To stop before payment is complete, choose **Cancel and refund**. This returns the exact inserted coins without changing stock.

For example, select Coke (€1.99) and insert €2: stock decreases by one and the machine returns a 1c coin. To try cancellation, select Coke, insert €1, then cancel.

Accepted coins: **1c, 2c, 5c, 10c, 20c, 50c, €1, and €2**. Other denominations are rejected by the store. Money is stored as integer cents. This example assumes an unlimited supply of change coins and a maximum stock of 15 units per product.

The purchase rules live in [`app-store.ts`](src/app/store/app-store.ts): `selectProduct`, `insertCoin`, and `cancelPurchase`. Computed signals derive the selected product, credit, and remaining amount. The component displays these values and calls the actions. Changes stay in application memory and are not sent to the mock API.

## Development server

Use a compatible Node version (Node 22.22.3 or newer in the 22.x series), then run `npm install` in this directory. Start the mock API in one terminal:

```bash
npx json-server ../db.json --port 3000
```

In another terminal in this directory, run `npm start` and open `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory.

## Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

For a single run with Chrome installed, use `npm test -- --watch=false --browsers=ChromeHeadless`. Tests use a mock API service, so the JSON server is not required.

## Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via a platform of your choice. To use this command, you need to first add a package that implements end-to-end testing capabilities.

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
