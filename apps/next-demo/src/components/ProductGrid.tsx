import type { API } from '../lib/api-client.generated';

export function ProductGrid({ products }: { products: API.Product[] }) {
    return (
        <ul
            style={{
                listStyle: 'none',
                padding: 0,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(12rem, 1fr))',
                gap: '1rem',
            }}>
            {products.map((product) => (
                <li
                    key={product.id}
                    style={{
                        border: '1px solid #e5e5e5',
                        borderRadius: '0.5rem',
                        padding: '0.75rem',
                    }}>
                    <strong>{product.name}</strong>
                    <div
                        style={{
                            color: '#555',
                        }}>
                        {product.price} €
                    </div>
                </li>
            ))}
        </ul>
    );
}
