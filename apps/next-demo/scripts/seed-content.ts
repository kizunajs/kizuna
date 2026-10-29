import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { formatRef, type CmsService, type DocumentRef } from '@kizunajs/cms';

const AUTHOR = 'seed';
const PHOTOS = join(process.cwd(), 'seed/photos');

/**
 * Photos from Unsplash, free to use under the Unsplash License. The cropped
 * ones are details of the photo they name.
 */
const library = [
    {
        file: 'forest-path.jpg',
        alt: 'Morning sun on a path through spruce forest, ferns on either side',
        source: 'https://unsplash.com/photos/1441974231531-c6227db76b6e',
    },
    {
        file: 'forest-floor.jpg',
        alt: 'Young ferns in the sun along a forest path',
        source: 'A crop of forest-path.jpg',
    },
    {
        file: 'forest-trunks.jpg',
        alt: 'Tall spruce trunks above a green understorey',
        source: 'A crop of forest-path.jpg',
    },
    {
        file: 'ferns.jpg',
        alt: 'Lady fern fronds, Athyrium filix-femina, filling the frame in deep shade',
        source: 'https://unsplash.com/photos/1497250681960-ef046c08a56e',
    },
    {
        file: 'fern-fronds.jpg',
        alt: 'Close up of fern fronds unfurled in the shade',
        source: 'A crop of ferns.jpg',
    },
    {
        file: 'cherry-blossom.jpg',
        alt: 'Japanese cherry in flower, Prunus serrulata, against an April sky',
        source: 'https://unsplash.com/photos/1522383225653-ed111181a951',
    },
    {
        file: 'cherry-branch.jpg',
        alt: 'A cluster of pale pink cherry blossom close up',
        source: 'A crop of cherry-blossom.jpg',
    },
];

const people = [
    {
        file: 'ingrid-solberg.jpg',
        source: 'https://unsplash.com/photos/1438761681033-6461ffad8d80',
        values: {
            name: 'Ingrid Solberg',
            role: 'Founder and buyer',
            department: 'shop',
            email: 'ingrid@hagenplanter.no',
            bio: 'Ingrid opened Hagen in 2019 after ten years at a nursery in Hurdal. She still chooses every plant we sell, usually in person.',
            favouritePlant: 'Asplenium nidus',
            order: 0,
        },
    },
    {
        file: 'sara-lindqvist.jpg',
        source: 'https://unsplash.com/photos/1544005313-94ddf0286df2',
        values: {
            name: 'Sara Lindqvist',
            role: 'Shop gardener',
            department: 'shop',
            email: 'sara@hagenplanter.no',
            bio: 'Sara runs the shop floor and the courtyard beds behind it. Ask her which pot to buy and she will ask about your window first.',
            favouritePlant: 'Hydrangea paniculata',
            order: 1,
        },
    },
    {
        file: 'martin-hale.jpg',
        source: 'https://unsplash.com/photos/1472099645785-5658abf4ff4e',
        values: {
            name: 'Martin Hale',
            role: 'Head of plant care',
            department: 'care',
            email: 'pleie@hagenplanter.no',
            bio: 'Send Martin a photo of a plant that is struggling and he replies the same day. Nine times in ten, the answer is less water.',
            favouritePlant: 'Dracaena trifasciata',
            order: 0,
        },
    },
    {
        file: 'felix-lund.jpg',
        source: 'https://unsplash.com/photos/1539571696357-5a69c17a67c6',
        values: {
            name: 'Felix Lund',
            role: 'Plant doctor',
            department: 'care',
            bio: 'Felix makes house calls for plants too big to carry in, and repots anything taller than he is.',
            favouritePlant: 'Monstera deliciosa',
            order: 1,
        },
    },
    {
        file: 'marco-reyes.jpg',
        source: 'https://unsplash.com/photos/1507003211169-0a1dd7228f2d',
        values: {
            name: 'Marco Reyes',
            role: 'Office plants lead',
            department: 'offices',
            email: 'marco@hagenplanter.no',
            phone: '+47 22 41 08 12',
            bio: 'Marco looks after the plants in forty Oslo offices, and walks through every new one before it signs up.',
            favouritePlant: 'Ficus lyrata',
            order: 0,
        },
    },
    {
        file: 'lucia-romero.jpg',
        source: 'https://unsplash.com/photos/1494790108377-be9c29b29330',
        values: {
            name: 'Lucía Romero',
            role: 'Office plant carer',
            department: 'offices',
            phone: '+47 22 41 08 14',
            bio: 'Lucía waters, feeds and turns office plants on a two-week round, by cargo bike whenever the weather allows.',
            favouritePlant: 'Epipremnum aureum',
            order: 1,
        },
    },
    {
        file: 'aiko-tanaka.jpg',
        source: 'https://unsplash.com/photos/1534528741775-53994a69daeb',
        values: {
            name: 'Aiko Tanaka',
            role: 'Photographer and web shop',
            department: 'online',
            email: 'aiko@hagenplanter.no',
            bio: 'Aiko photographs every plant we sell, in daylight, in the back room of the shop.',
            favouritePlant: 'Adiantum raddianum',
            order: 0,
        },
    },
    {
        file: 'daniel-moreau.jpg',
        source: 'https://unsplash.com/photos/1500648767791-00dcc994a43e',
        values: {
            name: 'Daniel Moreau',
            role: 'Web shop and stock',
            department: 'online',
            bio: 'Daniel keeps the stock count honest, so the plant you order is the one on the shelf.',
            favouritePlant: 'Zamioculcas zamiifolia',
            order: 1,
        },
    },
    {
        file: 'jonas-berg.jpg',
        source: 'https://unsplash.com/photos/1506794778202-cad84cf45f1d',
        values: {
            name: 'Jonas Berg',
            role: 'Delivery',
            department: 'online',
            bio: 'Jonas drives the electric van, and knows which stairwells in Oslo a two-metre palm will fit up.',
            favouritePlant: 'Howea forsteriana',
            order: 2,
        },
    },
];

const articleSeeds = [
    {
        cover: 'forest-path.jpg',
        author: 'Felix Lund',
        values: {
            title: 'Bring the balcony in before the first frost',
            slug: 'bring-the-balcony-in-before-the-first-frost',
            topic: 'season',
            publishedOn: '2026-10-26',
            coverCaption: 'Morning light at the forest edge in Hurdal, late October',
            excerpt: 'Most balcony plants survive a cold night but not a frost. Here is when to bring them in, and what to check first.',
            body: `Oslo usually sees its first night frost in the last week of October. A *Pelargonium* or a lemon tree that has spent the summer outside will cope with five degrees, but not with minus one.

## Check before it comes inside

Look under every leaf and along the stems. Aphids and spider mites that the wind kept down outside will spread fast in a warm living room.

- Rinse the whole plant in the shower, soil covered with a plastic bag.
- Pull off yellow leaves and anything soft at the base.
- Leave it in the hallway for a few days before it joins the others.

## Then let it rest

Give it the brightest window you have, away from the radiator, and water about half as often as you did in July. Growth slows down in winter, and so does thirst.

> A plant that comes in clean in October is the one still standing in March.`,
        },
    },
    {
        cover: 'cherry-branch.jpg',
        author: 'Ingrid Solberg',
        values: {
            title: 'Plant bulbs now, thank yourself in April',
            slug: 'plant-bulbs-now',
            topic: 'season',
            publishedOn: '2026-10-19',
            coverCaption: 'Cherry blossom on Grünerløkka in late April',
            excerpt: 'Tulips, daffodils and hyacinths need a cold winter in the ground. October and November are the months to plant them.',
            body: `Bulbs need a long cold spell to flower, which is why they go in now and not in spring. As long as you can push a trowel into the soil, it is not too late.

## How deep, how far apart

Plant each bulb about three times as deep as it is tall, pointed end up. Tulips go in at 15 cm, crocuses at 8. Space them a bulb's width apart for a full look in a pot, twice that in a bed.

## Pots on a balcony

A pot freezes right through in a cold January, which bulbs in the ground never face. Wrap the pot in hessian or move it against the wall, and use a mix with grit so the bulbs never sit wet.

This year we have twelve kinds of *Tulipa*, six daffodils and hyacinths in white, blue and pale pink. Buy twenty or more and we pack them with a planting card.`,
        },
    },
    {
        cover: 'ferns.jpg',
        author: 'Martin Hale',
        values: {
            title: 'Five ferns for a north-facing window',
            slug: 'five-ferns-for-a-north-facing-window',
            topic: 'care',
            publishedOn: '2026-10-12',
            coverCaption: 'Athyrium filix-femina in deep shade',
            excerpt: 'Ferns grew up under trees. A window that never sees the sun suits them better than it suits almost anything else.',
            body: `A north-facing window gets even, soft light all day, which is exactly what a forest floor gives. These five do well in it.

- *Nephrolepis exaltata*, the Boston fern, for a shelf where its fronds can hang.
- *Asplenium nidus*, the bird's nest fern, with glossy leaves that forgive dry air.
- *Adiantum raddianum*, the maidenhair, for a bathroom with a window.
- *Phlebodium aureum*, blue and leathery, the toughest of the five.
- *Davallia fejeensis*, whose furry rhizomes creep over the edge of the pot.

## Water and air

Keep the soil damp but never wet, which in a heated flat means a little water twice a week. Stand the pot on a tray of wet gravel through the winter, when radiators dry the air.

Brown tips mean the air is too dry. Yellow fronds from the base mean the soil is too wet.`,
        },
    },
    {
        cover: 'forest-trunks.jpg',
        author: 'Aiko Tanaka',
        values: {
            title: 'A morning at the nursery in Hurdal',
            slug: 'a-morning-at-the-nursery-in-hurdal',
            topic: 'growers',
            publishedOn: '2026-10-02',
            coverCaption: 'Spruce above the fern beds in Hurdal',
            excerpt: 'Where our ferns start out: a family nursery an hour north of Oslo, at the edge of the forest.',
            body: `Most of our ferns come from one nursery in Hurdal, run by the same family for three generations. They grow them outdoors, in the shade of a spruce wood, for their whole first year.

## Why outdoors matters

A fern raised in a greenhouse has never felt wind or a dry week. One raised under trees has, and it arrives with thicker fronds and roots that forgive a missed watering.

We spent a September morning walking the beds with Ingrid, choosing this autumn's *Athyrium* and *Dryopteris* plant by plant. The photos in the shop this season are from that morning.

> Every fern on our shelves has spent a summer outside under real trees.`,
        },
    },
    {
        cover: 'fern-fronds.jpg',
        author: 'Martin Hale',
        values: {
            title: 'Why are the leaves turning yellow?',
            slug: 'why-are-the-leaves-turning-yellow',
            topic: 'care',
            publishedOn: '2026-09-21',
            coverCaption: 'New fronds on a Boston fern',
            excerpt: 'It is the question the plant care desk hears most. The answer is usually the watering can.',
            body: `About half the questions we get each week are some version of this one. Before you move the plant or feed it, check the soil.

## Push a finger in

If the soil is wet two centimetres down, the plant has had too much water. Roots in wet soil cannot breathe, and the oldest leaves yellow first. Let it dry out, and water only when the top of the soil is dry.

If the soil is dry and the yellow leaves are crisp, it has had too little. Stand the pot in a bowl of water for half an hour, then let it drain.

## Send us a photo

A photo of the whole plant, the soil and the window it stands by tells us more than any description. Send one to the plant care desk and we reply the same day.`,
        },
    },
    {
        cover: 'cherry-blossom.jpg',
        author: 'Sara Lindqvist',
        values: {
            title: 'Planting a cherry tree in Oslo clay',
            slug: 'planting-a-cherry-tree-in-oslo-clay',
            topic: 'care',
            publishedOn: '2026-09-07',
            coverCaption: 'A Kanzan cherry in flower, the variety we sell bare root',
            excerpt: 'Most gardens in Oslo sit on heavy clay. A cherry will grow in it, if the hole is dug the right way.',
            body: `Bare-root cherries arrive from November, while the trees are dormant. Plant one as soon as it comes, on a day the ground is not frozen.

## Dig wide, not deep

Clay holds water like a bowl. Dig the hole three times as wide as the roots but no deeper than they need, and break up the sides with a fork so roots can find their way out.

- Mix a bucket of compost into the soil you dug out, not into the bottom of the hole.
- Set the tree at the depth it grew at the nursery. The mark is on the trunk.
- Stake it on the side the wind comes from, low on the trunk.

Water it in well, then leave it until spring. A *Prunus serrulata* planted this way flowers in its second April.`,
        },
    },
    {
        cover: 'forest-floor.jpg',
        author: 'Lucía Romero',
        values: {
            title: 'Repotting without the mess',
            slug: 'repotting-without-the-mess',
            topic: 'care',
            publishedOn: '2026-08-24',
            coverCaption: 'Young ferns at the edge of the path',
            excerpt: 'How to tell a plant needs a bigger pot, and how to move it on a kitchen table without soil in every corner.',
            body: `Roots coming out of the drainage hole, or water running straight through, mean it is time. Spring and late summer are the best months, while the plant is still growing.

## On the kitchen table

Lay a sheet of newspaper, or an old shower curtain for anything large. Water the plant the day before so the root ball holds together.

- Choose a pot only one size up, two to four centimetres wider.
- Tip the plant out on its side, never pull it by the stem.
- Loosen the outer roots with your fingers and set it at the same depth as before.

Water once, then leave it out of direct sun for a week while the roots settle.`,
        },
    },
    {
        cover: 'cherry-blossom.jpg',
        author: 'Ingrid Solberg',
        values: {
            title: 'Where our cherry trees come from',
            slug: 'where-our-cherry-trees-come-from',
            topic: 'growers',
            publishedOn: '2026-08-10',
            coverCaption: 'Cherry in flower at our grower outside Lier',
            excerpt: 'Our ornamental cherries grow for four years at a tree nursery in Lier before they come to Oslo.',
            body: `Every cherry we sell is grafted and grown on by a tree nursery in Lier, half an hour west of Oslo. They lift them in November, when the trees are bare, and we collect them the same week.

## Four years in a field

A young *Prunus* spends four summers in the field, pruned each winter so the crown grows open and even. By the time it reaches us it stands about 120 cm and has flowered once already.

Buying bare root keeps the price down and the roots healthy, since the tree never sat in a plastic pot. It also means cherries are only in the shop from November to March.`,
        },
    },
];

/**
 * A few words of plain markup as rich text: blank lines between blocks,
 * `## ` for a heading, `- ` for a list item, `> ` for a quote, and
 * `*asterisks*` for italics.
 */
const richText = (source: string) => {
    const key = (): string => randomUUID().replace(/-/g, '').slice(0, 12);
    const spans = (line: string) =>
        line
            .split(/\*([^*]+)\*/)
            .map((text, index) => ({
                _type: 'span',
                _key: key(),
                text,
                marks: index % 2 === 1 ? ['em'] : [],
            }))
            .filter((span) => span.text !== '');
    const block = (line: string, style: string, listItem?: string) => ({
        _type: 'block',
        _key: key(),
        style,
        markDefs: [],
        children: spans(line),
        ...(listItem === undefined
            ? {}
            : {
                  listItem,
                  level: 1,
              }),
    });
    return source
        .split(/\n\s*\n/)
        .map((chunk) => chunk.trim())
        .filter((chunk) => chunk !== '')
        .flatMap((chunk) => {
            const lines = chunk.split('\n');
            if (lines.every((line) => line.startsWith('- '))) return lines.map((line) => block(line.slice(2), 'normal', 'bullet'));
            if (chunk.startsWith('## ')) return [block(chunk.slice(3), 'h2')];
            if (chunk.startsWith('> ')) return [block(chunk.slice(2), 'blockquote')];
            return [block(lines.join(' '), 'normal')];
        });
};

/**
 * Fills in what the demo database is missing: the photos, the header and
 * footer, the people, the articles, and every page. Content already there is
 * left alone, so an editor's changes survive a restart.
 */
export const seedContent = async (service: CmsService): Promise<void> => {
    const caller = service.caller({
        editor: {
            role: 'admin',
        },
    });

    const upload = async (file: string, alt: string): Promise<{ id: string; alt: string }> => {
        const bytes = new Uint8Array(await readFile(join(PHOTOS, file)));
        const record = await service.media.storeBytes(bytes, file, AUTHOR);
        if (record.alt === '') {
            await service.media.update(
                record.id,
                {
                    alt,
                },
                AUTHOR
            );
        }
        return {
            id: record.id,
            alt,
        };
    };

    // Next's cache lives in the running server, which has not started yet, so
    // publishing goes to the store without invalidating anything.
    const publish = async (ref: DocumentRef): Promise<void> => {
        const state = await service.draftState(ref);
        if (!state.complete) throw new Error(`The seed for ${formatRef(ref)} is missing ${state.missing.join(', ')}.`);
        await service.store.publish(state.target.kind, state.target.key, AUTHOR);
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

    const photos = new Map<string, { id: string; alt: string }>();
    for (const photo of library) photos.set(photo.file, await upload(photo.file, photo.alt));
    const photo = (file: string): { id: string; alt: string } => {
        const found = photos.get(file);
        if (found === undefined) throw new Error(`The seed has no photo '${file}'.`);
        return found;
    };

    await fill(
        {
            type: 'global',
            name: 'header',
        },
        {
            navItems: [
                {
                    label: 'Shop',
                    href: '/#shop',
                },
                {
                    label: 'Plant care',
                    href: '/blog?topic=care',
                },
                {
                    label: 'Journal',
                    href: '/blog',
                },
                {
                    label: 'Team',
                    href: '/team',
                },
                {
                    label: 'Contact',
                    href: '/contact',
                },
            ],
            announcement: 'Order by 14:00 for next-day delivery in Oslo.',
            announcementLink: {
                label: 'Delivery details',
                href: '/contact',
            },
            showAnnouncement: true,
        }
    );

    await fill(
        {
            type: 'global',
            name: 'footer',
        },
        {
            tagline:
                'A plant shop on Grünerløkka. Houseplants, ferns and trees from growers we know, and help for as long as you keep them.',
            navItems: [
                {
                    label: 'Plant care guides',
                    href: '/blog?topic=care',
                },
                {
                    label: 'In season',
                    href: '/blog?topic=season',
                },
                {
                    label: 'From the growers',
                    href: '/blog?topic=growers',
                },
                {
                    label: 'Team',
                    href: '/team',
                },
                {
                    label: 'Contact',
                    href: '/contact',
                },
            ],
            newsletterHeading: 'A letter when the *season turns*',
            newsletterText: 'One email a month: what to plant, what to bring inside, and what just arrived from the nursery.',
            showNewsletter: true,
            contactEmail: 'hei@hagenplanter.no',
            phone: '+47 22 41 08 00',
            address: 'Markveien 38, 0554 Oslo',
            openingHours: [
                {
                    days: 'Monday to Friday',
                    hours: '10 to 18',
                },
                {
                    days: 'Saturday',
                    hours: '10 to 16',
                },
                {
                    days: 'Sunday',
                    hours: 'Closed',
                },
            ],
        }
    );

    if ((await service.editorItems('employees')).length === 0) {
        for (const person of people) {
            const portrait = await upload(person.file, `Portrait of ${person.values.name}`);
            const created = await service.createItem(
                'employees',
                {
                    ...person.values,
                    photo: portrait,
                },
                caller,
                AUTHOR
            );
            await publish(created.target.ref);
        }
        console.log(`[demo] seeded ${people.length} employees`);
    }

    const staff = await service.editorItems('employees');
    const personId = (name: string): string | undefined => staff.find((person) => person.label === name)?.id;

    if ((await service.editorItems('articles')).length === 0) {
        for (const article of articleSeeds) {
            const created = await service.createItem(
                'articles',
                {
                    ...article.values,
                    body: richText(article.values.body),
                    cover: photo(article.cover),
                    author: personId(article.author),
                },
                caller,
                AUTHOR
            );
            await publish(created.target.ref);
        }
        console.log(`[demo] seeded ${articleSeeds.length} articles`);
    }

    const articles = await service.editorItems('articles');
    const articleId = (title: string): string | undefined => articles.find((article) => article.label === title)?.id;
    const picked = (...titles: string[]): string[] => titles.map(articleId).filter((id) => id !== undefined);

    await fill(
        {
            type: 'page',
            name: 'teamPage',
        },
        {
            eyebrow: 'Team',
            heading: 'The people who *keep it green*',
            intro: 'Nine of us between the shop on Grünerløkka, the plant care desk, the office rounds and the van.',
            photo: photo('forest-path.jpg'),
            caption: 'The spruce wood at our grower in Hurdal, where the team goes every September',
            photoLayout: 'wide',
            hiringHeading: 'Want to work *with plants*?',
            hiringText:
                'We hire for the spring rush every February. Write to Ingrid with a few lines about the plants you have kept alive.',
            hiringEmail: 'jobb@hagenplanter.no',
            seo: {
                title: 'The team behind Hagen',
                description:
                    'Meet the nine people who run Hagen, a plant shop on Grünerløkka in Oslo: the shop, plant care, office plants and delivery.',
            },
        }
    );

    await fill(
        {
            type: 'page',
            name: 'blogIndexPage',
        },
        {
            eyebrow: 'Journal',
            heading: 'Notes on keeping plants *alive*',
            intro: 'Care guides from the plant care desk, what to plant this month, and visits to the growers we buy from.',
            featured: articleId('Bring the balcony in before the first frost'),
            seo: {
                title: 'Journal: plant care, seasons and growers',
                description: 'Plant care guides, what to plant in Oslo this month, and stories from the nurseries Hagen buys from.',
            },
        }
    );

    await fill(
        {
            type: 'page',
            name: 'contactPage',
        },
        {
            eyebrow: 'Contact',
            heading: 'Ask us about *any plant*',
            intro: 'Questions about an order, a plant that is struggling, or plants for your office. We answer every weekday, usually within the hour.',
            subjects: ['An order', 'A plant that is struggling', 'Plants for an office', 'Something else'],
            buttonLabel: 'Send message',
            thanks: 'We reply within a working day, usually much sooner. If a plant is struggling, a photo of it helps.',
            directions: 'On the corner of Markveien and Grüners gate. Trams 11, 12 and 13 stop at Olaf Ryes plass, two minutes away.',
            contacts: [personId('Martin Hale'), personId('Marco Reyes'), personId('Ingrid Solberg')].filter((id) => id !== undefined),
            seo: {
                title: 'Contact and opening hours',
                description:
                    'Visit Hagen at Markveien 38 on Grünerløkka, or ask the plant care desk about any plant. We answer every weekday.',
            },
        }
    );

    await fill(
        {
            type: 'page',
            name: 'frontPage',
        },
        {
            hero: {
                eyebrow: 'Plant shop, Grünerløkka',
                heading: 'Plants that *stay* with you',
                subheading: 'Houseplants, ferns and trees from growers we know, delivered across Oslo the next day.',
                image: photo('forest-path.jpg'),
                caption: 'Spruce and lady fern at our grower in Hurdal, September',
                links: [
                    {
                        label: 'Shop this week',
                        href: '/#shop',
                    },
                    {
                        label: 'Plant care guides',
                        href: '/blog?topic=care',
                    },
                ],
            },
            sections: [
                {
                    block: 'statement',
                    eyebrow: 'Since 2019',
                    text: 'A small shop in Oslo for people who want their plants *alive and well in March*.',
                    images: [photo('fern-fronds.jpg'), photo('cherry-branch.jpg'), photo('forest-floor.jpg'), photo('ferns.jpg')],
                    link: {
                        label: 'How we choose',
                        href: '/blog/a-morning-at-the-nursery-in-hurdal',
                    },
                },
                {
                    block: 'categories',
                    eyebrow: 'Shop by light',
                    heading: 'A plant for the window *you have*',
                    categories: [
                        {
                            name: 'Shade lovers',
                            image: photo('ferns.jpg'),
                            href: '/blog/five-ferns-for-a-north-facing-window',
                        },
                        {
                            name: 'Trees for spring',
                            image: photo('cherry-blossom.jpg'),
                            href: '/blog/planting-a-cherry-tree-in-oslo-clay',
                        },
                        {
                            name: 'The forest floor',
                            image: photo('forest-floor.jpg'),
                            href: '/blog?topic=growers',
                        },
                    ],
                },
                {
                    block: 'products',
                    eyebrow: 'New in',
                    heading: 'In the shop *this week*',
                    products: ['prod_boston_fern', 'prod_japanese_cherry', 'prod_lady_fern', 'prod_woodland_ferns'],
                    link: {
                        label: 'Ask about stock',
                        href: '/contact',
                    },
                },
                {
                    block: 'media',
                    image: photo('ferns.jpg'),
                    caption: 'Lady fern, Athyrium filix-femina, in the shade beds in August',
                    heading: 'Every fern we sell spends its first summer *outside, under real trees*',
                    body: 'Our grower in Hurdal raises them in the shade of a spruce wood, not a greenhouse. They arrive tougher, and forgive a missed watering.',
                    tone: 'sage',
                },
                {
                    block: 'content',
                    eyebrow: 'How we work',
                    heading: 'A small shop, and *help that lasts*',
                    columns: [
                        {
                            heading: 'Grown nearby',
                            body: richText(
                                'Our ferns come from Hurdal and our cherries from Lier, both within an hour of the shop. We visit each grower every season and choose the plants ourselves.'
                            ),
                        },
                        {
                            heading: 'A care card in every pot',
                            body: richText(
                                'Each plant leaves with a card for its light, water and feeding. If it struggles anyway, send the plant care desk a photo and we reply the same day.'
                            ),
                        },
                        {
                            heading: 'Next day across Oslo',
                            body: richText(
                                'Order before 14:00 and Jonas brings it the next day in the electric van, wrapped in paper. Delivery is 89 kr, and free over 800 kr.'
                            ),
                        },
                    ],
                },
                {
                    block: 'archive',
                    eyebrow: 'Journal',
                    heading: 'From the *journal*',
                    articles: picked(
                        'Five ferns for a north-facing window',
                        'Plant bulbs now, thank yourself in April',
                        'A morning at the nursery in Hurdal'
                    ),
                },
                {
                    block: 'callToAction',
                    eyebrow: 'For offices',
                    heading: 'We keep the plants in *forty Oslo offices* green',
                    body: 'We choose plants for your light, deliver them in pots that suit the room, and come back every two weeks to water, feed and turn them.',
                    links: [
                        {
                            label: 'Talk to Marco',
                            href: '/contact',
                        },
                        {
                            label: 'Meet the team',
                            href: '/team',
                        },
                    ],
                    tone: 'forest',
                },
            ],
            heroImpact: 'high',
            seo: {
                title: 'Hagen, a plant shop in Oslo',
                description:
                    'Houseplants, ferns and trees from growers we know, delivered across Oslo the next day, with plant care help for as long as you keep them.',
            },
        }
    );
};
