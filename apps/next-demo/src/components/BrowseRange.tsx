'use client';

import { useEffect, useState } from 'react';

interface Product {
    id: string;
    name: string;
}

/**
 * The whole range under the featured products, fetched in the browser and
 * opened on a click: the part of a page only its client code draws.
 */
export function BrowseRange() {
    const [products, setProducts] = useState<Product[] | undefined>();
    const [open, setOpen] = useState(false);
    useEffect(() => {
        void fetch('/api/products')
            .then((response) => response.json() as Promise<{ products: Product[] }>)
            .then((body) => setProducts(body.products));
    }, []);
    return (
        <section
            style={{
                marginTop: '1.5rem',
            }}>
            <button
                type="button"
                onClick={() => setOpen(!open)}
                style={{
                    padding: '0.5rem 0.9rem',
                    border: '1px solid #ccc',
                    borderRadius: '0.4rem',
                    background: '#fff',
                    cursor: 'pointer',
                }}>
                {products === undefined ? 'Loading the range' : `${open ? 'Hide' : 'Browse'} all ${products.length} products`}
            </button>
            {open && products !== undefined ? (
                <ul data-testid="range">
                    {products.map((product) => (
                        <li key={product.id}>{product.name}</li>
                    ))}
                </ul>
            ) : null}
        </section>
    );
}
