import { offices } from '../lib/hagen';

export default async function DayTripsPage() {
    const shops = await offices();
    return (
        <main>
            <p className="eyebrow">Day trips with Hagen UK</p>
            <h1>A morning among the plants</h1>
            <p className="lede">
                Each trip starts at one of Hagen&apos;s shops, with a workshop on repotting, pruning or wreaths. Call the shop to book a
                place.
            </p>
            <ul className="list">
                {shops.map((shop) => (
                    <li key={shop.id}>
                        <h2>{shop.name}</h2>
                        <p className="detail">{shop.address}</p>
                        {shop.openingHours === undefined ? null : <p className="detail">{shop.openingHours}</p>}
                        <p>
                            <a href={`tel:${shop.phone.replaceAll(' ', '')}`}>{shop.phone}</a>
                        </p>
                    </li>
                ))}
            </ul>
        </main>
    );
}
