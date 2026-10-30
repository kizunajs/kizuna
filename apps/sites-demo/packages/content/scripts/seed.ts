import { formatRef, type CmsService, type DocumentRef } from '@kizunajs/cms';

const AUTHOR = 'seed';

const offices = [
    {
        name: 'Hagen London',
        city: 'London',
        address: '14 Columbia Road, London E2 7RG',
        // TODO(sites): the UK's own number, +44 20 7946 0321, as its `perSite` value once `perSite` lands.
        phone: '+47 22 41 08 00',
        openingHours: 'Tuesday to Sunday, 9 to 17',
        order: 0,
    },
    {
        name: 'Hagen Oslo',
        city: 'Oslo',
        address: 'Markveien 38, 0554 Oslo',
        phone: '+47 22 41 08 00',
        order: 1,
    },
    {
        name: 'Hagen Bergen',
        city: 'Bergen',
        address: 'Vaskerelven 8, 5014 Bergen',
        phone: '+47 55 30 21 40',
        order: 2,
    },
];

const employees = [
    {
        office: 'Hagen Oslo',
        values: {
            name: 'Ingrid Solberg',
            role: 'Founder and buyer',
            bio: 'Ingrid opened the first Hagen on Grünerløkka in 2019, and still chooses every plant the three shops sell.',
            email: 'ingrid@hagen.example.com',
            order: 0,
        },
    },
    {
        office: 'Hagen Oslo',
        values: {
            name: 'Sara Lindqvist',
            role: 'Shop gardener',
            bio: 'Sara runs the Oslo shop floor and the courtyard beds behind it.',
            order: 1,
        },
    },
    {
        office: 'Hagen London',
        values: {
            name: 'Martin Hale',
            role: 'Head of plant care',
            bio: 'Martin answers the plant care desk for all three shops, and runs the London workshops.',
            email: 'martin@hagen.example.co.uk',
            order: 0,
        },
    },
    {
        office: 'Hagen London',
        values: {
            name: 'Eleanor Price',
            role: 'Shop manager',
            bio: 'Eleanor opened the Columbia Road shop in 2024, a few doors from the Sunday flower market.',
            email: 'eleanor@hagen.example.co.uk',
            order: 1,
        },
    },
    {
        office: 'Hagen Bergen',
        values: {
            name: 'Erlend Vik',
            role: 'Shop manager',
            bio: 'Erlend knows which plants forgive Bergen rain on the walk home, and which do not.',
            email: 'erlend@hagen.example.no',
            order: 0,
        },
    },
    {
        office: 'Hagen Bergen',
        values: {
            name: 'Sigrid Haugen',
            role: 'Plant doctor',
            bio: 'Sigrid makes house calls across Bergen for plants too big to carry in.',
            order: 1,
        },
    },
];

const events = [
    {
        title: 'Repotting without the mess',
        summary: 'Bring a plant that has outgrown its pot. Martin shows how to move it on, and you leave with it repotted.',
        date: '2026-11-14',
        time: '10:00 to 12:00',
        price: '£25',
    },
    {
        title: 'Houseplants through the winter',
        summary: 'Light, water and heating: an hour on keeping houseplants well from November to March, with questions after.',
        date: '2026-11-28',
        time: '18:30 to 19:30',
        price: 'Free',
    },
    {
        title: 'Wreath evening',
        summary: 'Make a wreath of spruce, eucalyptus and dried hydrangea to take home. Everything is provided, mulled apple included.',
        date: '2026-12-10',
        time: '18:00 to 20:30',
        price: '£45',
    },
];

const privacyPolicy = {
    heading: 'Privacy policy',
    updatedOn: '2026-10-01',
    body: `Hagen Group AS and its shops in the UK and Norway keep only what we need to answer you, deliver your order and run our workshops.

When you buy from us we keep your name, address and order for as long as the law asks us to keep receipts. When you write to us we keep the conversation for a year, so the plant care desk can see what we said last time.

We never sell what we know about you, and we share it only with the couriers who bring your plants and the payment provider who takes your card.

Write to privacy@hagen.example.com to see what we hold about you, or to ask us to delete it.`,
};

/**
 * Each site's pages, under the site they belong to.
 */
const pages: Array<{ site: string; name: string; values: Record<string, unknown> }> = [
    {
        site: 'group',
        name: 'frontPage',
        values: {
            heading: 'Three plant shops, one family',
            intro: 'Hagen started on Grünerløkka in Oslo in 2019. Today we run shops in Oslo, Bergen and London, buying from the same growers and sharing one plant care desk.',
        },
    },
    {
        site: 'group',
        name: 'aboutPage',
        values: {
            heading: 'About Hagen Group',
            body: `Hagen Group AS owns the Hagen shops in Norway and the UK. Each country runs its own shops and its own website, and the group looks after buying, plant care and the people behind them.

We buy from a handful of growers we visit every season, and every plant leaves with a care card. If it struggles anyway, the plant care desk answers the same day, whichever shop you bought it from.`,
        },
    },
    {
        site: 'uk',
        name: 'frontPage',
        values: {
            heading: 'Plants that stay with you, on Columbia Road',
            intro: 'Houseplants, ferns and trees from growers we know, a few doors from the Sunday flower market. Workshops most weekends.',
        },
    },
    {
        site: 'uk',
        name: 'eventsPage',
        values: {
            heading: 'Workshops at the London shop',
            intro: 'Small groups, an hour or two, and you take home what you make.',
        },
    },
    {
        site: 'norway',
        name: 'frontPage',
        values: {
            heading: 'Planter som blir hos deg',
            intro: 'Stueplanter, bregner og trær fra gartnere vi kjenner, i Oslo og Bergen. Levert neste dag i begge byene.',
        },
    },
];

/**
 * Fills in what the demo database is missing: the offices, the people, the
 * privacy policy, the UK's events and every site's pages. Content already
 * there is left alone, so an editor's changes survive a restart.
 */
export const seedContent = async (service: CmsService): Promise<void> => {
    const caller = service.caller({
        editor: {
            role: 'admin',
        },
    });

    // The apps' caches live in their own servers, so publishing goes to the store without invalidating anything.
    const publish = async (ref: DocumentRef): Promise<void> => {
        const state = await service.draftState(ref);
        if (!state.complete) throw new Error(`The seed for ${formatRef(ref)} is missing ${state.missing.join(', ')}.`);
        await service.store.publish(state.target.kind, state.target.key, AUTHOR, state.target.site);
    };

    const fill = async (ref: DocumentRef, values: Record<string, unknown>): Promise<void> => {
        if ((await service.document(ref)).row !== undefined) return;
        await service.update({
            ref,
            changes: values,
            caller,
            author: AUTHOR,
            summary: 'Seeded',
        });
        await publish(ref);
        console.log(`[demo] seeded ${formatRef(ref)}`);
    };

    if ((await service.editorItems('offices')).length === 0) {
        for (const office of offices) {
            const created = await service.createItem('offices', office, caller, AUTHOR);
            await publish(created.target.ref);
        }
        console.log(`[demo] seeded ${offices.length} offices`);
    }

    const officeItems = await service.editorItems('offices');
    const officeId = (name: string): string => {
        const found = officeItems.find((office) => office.label === name);
        if (found === undefined) throw new Error(`The seed has no office '${name}'.`);
        return found.id;
    };

    if ((await service.editorItems('employees')).length === 0) {
        for (const employee of employees) {
            const created = await service.createItem(
                'employees',
                {
                    ...employee.values,
                    office: officeId(employee.office),
                },
                caller,
                AUTHOR
            );
            await publish(created.target.ref);
        }
        console.log(`[demo] seeded ${employees.length} employees`);
    }

    if ((await service.editorItems('events', 'uk')).length === 0) {
        for (const event of events) {
            const created = await service.createItem(
                'events',
                {
                    ...event,
                    office: officeId('Hagen London'),
                },
                caller,
                AUTHOR,
                'uk'
            );
            await publish(created.target.ref);
        }
        console.log(`[demo] seeded ${events.length} UK events`);
    }

    await fill(
        {
            type: 'global',
            name: 'privacyPolicy',
        },
        privacyPolicy
    );

    for (const page of pages) {
        await fill(
            {
                type: 'page',
                name: page.name,
                site: page.site,
            },
            page.values
        );
    }
};
