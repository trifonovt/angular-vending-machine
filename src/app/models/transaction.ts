export type TransactionResult =
  | {
      kind: 'purchase';
      productName: string;
      priceCents: number;
      paidCents: number;
      returnedCents: number;
      returnedCoins: number[];
    }
  | {
      kind: 'refund';
      returnedCents: number;
      returnedCoins: number[];
    };
