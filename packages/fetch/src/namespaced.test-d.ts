import { expectTypeOf, test } from 'vitest';
import type { API } from './generated/api.js';

test('a dotted model is declared inside its namespace', () => {
    expectTypeOf<API.Billing.InvoiceStatus>().toEqualTypeOf<'draft' | 'sent' | 'paid'>();
    expectTypeOf<API.Billing.InvoiceLine>().toEqualTypeOf<{
        description: string;
        amount: number;
    }>();
});

test('a model in the same namespace is referenced by its dotted name', () => {
    expectTypeOf<API.Billing.Invoice['status']>().toEqualTypeOf<API.Billing.InvoiceStatus>();
    expectTypeOf<API.Billing.Invoice['lines']>().toEqualTypeOf<Array<API.Billing.InvoiceLine>>();
    expectTypeOf<API.Billing.Invoice['billing']>().toEqualTypeOf<API.Billing.Center>();
});

test('a top-level model keeps its own type where the namespace declares one of the same name', () => {
    expectTypeOf<API.Billing.Invoice['center']>().toEqualTypeOf<API.Center>();
    expectTypeOf<API.Billing.Invoice['center']>().not.toEqualTypeOf<API.Billing.Center>();
});

test('a route returns the dotted model', () => {
    type Found = Extract<
        API.BillingGetInvoice.Result,
        {
            status: 200;
        }
    >;
    expectTypeOf<Found['body']>().toEqualTypeOf<API.Billing.Invoice>();
});
