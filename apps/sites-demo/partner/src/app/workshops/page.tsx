import { events, offices } from '../../lib/hagen';

export const metadata = {
    title: 'Workshops',
};

export default async function WorkshopsPage() {
    const [workshops, shops] = await Promise.all([events(), offices()]);
    return (
        <main>
            <p className="eyebrow">Workshops</p>
            <h1>What the day holds</h1>
            <p className="lede">Hagen&apos;s staff run every workshop, in the shop the trip starts from.</p>
            <ul className="list">
                {workshops.map((workshop) => (
                    <li key={workshop.id}>
                        <h2>{workshop.title}</h2>
                        <p className="detail">
                            {workshop.date}, {workshop.time}, {shops.find((shop) => shop.id === workshop.office)?.name ?? 'Hagen UK'}
                        </p>
                        <p>{workshop.summary}</p>
                        {workshop.price === undefined ? null : <p className="detail">{workshop.price}</p>}
                    </li>
                ))}
            </ul>
        </main>
    );
}
