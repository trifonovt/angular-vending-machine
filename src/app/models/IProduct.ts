export interface IProduct {
    id: string;
    name: string;
    priceCents: number;
    quantity: number;
    category: string;
}

export type ProductInput = Omit<IProduct, 'id'>;
