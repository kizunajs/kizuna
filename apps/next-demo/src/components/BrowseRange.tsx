'use client';

import { useEffect, useState } from 'react';
import styles from './BrowseRange.module.css';

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
        <div className={styles.range}>
            <button
                type="button"
                className={styles.toggle}
                onClick={() => setOpen(!open)}
                aria-expanded={open}
                disabled={products === undefined}>
                {products === undefined ? 'Loading the range' : `${open ? 'Hide' : 'Browse'} all ${products.length} products`}
            </button>
            {open && products !== undefined ? (
                <ul data-testid="range" className={styles.list}>
                    {products.map((product) => (
                        <li key={product.id}>{product.name}</li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
}
