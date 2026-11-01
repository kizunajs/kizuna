/**
 * What the demo seeds: Hagen's shops, people, journal, workshops, pages and
 * newsletter, and who at Hagen wrote each and how long ago. `seed.ts` writes
 * it through the CMS.
 */

/**
 * The editors `setup.ts` creates, by the email the CMS knows them by.
 */
export const mia = 'dev@kizunajs.com';
export const ada = 'ada@hagen.example.com';
export const una = 'una@hagen.example.com';
export const sam = 'sam@hagen.example.com';
export const nils = 'nils@hagen.example.com';
export const kari = 'kari@hagen.example.com';

/**
 * Who wrote a document and how many days ago, and who published it and when.
 * Without `published` it stays a draft.
 */
export interface Written {
    by: string;
    daysAgo: number;
    published?: {
        by: string;
        daysAgo: number;
    };
}

/**
 * A later change to a document: what changed, who changed it, and whether
 * they published it.
 */
export interface Edit {
    by: string;
    daysAgo: number;
    summary: string;
    changes: Record<string, unknown>;
    publish?: boolean;
}

/**
 * Photos from Unsplash, free to use under the Unsplash License, the same ones
 * the single-site demo uses.
 */
export const photos = {
    osloShop: {
        file: 'fern-fronds.jpg',
        alt: 'Close up of fern fronds unfurled in the shade',
    },
    majorstuenShop: {
        file: 'ferns.jpg',
        alt: 'Lady fern fronds filling the frame in deep shade',
    },
    stavangerShop: {
        file: 'forest-floor.jpg',
        alt: 'Young ferns in the sun along a forest path',
    },
    growers: {
        file: 'cherry-blossom.jpg',
        alt: 'Japanese cherry in flower against an April sky',
    },
    spring: {
        file: 'cherry-branch.jpg',
        alt: 'A cluster of pale pink cherry blossom close up',
    },
    wreathEvening: {
        file: 'forest-trunks.jpg',
        alt: 'Tall spruce trunks above a green understorey',
    },
    norwayHero: {
        file: 'forest-path.jpg',
        alt: 'En sti gjennom granskogen',
    },
    norwayChristmas: {
        file: 'forest-trunks.jpg',
        alt: 'Høye grantrær over en grønn skogbunn',
    },
    bergenShop: {
        file: 'ferns.jpg',
        alt: 'Bregner som fyller bildet i dyp skygge',
    },
    winterCare: {
        file: 'ferns.jpg',
        alt: 'Lady fern fronds filling the frame in deep shade',
    },
    nordmannFir: {
        file: 'forest-trunks.jpg',
        alt: 'Tall fir trunks above a green understorey',
    },
    bostonFern: {
        file: 'fern-fronds.jpg',
        alt: 'Fern fronds unfurling in soft light',
    },
    ladyFern: {
        file: 'forest-floor.jpg',
        alt: 'Young ferns in the sun along a forest path',
    },
    kanzanCherry: {
        file: 'cherry-blossom.jpg',
        alt: 'A Japanese cherry in flower against an April sky',
    },
    cherryBranches: {
        file: 'cherry-branch.jpg',
        alt: 'A cluster of pale pink cherry blossom close up',
    },
};

/**
 * The plants Hagen sells, as the newsletter shows them. Each is published.
 */
export const products: Array<{
    values: Record<string, unknown>;
    photo: keyof typeof photos;
    written: Written;
    inNorwegian: Record<string, unknown>;
}> = [
    {
        values: {
            name: 'Nordmann fir, 180 cm',
            price: '£65',
            summary: 'Grown in Hedmarken and cut in late November, so it keeps its needles until Twelfth Night.',
        },
        photo: 'nordmannFir',
        inNorwegian: {
            name: 'Nordmannsgran, 180 cm',
            summary: 'Dyrket på Hedmarken og hogd i slutten av november, så den holder på nålene til trettende dag.',
            photo: 'Høye granstammer over en grønn skogbunn',
        },
        written: {
            by: una,
            daysAgo: 20,
            published: {
                by: ada,
                daysAgo: 19,
            },
        },
    },
    {
        values: {
            name: 'Boston fern',
            price: '£18',
            summary: 'A full fern for a bright bathroom or a cool hall. Keep the soil moist and mist it in winter.',
        },
        photo: 'bostonFern',
        inNorwegian: {
            name: 'Sverdbregne',
            summary: 'En frodig bregne til et lyst bad eller en kjølig gang. Hold jorda fuktig og dusj den om vinteren.',
            photo: 'Bregneblader som folder seg ut i mykt lys',
        },
        written: {
            by: una,
            daysAgo: 20,
            published: {
                by: ada,
                daysAgo: 19,
            },
        },
    },
    {
        values: {
            name: 'Lady fern',
            price: '£14',
            summary: 'A hardy fern for a shady corner of the garden, back every spring.',
        },
        photo: 'ladyFern',
        inNorwegian: {
            name: 'Skogburkne',
            summary: 'En hardfør bregne til et skyggefullt hjørne av hagen, som kommer tilbake hver vår.',
            photo: 'Unge bregner i sola langs en skogssti',
        },
        written: {
            by: sam,
            daysAgo: 18,
            published: {
                by: ada,
                daysAgo: 17,
            },
        },
    },
    {
        values: {
            name: "Japanese cherry 'Kanzan'",
            price: '£95',
            summary: 'Double pink flowers in late April, on a young tree of about two metres.',
        },
        photo: 'kanzanCherry',
        inNorwegian: {
            name: 'Japansk kirsebær «Kanzan»',
            summary: 'Fylte rosa blomster i slutten av april, på et ungt tre på rundt to meter.',
            photo: 'Et japansk kirsebærtre i blomst mot aprilhimmelen',
        },
        written: {
            by: sam,
            daysAgo: 18,
            published: {
                by: ada,
                daysAgo: 17,
            },
        },
    },
    {
        values: {
            name: 'Cherry blossom branches',
            price: '£12 a bunch',
            summary: 'Branches cut in bud, which open in a vase indoors in a week or two.',
        },
        photo: 'cherryBranches',
        inNorwegian: {
            name: 'Kirsebærgreiner',
            summary: 'Greiner skåret i knopp, som springer ut i en vase innendørs på en uke eller to.',
            photo: 'En klase lyserosa kirsebærblomster på nært hold',
        },
        written: {
            by: sam,
            daysAgo: 18,
            published: {
                by: ada,
                daysAgo: 17,
            },
        },
    },
];

/**
 * Hagen's shops, in the order the sites list them. Trondheim opens with the
 * release, so it starts as a draft.
 */
export const offices: Array<{ values: Record<string, unknown>; written: Written; photo?: keyof typeof photos }> = [
    {
        values: {
            name: 'Hagen Oslo',
            city: 'Oslo',
            address: 'Markveien 38, 0554 Oslo',
            phone: '+47 22 41 08 00',
        },
        photo: 'osloShop',
        written: {
            by: ada,
            daysAgo: 62,
            published: {
                by: ada,
                daysAgo: 62,
            },
        },
    },
    {
        values: {
            name: 'Hagen Majorstuen',
            city: 'Oslo',
            address: 'Bogstadveien 51, 0366 Oslo',
            phone: '+47 22 41 08 10',
        },
        photo: 'majorstuenShop',
        written: {
            by: kari,
            daysAgo: 41,
            published: {
                by: ada,
                daysAgo: 40,
            },
        },
    },
    {
        values: {
            name: 'Hagen Bergen',
            city: 'Bergen',
            address: 'Vaskerelven 8, 5014 Bergen',
            phone: '+47 55 30 21 40',
        },
        written: {
            by: ada,
            daysAgo: 62,
            published: {
                by: ada,
                daysAgo: 62,
            },
        },
    },
    {
        values: {
            name: 'Hagen Stavanger',
            city: 'Stavanger',
            address: 'Øvre Holmegate 14, 4006 Stavanger',
            phone: '+47 51 89 40 20',
        },
        photo: 'stavangerShop',
        written: {
            by: nils,
            daysAgo: 33,
            published: {
                by: ada,
                daysAgo: 30,
            },
        },
    },
    {
        values: {
            name: 'Hagen Trondheim',
            city: 'Trondheim',
            address: 'Nedre Bakklandet 12, 7014 Trondheim',
            phone: '+47 73 52 18 30',
        },
        written: {
            by: nils,
            daysAgo: 6,
        },
    },
    {
        values: {
            name: 'Hagen London',
            city: 'London',
            address: '14 Columbia Road, London E2 7RG',
            phone: '+47 22 41 08 00',
        },
        written: {
            by: ada,
            daysAgo: 62,
            published: {
                by: ada,
                daysAgo: 62,
            },
        },
    },
    {
        values: {
            name: 'Hagen Brighton',
            city: 'Brighton',
            address: '27 Kensington Gardens, Brighton BN1 4AL',
            phone: '+47 22 41 08 00',
        },
        written: {
            by: una,
            daysAgo: 24,
            published: {
                by: ada,
                daysAgo: 23,
            },
        },
    },
];

/**
 * What the UK sets of its own on its shops: the number its customers call,
 * and the opening hours only the UK lists.
 */
export const officesOnTheUk: Record<string, Record<string, unknown>> = {
    'Hagen London': {
        phone: '+44 20 7946 0321',
        openingHours: 'Tuesday to Sunday, 9 to 17',
    },
    'Hagen Brighton': {
        phone: '+44 1273 960 214',
        openingHours: 'Every day, 10 to 18',
    },
};

/**
 * Each shop in Norwegian: its city, and the alt text of its photo.
 */
export const officesInNorwegian: Record<string, Record<string, unknown>> = {
    'Hagen Oslo': {
        city: 'Oslo',
        photo: 'Nærbilde av bregneblader som har foldet seg ut i skyggen',
    },
    'Hagen Majorstuen': {
        city: 'Oslo',
        photo: 'Bregner som fyller bildet i dyp skygge',
    },
    'Hagen Bergen': {
        city: 'Bergen',
    },
    'Hagen Stavanger': {
        city: 'Stavanger',
        photo: 'Unge bregner i sola langs en skogssti',
    },
    'Hagen London': {
        city: 'London',
    },
    'Hagen Brighton': {
        city: 'Brighton',
    },
};

/**
 * Everyone at Hagen, by shop, in the order the sites list them. The two in
 * Trondheim start with the release.
 */
export const employees: Array<{ office: string; values: Record<string, unknown>; written: Written }> = [
    {
        office: 'Hagen Oslo',
        values: {
            name: 'Ingrid Solberg',
            role: 'Founder and buyer',
            bio: 'Ingrid opened the first Hagen on Grünerløkka in 2019, and still chooses every plant the shops sell.',
            email: 'ingrid@hagen.example.com',
        },
        written: {
            by: ada,
            daysAgo: 60,
            published: {
                by: ada,
                daysAgo: 60,
            },
        },
    },
    {
        office: 'Hagen Oslo',
        values: {
            name: 'Sara Lindqvist',
            role: 'Shop gardener',
            bio: 'Sara runs the Oslo shop floor and the courtyard beds behind it.',
        },
        written: {
            by: kari,
            daysAgo: 58,
            published: {
                by: nils,
                daysAgo: 57,
            },
        },
    },
    {
        office: 'Hagen Oslo',
        values: {
            name: 'Jonas Berg',
            role: 'Deliveries',
            bio: 'Jonas drives the van and the cargo bike, and carries the trees up the stairs in December.',
        },
        written: {
            by: kari,
            daysAgo: 44,
            published: {
                by: nils,
                daysAgo: 44,
            },
        },
    },
    {
        office: 'Hagen Majorstuen',
        values: {
            name: 'Amalie Strand',
            role: 'Shop manager',
            bio: 'Amalie opened Majorstuen in 2023 and knows which ferns survive a flat above Bogstadveien.',
            email: 'amalie@hagen.example.no',
        },
        written: {
            by: kari,
            daysAgo: 41,
            published: {
                by: ada,
                daysAgo: 40,
            },
        },
    },
    {
        office: 'Hagen Majorstuen',
        values: {
            name: 'Tobias Eide',
            role: 'Florist',
            bio: 'Tobias makes the wreaths and the cut flower bunches, and teaches both on Thursday evenings.',
        },
        written: {
            by: kari,
            daysAgo: 19,
            published: {
                by: nils,
                daysAgo: 18,
            },
        },
    },
    {
        office: 'Hagen Bergen',
        values: {
            name: 'Erlend Vik',
            role: 'Shop manager',
            bio: 'Erlend knows which plants forgive Bergen rain on the walk home, and which do not.',
            email: 'erlend@hagen.example.no',
        },
        written: {
            by: ada,
            daysAgo: 60,
            published: {
                by: ada,
                daysAgo: 60,
            },
        },
    },
    {
        office: 'Hagen Bergen',
        values: {
            name: 'Sigrid Haugen',
            role: 'Plant doctor',
            bio: 'Sigrid makes house calls across Bergen for plants too big to carry in.',
        },
        written: {
            by: nils,
            daysAgo: 52,
            published: {
                by: nils,
                daysAgo: 52,
            },
        },
    },
    {
        office: 'Hagen Bergen',
        values: {
            name: 'Maren Dale',
            role: 'Shop gardener',
            bio: 'Maren looks after the orchids and the cacti, the two plants Bergen buys most of in winter.',
        },
        written: {
            by: kari,
            daysAgo: 12,
            published: {
                by: nils,
                daysAgo: 11,
            },
        },
    },
    {
        office: 'Hagen Stavanger',
        values: {
            name: 'Henrik Sæther',
            role: 'Shop manager',
            bio: 'Henrik opened the shop in Øvre Holmegate in 2025, in the old fishmonger with the green door.',
            email: 'henrik@hagen.example.no',
        },
        written: {
            by: nils,
            daysAgo: 33,
            published: {
                by: ada,
                daysAgo: 30,
            },
        },
    },
    {
        office: 'Hagen Stavanger',
        values: {
            name: 'Linnea Fossum',
            role: 'Shop gardener',
            bio: 'Linnea grows the shop’s own cuttings in the back room, and sells them for twenty kroner a pot.',
        },
        written: {
            by: kari,
            daysAgo: 9,
            published: {
                by: nils,
                daysAgo: 8,
            },
        },
    },
    {
        office: 'Hagen Trondheim',
        values: {
            name: 'Kristian Moe',
            role: 'Shop manager',
            bio: 'Kristian ran a nursery outside Stjørdal for ten years before he came to open Trondheim.',
            email: 'kristian@hagen.example.no',
        },
        written: {
            by: nils,
            daysAgo: 6,
        },
    },
    {
        office: 'Hagen Trondheim',
        values: {
            name: 'Hanna Lie',
            role: 'Shop gardener',
            bio: 'Hanna moves from the Oslo shop to Bakklandet, and brings the courtyard’s best ferns with her.',
        },
        written: {
            by: kari,
            daysAgo: 5,
        },
    },
    {
        office: 'Hagen London',
        values: {
            name: 'Martin Hale',
            role: 'Head of plant care',
            bio: 'Martin answers the plant care desk for every shop, and runs the London workshops.',
            email: 'martin@hagen.example.co.uk',
        },
        written: {
            by: una,
            daysAgo: 59,
            published: {
                by: ada,
                daysAgo: 59,
            },
        },
    },
    {
        office: 'Hagen London',
        values: {
            name: 'Eleanor Price',
            role: 'Shop manager',
            bio: 'Eleanor opened the Columbia Road shop in 2024, a few doors from the Sunday flower market.',
            email: 'eleanor@hagen.example.co.uk',
        },
        written: {
            by: una,
            daysAgo: 59,
            published: {
                by: ada,
                daysAgo: 59,
            },
        },
    },
    {
        office: 'Hagen London',
        values: {
            name: 'Priya Shah',
            role: 'Workshop host',
            bio: 'Priya plans the London workshops and keeps the kettle on while they run.',
        },
        written: {
            by: sam,
            daysAgo: 27,
            published: {
                by: ada,
                daysAgo: 26,
            },
        },
    },
    {
        office: 'Hagen Brighton',
        values: {
            name: 'Tom Ellery',
            role: 'Shop manager',
            bio: 'Tom opened the North Laine shop this spring, between a record shop and a bakery.',
            email: 'tom@hagen.example.co.uk',
        },
        written: {
            by: una,
            daysAgo: 24,
            published: {
                by: ada,
                daysAgo: 23,
            },
        },
    },
    {
        office: 'Hagen Brighton',
        values: {
            name: 'Grace Okafor',
            role: 'Shop gardener',
            bio: 'Grace looks after the sea air plants: the succulents, the grasses and the olive trees by the door.',
        },
        written: {
            by: sam,
            daysAgo: 15,
            published: {
                by: una,
                daysAgo: 14,
            },
        },
    },
];

/**
 * Each person in Norwegian: their title and their two sentences.
 */
export const employeesInNorwegian: Record<string, { role: string; bio: string }> = {
    'Ingrid Solberg': {
        role: 'Grunnlegger og innkjøper',
        bio: 'Ingrid åpnet den første Hagen på Grünerløkka i 2019, og velger fortsatt hver plante butikkene selger.',
    },
    'Sara Lindqvist': {
        role: 'Butikkgartner',
        bio: 'Sara driver butikken i Oslo og bedene i bakgården bak den.',
    },
    'Jonas Berg': {
        role: 'Levering',
        bio: 'Jonas kjører varebilen og lastesykkelen, og bærer juletrærne opp trappene i desember.',
    },
    'Amalie Strand': {
        role: 'Butikksjef',
        bio: 'Amalie åpnet Majorstuen i 2023 og vet hvilke bregner som klarer seg i en leilighet over Bogstadveien.',
    },
    'Tobias Eide': {
        role: 'Florist',
        bio: 'Tobias lager kransene og buketter av snittblomster, og lærer bort begge deler på torsdagskveldene.',
    },
    'Erlend Vik': {
        role: 'Butikksjef',
        bio: 'Erlend vet hvilke planter som tåler bergensregnet på vei hjem, og hvilke som ikke gjør det.',
    },
    'Sigrid Haugen': {
        role: 'Plantelege',
        bio: 'Sigrid tar hjemmebesøk over hele Bergen for planter som er for store til å bære inn.',
    },
    'Maren Dale': {
        role: 'Butikkgartner',
        bio: 'Maren steller orkideene og kaktusene, de to plantene Bergen kjøper mest av om vinteren.',
    },
    'Henrik Sæther': {
        role: 'Butikksjef',
        bio: 'Henrik åpnet butikken i Øvre Holmegate i 2025, i den gamle fiskebutikken med den grønne døra.',
    },
    'Linnea Fossum': {
        role: 'Butikkgartner',
        bio: 'Linnea dyrker butikkens egne stiklinger på bakrommet, og selger dem for tjue kroner potta.',
    },
    'Kristian Moe': {
        role: 'Butikksjef',
        bio: 'Kristian drev en planteskole utenfor Stjørdal i ti år før han kom for å åpne Trondheim.',
    },
    'Hanna Lie': {
        role: 'Butikkgartner',
        bio: 'Hanna flytter fra butikken i Oslo til Bakklandet, og tar med seg de beste bregnene fra bakgården.',
    },
    'Martin Hale': {
        role: 'Leder for planteklinikken',
        bio: 'Martin svarer i planteklinikken for alle butikkene, og holder kursene i London.',
    },
    'Eleanor Price': {
        role: 'Butikksjef',
        bio: 'Eleanor åpnet butikken i Columbia Road i 2024, noen dører fra blomstermarkedet på søndager.',
    },
    'Priya Shah': {
        role: 'Kursansvarlig',
        bio: 'Priya planlegger kursene i London og holder kjelen varm mens de pågår.',
    },
    'Tom Ellery': {
        role: 'Butikksjef',
        bio: 'Tom åpnet butikken i North Laine i vår, mellom en platebutikk og et bakeri.',
    },
    'Grace Okafor': {
        role: 'Butikkgartner',
        bio: 'Grace steller plantene som liker sjøluft: sukkulentene, gressene og oliventrærne ved døra.',
    },
};

/**
 * The journal, with the sites each article shows on and how many days ago
 * it is dated. Every article shows on the group's site, which lists them all.
 */
export const articles: Array<{
    values: Record<string, unknown>;
    dated: number;
    written: Written;
    photo?: keyof typeof photos;
    inNorwegian?: Record<string, unknown>;
}> = [
    {
        values: {
            title: 'Winter care for houseplants',
            summary: 'Less water, more light and no radiators: how to see a houseplant through the dark months.',
            body: `Most houseplants rest from November to February. Water when the top few centimetres of soil are dry, not on a schedule, and stop feeding until the days grow longer.

Move them as close to the window as they will go, and away from radiators, which dry the air and the leaves. A tray of wet gravel under the pot helps ferns and calatheas through the heating season.`,
            showsOn: ['uk', 'norway', 'group'],
        },
        dated: 11,
        photo: 'winterCare',
        written: {
            by: una,
            daysAgo: 13,
            published: {
                by: ada,
                daysAgo: 11,
            },
        },
        inNorwegian: {
            title: 'Vinterstell av stueplanter',
            image: 'Bregner som fyller bildet i dyp skygge',
            summary: 'Mindre vann, mer lys og ingen ovner: slik kommer stueplantene gjennom de mørke månedene.',
            body: `De fleste stueplanter hviler fra november til februar. Vann når de øverste centimeterne av jorda er tørre, ikke etter timeplan, og vent med gjødsel til dagene blir lengre.

Flytt dem så nær vinduet de tåler, og bort fra ovnene, som tørker lufta og bladene. Et fat med våt grus under potta hjelper bregner og kalateaer gjennom fyringssesongen.`,
        },
    },
    {
        values: {
            title: 'Columbia Road flower market',
            summary: 'Our London shop sits a few doors from the Sunday market. When to go, and what to bring home.',
            body: `The market runs every Sunday from eight until early afternoon. Come early for the pick of the stalls, or late for the bargains as the traders pack up.

Bring a bag with a flat bottom for pots, and drop in at the shop for a care card for whatever you found.`,
            showsOn: ['uk', 'group'],
        },
        inNorwegian: {
            title: 'Blomstermarkedet i Columbia Road',
            summary: 'Butikken vår i London ligger noen dører fra søndagsmarkedet. Når du bør gå, og hva du bør ta med hjem.',
            body: `Markedet er åpent hver søndag fra åtte til tidlig på ettermiddagen. Kom tidlig for det beste utvalget, eller sent for gode kjøp når handlerne pakker sammen.

Ta med en bag med flat bunn til pottene, og stikk innom butikken for et stellekort til det du fant.`,
        },
        dated: 47,
        written: {
            by: sam,
            daysAgo: 49,
            published: {
                by: una,
                daysAgo: 47,
            },
        },
    },
    {
        values: {
            title: 'Juletrær i Oslo',
            summary: 'From the first Sunday of Advent we sell Christmas trees from Hedmarken in the courtyard on Grünerløkka.',
            body: `We fetch the trees from the grower the same week we sell them, so they keep their needles until New Year. Choose between Norway spruce, Serbian spruce and Nordmann fir.

We wrap the tree in netting and deliver it to your door in Oslo for 150 kroner.`,
            showsOn: ['norway', 'group'],
        },
        dated: 1,
        written: {
            by: kari,
            daysAgo: 3,
            published: {
                by: nils,
                daysAgo: 1,
            },
        },
        inNorwegian: {
            title: 'Juletrær i Oslo',
            summary: 'Fra første søndag i advent selger vi juletrær fra Hedmarken i bakgården på Grünerløkka.',
            body: `Vi henter trærne hos gartneren samme uke som vi selger dem, så de holder nålene til nyttår. Velg mellom vanlig gran, serbisk gran og edelgran.

Vi pakker treet i nett og leverer det på døren i Oslo for 150 kroner.`,
        },
    },
    {
        values: {
            title: 'Visiting the growers we buy from',
            summary: 'Every spring the buyers from all our shops visit the nurseries that grow our plants.',
            body: `We buy from a handful of growers in Norway, the Netherlands and Kent, and we visit each of them every season. We see how the plants are raised, and we choose next year's together.

It is why every Hagen plant comes with a care card written by the people who grew it.`,
            showsOn: ['group'],
        },
        inNorwegian: {
            title: 'Besøk hos gartnerne vi kjøper fra',
            summary: 'Hver vår besøker innkjøperne fra alle butikkene gartneriene som dyrker plantene våre.',
            body: `Vi kjøper fra en håndfull gartnere i Norge, Nederland og Kent, og vi besøker hver av dem hver sesong. Vi ser hvordan plantene vokser opp, og vi velger neste års planter sammen.

Derfor får hver plante fra Hagen med seg et stellekort skrevet av dem som dyrket den.`,
        },
        dated: 186,
        written: {
            by: ada,
            daysAgo: 188,
            published: {
                by: ada,
                daysAgo: 186,
            },
        },
    },
    {
        values: {
            title: 'Five plants for a dark flat',
            summary: 'A north-facing window still grows a jungle. Five plants that like the shade as much as you do not.',
            body: `A north-facing room gets soft, even light all day, which is what a forest floor gives. These five are happy in it: the ZZ plant, the cast iron plant, the heartleaf philodendron, the bird's nest fern and the snake plant.

Keep them within two metres of the window, water them less than you think, and turn the pot a quarter every time you do, so they grow straight.`,
            showsOn: ['uk', 'group'],
        },
        inNorwegian: {
            title: 'Fem planter for en mørk leilighet',
            summary: 'Et vindu mot nord kan fortsatt gi deg en jungel. Fem planter som liker skyggen like godt som du ikke gjør.',
            body: `Et rom mot nord får mykt, jevnt lys hele dagen, slik en skogbunn gjør. Disse fem trives i det: zamioculcas, aspidistra, filodendron, redebregne og svigermors tunge.

Hold dem innenfor to meter fra vinduet, vann dem mindre enn du tror, og vri potta en kvart omdreining hver gang du vanner, så de vokser rett.`,
        },
        dated: 22,
        written: {
            by: sam,
            daysAgo: 25,
            published: {
                by: una,
                daysAgo: 22,
            },
        },
    },
    {
        values: {
            title: 'We open in Brighton',
            summary: 'Our second shop in the UK opens in North Laine, between a record shop and a bakery.',
            body: `After a summer of plastering and painting, Hagen Brighton opens its doors at 27 Kensington Gardens. Tom Ellery runs the shop, and Grace Okafor looks after the plants that like sea air.

The plant care desk answers Brighton the same as London, and the care cards are the same too.`,
            showsOn: ['uk', 'group'],
        },
        inNorwegian: {
            title: 'Vi åpner i Brighton',
            summary: 'Den andre butikken vår i Storbritannia åpner i North Laine, mellom en platebutikk og et bakeri.',
            body: `Etter en sommer med sparkling og maling åpner Hagen Brighton dørene i 27 Kensington Gardens. Tom Ellery driver butikken, og Grace Okafor steller plantene som liker sjøluft.

Planteklinikken svarer for Brighton akkurat som for London, og stellekortene er de samme.`,
        },
        dated: 23,
        written: {
            by: una,
            daysAgo: 24,
            published: {
                by: ada,
                daysAgo: 23,
            },
        },
    },
    {
        values: {
            title: 'Fern week in Oslo and Bergen',
            summary: 'This week every fern in our Norwegian shops is a fifth off, from the smallest maidenhair to the tree ferns.',
            body: `Ferns are the plant we sell most of in Norway, and November is when they need the most help. This week every fern in Oslo, Majorstuen, Bergen and Stavanger is 20 per cent off.

Bring an old fern in for a check-up while you are there. Sigrid and Sara will look it over for free.`,
            showsOn: ['norway', 'group'],
        },
        dated: 2,
        written: {
            by: kari,
            daysAgo: 4,
            published: {
                by: nils,
                daysAgo: 2,
            },
        },
        inNorwegian: {
            title: 'Bregneuke i Oslo og Bergen',
            summary: 'Denne uka er alle bregner i butikkene våre i Norge 20 prosent billigere, fra den minste venushåren til trebregnene.',
            body: `Bregner er planten vi selger mest av i Norge, og november er måneden de trenger mest hjelp. Denne uka er alle bregner på Grünerløkka, Majorstuen, i Bergen og i Stavanger 20 prosent billigere.

Ta gjerne med en gammel bregne til sjekk mens du er innom. Sigrid og Sara ser over den gratis.`,
        },
    },
    {
        values: {
            title: 'How we pack plants for winter delivery',
            summary: 'Paper, wool and a hot water bottle in a cold week: what keeps a plant warm on its way to you.',
            body: `From November we pack every plant in paper and a sleeve of sheep's wool from a farm in Valdres, never plastic. On days below minus five we hold deliveries back rather than send a plant out to freeze.

Unpack it the day it arrives, let it stand in the box in a cool room for an hour, and then give it its place by the window.`,
            showsOn: ['uk', 'norway', 'group'],
        },
        dated: 8,
        written: {
            by: ada,
            daysAgo: 10,
            published: {
                by: ada,
                daysAgo: 8,
            },
        },
        inNorwegian: {
            title: 'Slik pakker vi planter for vinterlevering',
            summary: 'Papir, ull og en varmeflaske når det er kaldt: dette holder planten varm på vei til deg.',
            body: `Fra november pakker vi hver plante i papir og en hylse av saueull fra en gård i Valdres, aldri i plast. Når det er kaldere enn minus fem, venter vi heller med leveringen enn å sende en plante ut for å fryse.

Pakk den ut samme dag, la den stå i esken i et kjølig rom i en time, og gi den så plassen sin ved vinduet.`,
        },
    },
];

/**
 * The UK's workshops, by how many days from today each runs.
 */
export const events: Array<{ values: Record<string, unknown>; inDays: number; written: Written }> = [
    {
        values: {
            title: 'Bulbs in pots for spring',
            summary: 'Layer tulips, crocus and grape hyacinths in one pot, so it flowers from March to May on a balcony.',
            time: '10:00 to 11:30',
            price: '£30',
        },
        inDays: 7,
        written: {
            by: sam,
            daysAgo: 20,
            published: {
                by: una,
                daysAgo: 19,
            },
        },
    },
    {
        values: {
            title: 'Repotting without the mess',
            summary: 'Bring a plant that has outgrown its pot. Martin shows how to move it on, and you leave with it repotted.',
            time: '10:00 to 12:00',
            price: '£25',
        },
        inDays: 14,
        written: {
            by: una,
            daysAgo: 45,
            published: {
                by: una,
                daysAgo: 45,
            },
        },
    },
    {
        values: {
            title: 'Houseplants through the winter',
            summary: 'Light, water and heating: an hour on keeping houseplants well from November to March, with questions after.',
            time: '18:30 to 19:30',
            price: 'Free',
        },
        inDays: 28,
        written: {
            by: sam,
            daysAgo: 38,
            published: {
                by: una,
                daysAgo: 37,
            },
        },
    },
    {
        values: {
            title: 'Wreath evening',
            summary: 'Make a wreath of spruce, eucalyptus and dried hydrangea to take home. Everything is provided, mulled apple included.',
            time: '18:00 to 20:30',
            price: '£45',
        },
        inDays: 40,
        written: {
            by: una,
            daysAgo: 30,
            published: {
                by: una,
                daysAgo: 29,
            },
        },
    },
    {
        values: {
            title: 'Christmas market in the shop',
            summary:
                'Wreaths, potted firs, amaryllis and cuttings from the shop’s mother plants, with growers from Kent behind the counter.',
            time: '09:00 to 16:00',
            price: 'Free',
        },
        inDays: 50,
        written: {
            by: sam,
            daysAgo: 4,
            published: {
                by: una,
                daysAgo: 3,
            },
        },
    },
];

/**
 * A page's content and its history, under the site it belongs to. With
 * `translation`, a copy in the site's other language follows.
 */
export interface SeededPage {
    site: string;
    name: string;
    values: Record<string, unknown>;
    written: Written;
    edits?: Edit[];
    /**
     * The photo in one of its image fields, from the library `library` names,
     * or the shared one, inside the folder `folder` names.
     */
    image?: {
        field: string;
        photo: keyof typeof photos;
        library?: string;
        folder?: string;
    };
    translation?: {
        locale: string;
        values: Record<string, unknown>;
        written: Written;
    };
}

export const pages: SeededPage[] = [
    {
        site: 'group',
        name: 'frontPage',
        values: {
            heading: 'Five plant shops, one family',
            intro: 'Hagen started on Grünerløkka in Oslo in 2019. Today we run shops in Oslo, Bergen, Stavanger and London, buying from the same growers and sharing one plant care desk.',
        },
        written: {
            by: ada,
            daysAgo: 61,
            published: {
                by: ada,
                daysAgo: 61,
            },
        },
        edits: [
            {
                by: ada,
                daysAgo: 23,
                summary: 'Brighton in the intro',
                changes: {
                    heading: 'Six plant shops, one family',
                    intro: 'Hagen started on Grünerløkka in Oslo in 2019. Today we run shops in Oslo, Bergen, Stavanger, London and Brighton, buying from the same growers and sharing one plant care desk.',
                },
                publish: true,
            },
        ],
    },
    {
        site: 'group',
        name: 'aboutPage',
        values: {
            heading: 'About Hagen Group',
            body: `Hagen Group AS owns the Hagen shops in Norway and the UK. Each country runs its own shops and its own website, and the group looks after buying, plant care and the people behind them.

We buy from a handful of growers we visit every season, and every plant leaves with a care card. If it struggles anyway, the plant care desk answers the same day, whichever shop you bought it from.`,
        },
        written: {
            by: ada,
            daysAgo: 61,
            published: {
                by: ada,
                daysAgo: 61,
            },
        },
    },
    {
        site: 'group',
        name: 'historyPage',
        values: {
            heading: 'How Hagen grew',
            intro: 'One shop in a courtyard on Grünerløkka in 2019, six in two countries today.',
            body: `Ingrid Solberg opened the first Hagen in a former bicycle workshop in Markveien in April 2019, with forty plants and a borrowed till. The courtyard behind it became the garden that gave the shop its name.

Bergen followed in 2021, by Vaskerelven, and Majorstuen in 2023. In 2024 we crossed the North Sea to Columbia Road in London, a few doors from the flower market.

Stavanger opened in 2025 and Brighton this spring. Every shop still buys from the same growers, and every care card is still written by the people who grew the plant.`,
        },
        written: {
            by: ada,
            daysAgo: 35,
            published: {
                by: ada,
                daysAgo: 34,
            },
        },
    },
    {
        site: 'group',
        name: 'sustainabilityPage',
        values: {
            heading: 'Growing without the waste',
            intro: 'Peat-free soil, and paper instead of plastic.',
            body: `Every bag of soil we sell is peat-free, mixed for us from bark, coir and compost by a supplier in Telemark. We stopped selling peat in 2022, a year before we had to.

We pack in paper and wool, deliver in Oslo and London by cargo bike, and take back any plastic pot from any shop for a ten per cent discount on the next plant.`,
        },
        written: {
            by: ada,
            daysAgo: 28,
            published: {
                by: ada,
                daysAgo: 28,
            },
        },
        edits: [
            {
                by: mia,
                daysAgo: 9,
                summary: 'Pot return discount',
                changes: {
                    intro: 'Peat-free soil, paper instead of plastic, and pots that come back to us.',
                },
                publish: true,
            },
        ],
    },
    {
        site: 'group',
        name: 'careersPage',
        values: {
            heading: 'Work with plants',
            intro: 'We hire people who like plants and like people, and we teach the rest.',
            body: `We are looking for a shop gardener in Trondheim, full time from November, and weekend help in Brighton through December.

Every Hagen job starts with a week at the grower and a week in the Oslo shop. Write to jobs@hagen.example.com with a few lines about yourself and the plant you could not live without.`,
        },
        written: {
            by: ada,
            daysAgo: 16,
            published: {
                by: ada,
                daysAgo: 15,
            },
        },
    },
    {
        site: 'uk',
        name: 'frontPage',
        values: {
            heading: 'Plants that stay with you, on Columbia Road',
            intro: 'Houseplants, ferns and trees from growers we know, a few doors from the Sunday flower market. Workshops on Saturdays.',
        },
        written: {
            by: una,
            daysAgo: 59,
            published: {
                by: una,
                daysAgo: 59,
            },
        },
        edits: [
            {
                by: sam,
                daysAgo: 6,
                summary: 'Workshops line',
                changes: {
                    intro: 'Houseplants, ferns and trees from growers we know, a few doors from the Sunday flower market. Workshops most weekends.',
                },
                publish: true,
            },
        ],
    },
    {
        site: 'uk',
        name: 'eventsPage',
        values: {
            heading: 'Workshops at the London shop',
            intro: 'Small groups, an hour or two, and you take home what you make.',
        },
        written: {
            by: sam,
            daysAgo: 45,
            published: {
                by: una,
                daysAgo: 45,
            },
        },
    },
    {
        site: 'uk',
        name: 'visitPage',
        values: {
            heading: 'Visit the shop on Columbia Road',
            intro: 'A few doors from the Sunday flower market, open Tuesday to Sunday from nine.',
            body: `The shop is at 14 Columbia Road, a ten minute walk from Hoxton station. The 26, 48 and 55 buses stop on Hackney Road, two minutes away.

The shop floor is step-free, and dogs on a lead are welcome. On Sundays the market fills the street from eight, so come early or after two if you want room to look around.`,
        },
        written: {
            by: una,
            daysAgo: 42,
            published: {
                by: una,
                daysAgo: 42,
            },
        },
    },
    {
        site: 'uk',
        name: 'plantCarePage',
        values: {
            heading: 'Help for every plant we sell',
            intro: 'Every plant leaves with a care card, and the plant care desk answers the same day.',
            body: `The care card in the pot tells you where the plant likes to stand, how often to water it and when to feed it. It is written by the grower, so it is right for that plant.

If a plant struggles anyway, send a photo of it and of the soil to care@hagen.example.co.uk. Martin or someone from his desk answers the same working day, whichever shop you bought it from.`,
        },
        image: {
            field: 'image',
            photo: 'osloShop',
        },
        written: {
            by: sam,
            daysAgo: 21,
            published: {
                by: una,
                daysAgo: 20,
            },
        },
    },
    {
        site: 'uk',
        name: 'plantDoctorPage',
        values: {
            heading: 'The plant doctor comes to you',
            intro: 'For plants too big to carry in: a house call anywhere in East London.',
            body: `A first visit costs £35 within E1 to E9 and takes about forty minutes. We look at the light, the pot and the soil, and leave a written plan for the next three months.

Book a visit at the shop or by writing to care@hagen.example.co.uk. Visits run on Tuesday and Wednesday mornings.`,
        },
        written: {
            by: sam,
            daysAgo: 12,
            published: {
                by: una,
                daysAgo: 12,
            },
        },
    },
    {
        site: 'uk',
        name: 'deliveryPage',
        values: {
            heading: 'Delivery',
            intro: 'Next day in London by cargo bike, two to three days anywhere else in the UK.',
            body: `Order before two and we deliver the next day anywhere inside the North and South Circular, for £6 or free over £60.

The rest of the UK gets plants by courier in two to three working days, packed in paper and wool. Trees taller than 1.5 metres travel inside London only.`,
        },
        written: {
            by: una,
            daysAgo: 39,
            published: {
                by: una,
                daysAgo: 38,
            },
        },
    },
    {
        site: 'norway',
        name: 'frontPage',
        values: {
            heading: 'Planter som blir hos deg',
            intro: 'Stueplanter, bregner og trær fra gartnere vi kjenner, i Oslo, Bergen og Stavanger. Levert neste dag i alle tre byene.',
        },
        image: {
            field: 'hero',
            photo: 'norwayHero',
            library: 'norway',
            folder: 'Kampanjer',
        },
        written: {
            by: nils,
            daysAgo: 60,
            published: {
                by: nils,
                daysAgo: 60,
            },
        },
        translation: {
            locale: 'en',
            values: {
                heading: 'Plants that stay with you',
                intro: 'Houseplants, ferns and trees from growers we know, in Oslo, Bergen and Stavanger. Delivered the next day in all three cities.',
            },
            written: {
                by: ada,
                daysAgo: 55,
                published: {
                    by: ada,
                    daysAgo: 55,
                },
            },
        },
    },
    {
        site: 'norway',
        name: 'shopsPage',
        values: {
            heading: 'Butikkene våre',
            intro: 'Fire butikker i Oslo, Bergen og Stavanger, med de samme gartnerne og den samme planteklinikken.',
            body: `Alle butikkene våre selger de samme plantene fra de samme gartnerne, og alle planter får med seg et stellekort skrevet av den som dyrket dem.

Har du kjøpt en plante i én butikk, kan du ta den med til en annen for en sjekk. Planteklinikken svarer for alle.`,
        },
        written: {
            by: kari,
            daysAgo: 38,
            published: {
                by: nils,
                daysAgo: 37,
            },
        },
        translation: {
            locale: 'en',
            values: {
                heading: 'Our shops',
                intro: 'Four shops in Oslo, Bergen and Stavanger, with the same growers and the same plant care desk.',
                body: `Every shop sells the same plants from the same growers, and every plant comes with a care card written by whoever grew it.

Bought a plant in one shop? Bring it to another for a check-up. The plant care desk answers for all of them.`,
            },
            written: {
                by: ada,
                daysAgo: 36,
                published: {
                    by: ada,
                    daysAgo: 36,
                },
            },
        },
    },
    {
        site: 'norway',
        name: 'osloShopPage',
        values: {
            heading: 'Hagen i Oslo',
            intro: 'To butikker: den første på Grünerløkka, og den nyeste på Majorstuen.',
            body: `Den første Hagen åpnet i Markveien 38 i 2019, i et gammelt sykkelverksted med bakgård. Bakgården er der vi selger juletrær fra første søndag i advent.

På Majorstuen finner du oss i Bogstadveien 51, to minutter fra T-banen. Begge butikkene har åpent tirsdag til lørdag fra 10 til 18, og søndag fra 12 til 16.`,
        },
        image: {
            field: 'image',
            photo: 'osloShop',
        },
        written: {
            by: kari,
            daysAgo: 36,
            published: {
                by: nils,
                daysAgo: 35,
            },
        },
        translation: {
            locale: 'en',
            values: {
                heading: 'Hagen in Oslo',
                intro: 'Two shops: the first on Grünerløkka, and the newest at Majorstuen.',
                body: `The first Hagen opened at Markveien 38 in 2019, in an old bicycle workshop with a courtyard. The courtyard is where we sell Christmas trees from the first Sunday of Advent.

At Majorstuen you will find us at Bogstadveien 51, two minutes from the metro. Both shops are open Tuesday to Saturday from 10 to 18, and Sunday from 12 to 16.`,
            },
            written: {
                by: ada,
                daysAgo: 30,
                published: {
                    by: ada,
                    daysAgo: 30,
                },
            },
        },
    },
    {
        site: 'norway',
        name: 'bergenShopPage',
        values: {
            heading: 'Hagen i Bergen',
            intro: 'Ved Vaskerelven, to minutter fra Torgallmenningen.',
            body: `Butikken i Vaskerelven 8 åpnet i mars 2021. Erlend og Sigrid vet hvilke planter som tåler bergensregnet på vei hjem, og pakker resten i papir.

Vi har åpent tirsdag til lørdag fra 10 til 18. Sigrid tar hjemmebesøk for planter som er for store til å bære inn.`,
        },
        image: {
            field: 'image',
            photo: 'bergenShop',
            library: 'norway',
            folder: 'Butikkene',
        },
        written: {
            by: nils,
            daysAgo: 34,
            published: {
                by: nils,
                daysAgo: 34,
            },
        },
        translation: {
            locale: 'en',
            values: {
                heading: 'Hagen in Bergen',
                intro: 'By Vaskerelven, two minutes from Torgallmenningen.',
            },
            written: {
                by: ada,
                daysAgo: 7,
            },
        },
    },
    {
        site: 'norway',
        name: 'aboutPage',
        values: {
            heading: 'Om Hagen Norge',
            intro: 'Vi driver fire plantebutikker i Norge, og kjøper fra de samme gartnerne som butikkene i London og Brighton.',
            body: `Hagen Norge AS er en del av Hagen Group. Vi har butikker på Grünerløkka og Majorstuen i Oslo, i Bergen og i Stavanger, og leverer neste dag i alle tre byene.

Planteklinikken vår svarer på e-post samme dag, uansett hvor du kjøpte planten.`,
        },
        written: {
            by: nils,
            daysAgo: 40,
            published: {
                by: nils,
                daysAgo: 40,
            },
        },
        translation: {
            locale: 'en',
            values: {
                heading: 'About Hagen Norge',
                intro: 'We run four plant shops in Norway, and buy from the same growers as the shops in London and Brighton.',
                body: `Hagen Norge AS is part of Hagen Group. We have shops on Grünerløkka and at Majorstuen in Oslo, in Bergen and in Stavanger, and deliver the next day in all three cities.

Our plant care desk answers emails the same day, wherever you bought the plant.`,
            },
            written: {
                by: ada,
                daysAgo: 29,
                published: {
                    by: ada,
                    daysAgo: 29,
                },
            },
        },
        edits: [
            {
                by: kari,
                daysAgo: 4,
                summary: 'Nytt om Stavanger i ingressen',
                changes: {
                    intro: 'Vi driver fire plantebutikker i Norge, fra Grünerløkka til Øvre Holmegate i Stavanger, og kjøper fra de samme gartnerne som butikkene i London og Brighton.',
                },
                publish: true,
            },
        ],
    },
    {
        site: 'norway',
        name: 'historyPage',
        values: {
            heading: 'Historien om Hagen',
            intro: 'Fra én bakgård på Grünerløkka til fire butikker i tre byer.',
            body: `Ingrid Solberg åpnet den første Hagen i Markveien i april 2019, med førti planter og en lånt kasse.

Bergen kom i 2021, Majorstuen i 2023 og Stavanger i 2025. Alle butikkene kjøper fortsatt fra de samme gartnerne.`,
        },
        written: {
            by: nils,
            daysAgo: 40,
            published: {
                by: nils,
                daysAgo: 40,
            },
        },
        translation: {
            locale: 'en',
            values: {
                heading: 'The story of Hagen',
                intro: 'From one courtyard on Grünerløkka to four shops in three cities.',
                body: `Ingrid Solberg opened the first Hagen in Markveien in April 2019, with forty plants and a borrowed till.

Bergen followed in 2021, Majorstuen in 2023 and Stavanger in 2025. Every shop still buys from the same growers.`,
            },
            written: {
                by: ada,
                daysAgo: 33,
                published: {
                    by: ada,
                    daysAgo: 33,
                },
            },
        },
    },
    {
        site: 'norway',
        name: 'customerServicePage',
        values: {
            heading: 'Kundeservice',
            intro: 'Planteklinikken svarer på e-post samme dag, og på telefon fra 10 til 16 på hverdager.',
            body: `Skriv til hjelp@hagen.example.no med et bilde av planten og jorda, så svarer vi samme arbeidsdag. Ring 22 41 08 00 om det haster.

Vil du bytte eller returnere en plante, har du 14 dager på deg. Ta den med til en av butikkene, eller skriv til oss, så henter vi den.`,
        },
        written: {
            by: kari,
            daysAgo: 50,
            published: {
                by: nils,
                daysAgo: 49,
            },
        },
        translation: {
            locale: 'en',
            values: {
                heading: 'Customer service',
                intro: 'The plant care desk answers emails the same day, and the phone from 10 to 16 on weekdays.',
                body: `Write to hjelp@hagen.example.no with a photo of the plant and the soil, and we answer the same working day. Call 22 41 08 00 if it is urgent.

To exchange or return a plant you have 14 days. Bring it to one of the shops, or write to us and we will collect it.`,
            },
            written: {
                by: ada,
                daysAgo: 45,
                published: {
                    by: ada,
                    daysAgo: 45,
                },
            },
        },
    },
];

export const privacyPolicy = {
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
export const privacyPolicyInNorwegian = {
    heading: 'Personvern',
    body: `Hagen Group AS og butikkene i Storbritannia og Norge tar bare vare på det vi trenger for å svare deg, levere bestillingen din og holde kursene våre.

Når du handler hos oss, tar vi vare på navn, adresse og bestilling så lenge loven krever at vi oppbevarer kvitteringer. Når du skriver til oss, tar vi vare på samtalen i ett år, så planteklinikken ser hva vi svarte sist.

Vi selger aldri det vi vet om deg, og vi deler det bare med budene som bringer plantene og betalingstjenesten som tar imot kortet ditt.

Skriv til privacy@hagen.example.com for å se hva vi har om deg, eller for å be oss slette det.`,
};

/**
 * The alt text of each image on Hagen Norge's pages in English, which an
 * English copy keeps beside the image its Norwegian page shows.
 */
export const englishAlts: Array<{ page: string; field: string; alt: string }> = [
    {
        page: 'frontPage',
        field: 'hero',
        alt: 'A path through spruce forest',
    },
    {
        page: 'osloShopPage',
        field: 'image',
        alt: 'Close up of fern fronds unfurled in the shade',
    },
    {
        page: 'bergenShopPage',
        field: 'image',
        alt: 'Ferns filling the frame in deep shade',
    },
];

/**
 * What the Trondheim opening changes, each a draft in the release: the
 * shop's page, the shops page and the group's front page. The new shop and
 * its two people are drafts in `offices` and `employees` above.
 */
export const trondheimOpening = {
    shopPage: {
        heading: 'Hagen i Trondheim',
        intro: 'Vi åpner på Bakklandet lørdag 14. november, i Nedre Bakklandet 12.',
        body: `Den femte Hagen i Norge ligger i en gammel kolonialbutikk ved Gamle Bybro. Kristian Moe driver butikken, og Hanna Lie tar med seg de beste bregnene fra bakgården på Grünerløkka.

De første hundre som kommer på åpningsdagen, får med seg en stikling av monsteraen vår. Vi har åpent tirsdag til lørdag fra 10 til 18.`,
    },
    shopsPage: {
        intro: 'Fem butikker i Oslo, Bergen, Stavanger og Trondheim, med de samme gartnerne og den samme planteklinikken.',
    },
    groupFrontPage: {
        heading: 'Seven plant shops, one family',
        intro: 'Hagen started on Grünerløkka in Oslo in 2019. Today we run shops in Oslo, Bergen, Stavanger, Trondheim, London and Brighton, buying from the same growers and sharing one plant care desk.',
    },
};

/**
 * Hagen Norge's front page for the winter, which Mia asks Nils to review.
 */
export const norwayWinterFrontPage = {
    changes: {
        heading: 'Juletrær, kranser og bregner som tåler vinteren',
        intro: 'Fra første søndag i advent selger vi juletrær i bakgården på Grünerløkka. Stueplanter, bregner og trær fra gartnere vi kjenner, levert neste dag i Oslo, Bergen og Stavanger.',
    },
    note: 'Ny vintertekst og nytt bilde før julekampanjen. Kan du se over ingressen før vi sender nyhetsbrevet?',
};

/**
 * Kari's longer history of Hagen Norge, which Nils sends back.
 */
export const norwayHistoryDraft = {
    changes: {
        body: `Ingrid Solberg åpnet den første Hagen i Markveien i april 2019, med førti planter og en lånt kasse. Bakgården bak butikken ble hagen som ga butikken navnet.

Bergen kom i 2020, ved Vaskerelven. Majorstuen åpnet i 2023, og Stavanger i 2025, i den gamle fiskebutikken med den grønne døra i Øvre Holmegate.

Alle butikkene kjøper fortsatt fra de samme gartnerne, og alle stellekort skrives av dem som dyrket planten.`,
    },
    requestNote: 'Lengre historie med Stavanger og bakgården. Si fra om noe er feil!',
    decisionNote: 'Fin tekst, men årstallet for Bergen stemmer ikke. Rett det, så godkjenner jeg.',
    comment: 'Bergen åpnet i mars 2021, ikke 2020.',
};

/**
 * Christmas opening hours on the customer service page, which Nils schedules
 * to publish tomorrow morning.
 */
export const christmasOpeningHours = {
    intro: 'Planteklinikken svarer på e-post samme dag, og på telefon fra 10 til 16 på hverdager. I desember har butikkene utvidet åpningstid.',
    body: `Skriv til hjelp@hagen.example.no med et bilde av planten og jorda, så svarer vi samme arbeidsdag. Ring 22 41 08 00 om det haster.

I desember har alle butikkene åpent hver dag fra 10 til 20, og søndager fra 12 til 18. Julaften stenger vi klokka 13, og vi åpner igjen 27. desember.

Vil du bytte eller returnere en plante, har du 14 dager på deg. Julegaver kjøpt i desember kan byttes til og med 15. januar.`,
};

/**
 * The newsletter: two issues already sent, and the Christmas issue, which
 * waits for Mia's review before it publishes next week.
 */
export const newsletters = [
    {
        values: {
            subject: 'Bulbs to plant before the frost',
            preheader: 'Tulips, crocus and a pot that flowers from March to May.',
            body: `Bulbs need a long cold spell to flower, which is why they go in now and not in spring. As long as you can push a trowel into the soil, it is not too late.

## Three to plant this week

- Tulip 'Ballerina', orange and scented
- Crocus tommasinianus, the first flower of the year
- Grape hyacinths, for the front of a pot

Read more about layering bulbs in one pot in [the journal](/journal).`,
        },
        written: {
            by: kari,
            daysAgo: 37,
        },
        approvedBy: ada,
        approvedDaysAgo: 35,
        inNorwegian: {
            subject: 'Løker å plante før frosten',
            preheader: 'Tulipaner, krokus og en potte som blomstrer fra mars til mai.',
            body: `Løker trenger en lang, kald periode for å blomstre, og derfor skal de i jorda nå og ikke om våren. Så lenge du får stukket en planteskje i jorda, er det ikke for sent.

## Tre å plante denne uka

- Tulipan «Ballerina», oransje og duftende
- Snøkrokus, årets første blomst
- Perleblomst, foran i potta

Les mer om å plante løker i lag i én potte i [journalen](/journal).`,
        },
    },
    {
        values: {
            subject: 'The dark months, and how your plants get through them',
            preheader: 'Less water, more light, and a new shop in Brighton.',
            body: `Most houseplants rest from November to February. Water when the top of the soil is dry, move them close to the window, and keep them away from the radiator.

## New this month

- Hagen Brighton is open in North Laine
- Fern week in Oslo, Bergen and Stavanger
- Workshops in London every Saturday until Christmas

Our winter care guide is in [the journal](/journal), with a page for every plant we sell.`,
        },
        written: {
            by: kari,
            daysAgo: 16,
        },
        approvedBy: ada,
        approvedDaysAgo: 14,
        inNorwegian: {
            subject: 'De mørke månedene, og hvordan plantene kommer seg gjennom dem',
            preheader: 'Mindre vann, mer lys, og en ny butikk i Brighton.',
            body: `De fleste stueplanter hviler fra november til februar. Vann når toppen av jorda er tørr, flytt dem nær vinduet, og hold dem unna ovnen.

## Nytt denne måneden

- Hagen Brighton har åpnet i North Laine
- Bregneuke i Oslo, Bergen og Stavanger
- Kurs i London hver lørdag fram til jul

Vinterguiden vår ligger i [journalen](/journal), med en side for hver plante vi selger.`,
        },
    },
];

export const christmasNewsletter = {
    values: {
        subject: 'Wreaths, trees and the last day to order before Christmas',
        preheader: 'Christmas trees from Hedmarken, wreath evenings and our December hours.',
        body: `From the first Sunday of Advent the courtyard on Grünerløkka fills with Christmas trees from Hedmarken, and the London shop with wreaths from Kent.

@plants Nordmann fir, 180 cm; Boston fern

## Before you order

- The last day for delivery before Christmas is 20 December
- Every shop opens late through December
- Trees are delivered in Oslo for 150 kroner

How to keep a cut tree fresh until New Year is in [the journal](/journal).

@article Winter care for houseplants`,
    },
    note: 'Julenummeret. Kan du lese gjennom før det går ut tirsdag morgen?',
};

/**
 * Claude's winter care refresh, asked for by Mia: new copy on the UK's plant
 * care page and the winter care article, in a release that waits for her
 * review.
 */
export const winterCareRefresh = {
    release: 'Agent: winter care refresh',
    summary: 'Winter care refresh',
    note: 'Updated the plant care page and the winter care article for the dark months. Opening hours and contact details are as they were.',
    plantCarePage: {
        intro: 'Every plant leaves with a care card, and in winter the plant care desk answers the same day, light questions first.',
    },
    article: {
        summary: 'Less water, more light and a step back from the radiator: how to see a houseplant through the dark months.',
    },
};

/**
 * Links a seeded page holds to other pages, by ref, added once to a page
 * that has none: rich text written as markup under `text`, or a list of
 * links under `links`.
 */
export interface SeededLinks {
    site: string;
    name: string;
    locale?: string;
    field: string;
    by: string;
    daysAgo: number;
    text?: string;
    links?: Array<{ ref?: string; href?: string; label: string }>;
}

export const pageLinks: SeededLinks[] = [
    {
        site: 'norway',
        name: 'frontPage',
        field: 'body',
        by: nils,
        daysAgo: 4,
        text: `Se [alle butikkene våre](page:norway:shopsPage), med åpningstider og adresser.

Lurer du på hvordan du holder liv i en fiolinfiken gjennom vinteren? Hagen UK har samlet det de vet om [plantestell](page:uk:plantCarePage), og [plantelegen](page:uk:plantDoctorPage) svarer på spørsmål samme dag.

Snart åpner vi i [Trondheim](page:norway:trondheimShopPage).`,
    },
    {
        site: 'norway',
        name: 'frontPage',
        locale: 'en',
        field: 'body',
        by: ada,
        daysAgo: 4,
        text: `See [all our shops](page:norway:shopsPage), with opening hours and addresses.

Wondering how to keep a fiddle-leaf fig going through the winter? Hagen UK has gathered what they know about [plant care](page:uk:plantCarePage), and [the plant doctor](page:uk:plantDoctorPage) answers questions the same day.

We open in [Trondheim](page:norway:trondheimShopPage) soon.`,
    },
    {
        site: 'uk',
        name: 'deliveryPage',
        field: 'related',
        by: una,
        daysAgo: 4,
        links: [
            {
                ref: 'page:group:sustainabilityPage',
                label: 'How we deliver with less packaging',
            },
            {
                ref: 'page:uk:plantCarePage',
                label: 'Plant care',
            },
        ],
    },
    {
        site: 'group',
        name: 'careersPage',
        field: 'related',
        by: ada,
        daysAgo: 4,
        links: [
            {
                ref: 'page:norway:aboutPage',
                label: 'Om Hagen Norge',
            },
            {
                ref: 'page:uk:visitPage',
                label: 'Visit the London shop',
            },
        ],
    },
];

/**
 * The group site's footer: each country's front page, careers, and the
 * privacy policy, which is a route of the app's own.
 */
export const groupFooter = [
    {
        ref: 'page:uk:frontPage',
        label: 'Hagen UK',
    },
    {
        ref: 'page:norway:frontPage',
        label: 'Hagen Norge',
    },
    {
        ref: 'page:group:careersPage',
        label: 'Careers',
    },
    {
        href: '/privacy',
        label: 'Privacy policy',
    },
];
