import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { formatRef, type CmsService, type DocumentRef } from '@kizunajs/cms';

const AUTHOR = 'seed';
const PHOTOS = join(process.cwd(), 'seed/photos');

const offices = [
    {
        name: 'Hagen London',
        city: 'London',
        address: '14 Columbia Road, London E2 7RG',
        phone: '+47 22 41 08 00',
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

/**
 * What the UK sets of its own on the London shop: the number its customers
 * call, and the opening hours only the UK lists.
 */
const londonOnTheUk = {
    phone: '+44 20 7946 0321',
    openingHours: 'Tuesday to Sunday, 9 to 17',
};

/**
 * Photos from Unsplash, free to use under the Unsplash License, the same ones
 * the single-site demo uses. The Oslo shop's photo is shared, and the wreath
 * evening's belongs to the UK's own library.
 */
const photos = {
    oslo: {
        file: 'fern-fronds.jpg',
        alt: 'Close up of fern fronds unfurled in the shade',
    },
    wreathEvening: {
        file: 'forest-trunks.jpg',
        alt: 'Tall spruce trunks above a green understorey',
    },
};

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

/**
 * The journal, with the sites each article shows on. Every article shows on
 * the group's site, which lists them all.
 */
const articles = [
    {
        title: 'Winter care for houseplants',
        summary: 'Less water, more light and no radiators: how to see a houseplant through the dark months.',
        body: `Most houseplants rest from November to February. Water when the top few centimetres of soil are dry, not on a schedule, and stop feeding until the days grow longer.

Move them as close to the window as they will go, and away from radiators, which dry the air and the leaves. A tray of wet gravel under the pot helps ferns and calatheas through the heating season.`,
        date: '2026-10-20',
        showsOn: ['uk', 'norway', 'group'],
    },
    {
        title: 'Columbia Road flower market',
        summary: 'Our London shop sits a few doors from the Sunday market. When to go, and what to bring home.',
        body: `The market runs every Sunday from eight until early afternoon. Come early for the pick of the stalls, or late for the bargains as the traders pack up.

Bring a bag with a flat bottom for pots, and drop in at the shop for a care card for whatever you found.`,
        date: '2026-09-14',
        showsOn: ['uk', 'group'],
    },
    {
        title: 'Juletrær i Oslo',
        summary: 'From the first Sunday of Advent we sell Christmas trees from Hedmarken in the courtyard on Grünerløkka.',
        body: `We fetch the trees from the grower the same week we sell them, so they keep their needles until New Year. Choose between Norway spruce, Serbian spruce and Nordmann fir.

We wrap the tree in netting and deliver it to your door in Oslo for 150 kroner.`,
        date: '2026-11-01',
        showsOn: ['norway', 'group'],
    },
    {
        title: 'Visiting the growers we buy from',
        summary: 'Every spring the buyers from all three shops visit the nurseries that grow our plants.',
        body: `We buy from a handful of growers in Norway, the Netherlands and Kent, and we visit each of them every season. We see how the plants are raised, and we choose next year's together.

It is why every Hagen plant comes with a care card written by the people who grew it.`,
        date: '2026-04-28',
        showsOn: ['group'],
    },
];

/**
 * The articles Hagen Norge shows, in Norwegian, by their English title.
 */
const articlesInNorwegian: Record<string, Record<string, unknown>> = {
    'Winter care for houseplants': {
        title: 'Vinterstell av stueplanter',
        summary: 'Mindre vann, mer lys og ingen ovner: slik kommer stueplantene gjennom de mørke månedene.',
        body: `De fleste stueplanter hviler fra november til februar. Vann når de øverste centimeterne av jorda er tørre, ikke etter timeplan, og vent med gjødsel til dagene blir lengre.

Flytt dem så nær vinduet de tåler, og bort fra ovnene, som tørker lufta og bladene. Et fat med våt grus under potta hjelper bregner og kalateaer gjennom fyringssesongen.`,
    },
    'Juletrær i Oslo': {
        title: 'Juletrær i Oslo',
        summary: 'Fra første søndag i advent selger vi juletrær fra Hedmarken i bakgården på Grünerløkka.',
        body: `Vi henter trærne hos gartneren samme uke som vi selger dem, så de holder nålene til nyttår. Velg mellom vanlig gran, serbisk gran og edelgran.

Vi pakker treet i nett og leverer det på døren i Oslo for 150 kroner.`,
    },
};

const privacyPolicy = {
    heading: 'Privacy policy',
    updatedOn: '2026-10-01',
    body: `Hagen Group AS and its shops in the UK and Norway keep only what we need to answer you, deliver your order and run our workshops.

When you buy from us we keep your name, address and order for as long as the law asks us to keep receipts. When you write to us we keep the conversation for a year, so the plant care desk can see what we said last time.

We never sell what we know about you, and we share it only with the couriers who bring your plants and the payment provider who takes your card.

Write to privacy@hagen.example.com to see what we hold about you, or to ask us to delete it.`,
};

/**
 * The privacy policy in Norwegian, which Hagen Norge shows at its root.
 */
const privacyPolicyInNorwegian = {
    heading: 'Personvern',
    body: `Hagen Group AS og butikkene i Storbritannia og Norge tar bare vare på det vi trenger for å svare deg, levere bestillingen din og holde kursene våre.

Når du handler hos oss, tar vi vare på navn, adresse og bestilling så lenge loven krever at vi oppbevarer kvitteringer. Når du skriver til oss, tar vi vare på samtalen i ett år, så planteklinikken ser hva vi svarte sist.

Vi selger aldri det vi vet om deg, og vi deler det bare med budene som bringer plantene og betalingstjenesten som tar imot kortet ditt.

Skriv til privacy@hagen.example.com for å se hva vi har om deg, eller for å be oss slette det.`,
};

/**
 * Each shop in Norwegian: its city, and the alt text of its photo.
 */
const officesInNorwegian: Record<string, Record<string, unknown>> = {
    'Hagen London': {
        city: 'London',
    },
    'Hagen Oslo': {
        city: 'Oslo',
        photo: 'Nærbilde av bregneblader som har foldet seg ut i skyggen',
    },
    'Hagen Bergen': {
        city: 'Bergen',
    },
};

/**
 * Hagen Norge's front page in English, which it serves under `/en`.
 */
const norwayFrontPageInEnglish = {
    heading: 'Plants that stay with you',
    intro: 'Houseplants, ferns and trees from growers we know, in Oslo and Bergen. Delivered the next day in both cities.',
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
 * journal, the privacy policy, the UK's events and every site's pages.
 * Content already there is left alone, so an editor's changes survive a
 * restart.
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
        await service.store.publish(state.target.kind, state.target.key, AUTHOR, state.target.site, state.target.locale);
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

    await fill(
        {
            type: 'item',
            collection: 'offices',
            id: officeId('Hagen London'),
            site: 'uk',
        },
        londonOnTheUk
    );

    /**
     * Stores a photo in the shared library, or in a site's own when `site`
     * names one.
     */
    const upload = async (photo: { file: string; alt: string }, site?: string): Promise<{ id: string; alt: string }> => {
        const bytes = new Uint8Array(await readFile(join(PHOTOS, photo.file)));
        const record = await service.media.storeBytes(bytes, photo.file, AUTHOR, undefined, site);
        if (record.alt === '') {
            await service.media.update(
                record.id,
                {
                    alt: photo.alt,
                },
                AUTHOR
            );
        }
        return {
            id: record.id,
            alt: photo.alt,
        };
    };

    /**
     * Gives a published document an image it has none of yet.
     */
    const addImage = async (ref: DocumentRef, field: string, photo: { file: string; alt: string }, site?: string): Promise<void> => {
        const { row } = await service.document(ref);
        if (row === undefined || row.published?.[field] !== undefined) return;
        await service.update({
            ref,
            changes: {
                [field]: await upload(photo, site),
            },
            caller,
            author: AUTHOR,
            summary: 'Seeded',
        });
        await publish(ref);
        console.log(`[demo] seeded the ${field} of ${formatRef(ref)}`);
    };

    await addImage(
        {
            type: 'item',
            collection: 'offices',
            id: officeId('Hagen Oslo'),
        },
        'photo',
        photos.oslo
    );

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

    const wreathEvening = (await service.editorItems('events', 'uk')).find((event) => event.label === 'Wreath evening');
    if (wreathEvening !== undefined) {
        await addImage(
            {
                type: 'item',
                collection: 'events',
                id: wreathEvening.id,
                site: 'uk',
            },
            'image',
            photos.wreathEvening,
            'uk'
        );
    }

    if ((await service.editorItems('articles')).length === 0) {
        for (const article of articles) {
            const created = await service.createItem('articles', article, caller, AUTHOR);
            await publish(created.target.ref);
        }
        console.log(`[demo] seeded ${articles.length} articles`);
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

    await fill(
        {
            type: 'global',
            name: 'privacyPolicy',
            locale: 'nb',
        },
        privacyPolicyInNorwegian
    );
    const articleItems = await service.editorItems('articles');
    for (const [title, values] of Object.entries(articlesInNorwegian)) {
        const found = articleItems.find((article) => article.label === title);
        if (found === undefined) continue;
        await fill(
            {
                type: 'item',
                collection: 'articles',
                id: found.id,
                locale: 'nb',
            },
            values
        );
    }
    for (const [name, values] of Object.entries(officesInNorwegian)) {
        await fill(
            {
                type: 'item',
                collection: 'offices',
                id: officeId(name),
                locale: 'nb',
            },
            values
        );
    }
    await fill(
        {
            type: 'page',
            name: 'frontPage',
            site: 'norway',
            locale: 'en',
        },
        norwayFrontPageInEnglish
    );
};
