# Angular Vending Machine

A responsive vending machine built with Angular 22, NgRx Signal Store, and a mock API served by JSON Server.

## Build and start

Use Node 22.22.3 or newer in the 22.x series. From the project directory, install dependencies:

```bash
npm ci
```

Start the mock API in one terminal. Allow `npx` to install JSON Server if prompted:

```bash
npx json-server db.json --port 3000
```

In another terminal in the same directory:

```bash
npm start
```

Open `http://localhost:4200/`. The initial inventory is fetched from `http://localhost:3000/products`. Keep both servers running while using the application.

For a production build, run `npm run build`. The browser files are generated in `dist/angular-vending-machine/browser`. A production web server must serve `index.html` for application routes such as `/manage-products`; the mock API must also remain available.

## Purchase flow example

1. Select an in-stock product. Other products stay locked until the transaction ends.
2. Insert coins using the coin buttons. The display shows your credit and the amount still due.
3. Once enough money is inserted, the machine automatically dispenses one product and returns change. The receipt lists the returned coins.
4. To stop before payment is complete, choose **Cancel and refund**. This returns the exact inserted coins without changing stock.

For example, select Coke (€1.99) and insert €2: stock decreases by one and the machine returns a 1c coin. To try cancellation, select Coke, insert €1, then cancel.

Accepted coins: **1c, 2c, 5c, 10c, 20c, 50c, €1, and €2**. Other denominations are rejected by the store. Money is stored as integer cents. This example assumes an unlimited supply of change coins and a maximum stock of 15 units per product.

## Manage products

Choose **Manage Products** beside the vending machine title to open `/manage-products`.

- **Read:** the table shows each product's name, category, price, and stock.
- **Create:** choose **Add product**, fill in the form, and save.
- **Update:** choose **Edit** in a product's row, change its details, and save. Cancelling discards the form changes.
- **Delete:** choose **Delete** in a row and confirm the named product's removal, or cancel.

Names and categories are required. Prices are entered in euros with at most two decimal places and must be positive. Each product has a different price. Quantities must be whole numbers from **0 to 15**; zero means sold out. The inventory limit applies to each product, not to the number of different products shown.

Finish or cancel an active purchase before changing inventory. You can visit the management page and return without losing your selected product or inserted coins.

All purchases and CRUD operations update application memory only. Navigation preserves those changes; refreshing the browser loads the original inventory from `db.json` again. The application never sends product changes to the mock API.

## Architecture

- [`app-store.ts`](src/app/store/app-store.ts) owns the inventory, purchase state, and business rules. `selectProduct`, `insertCoin`, and `cancelPurchase` handle vending; `addProduct`, `updateProduct`, and `deleteProduct` validate and update inventory. Computed signals derive the selected product, credit, remaining payment, and whether inventory can be edited.
- [`products.service.ts`](src/app/services/products.service.ts) performs the initial HTTP GET. There are no API write operations.
- The root component loads inventory once. The router switches between the vending and management pages, which share the root-provided store. Components handle presentation and form interaction, and call store actions for changes.
- Money is stored as integer cents to keep payment and change calculations exact. Change uses the accepted euro denominations, assuming an unlimited supply of coins.

## Tests

Run `npm test` for watch mode. For a single run with Chrome installed:

```bash
npm test -- --watch=false --browsers=ChromeHeadless
```

Tests cover the purchase and refund flows, inventory validation and CRUD, and navigation between pages. They use a mocked product service, so the JSON server is not required.
