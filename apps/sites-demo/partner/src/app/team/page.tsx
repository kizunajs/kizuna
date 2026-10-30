import { employees, offices } from '../../lib/hagen';

export const metadata = {
    title: 'Your hosts',
};

export default async function HostsPage() {
    const [shops, people] = await Promise.all([offices(), employees()]);
    return (
        <main>
            <p className="eyebrow">Your hosts</p>
            <h1>The people at Hagen</h1>
            <p className="lede">Hagen&apos;s staff run every workshop, in the shop they work in.</p>
            <ul className="list">
                {shops.map((shop) => (
                    <li key={shop.id}>
                        <h2>{shop.city}</h2>
                        <ul className="people">
                            {people
                                .filter((person) => person.office === shop.id)
                                .map((person) => (
                                    <li key={person.id}>
                                        <h3>{person.name}</h3>
                                        <p className="detail">{person.role}</p>
                                        {person.bio === undefined ? null : <p>{person.bio}</p>}
                                    </li>
                                ))}
                        </ul>
                    </li>
                ))}
            </ul>
        </main>
    );
}
