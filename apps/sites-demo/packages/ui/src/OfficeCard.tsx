export interface Office {
    name: string;
    address: string;
    phone: string;
    openingHours?: string | undefined;
}

/**
 * One shop: where it is, and how to reach it.
 */
export function OfficeCard({ office }: { office: Office }) {
    return (
        <section>
            <h2>{office.name}</h2>
            <p>{office.address}</p>
            <p>
                <a href={`tel:${office.phone.replace(/\s/g, '')}`}>{office.phone}</a>
            </p>
            {office.openingHours === undefined ? null : <p>{office.openingHours}</p>}
        </section>
    );
}
