/**
 * What the countries app says around the content, in each site's language,
 * and under `<site>:<locale>` in a site's other languages.
 */
export const words = {
    uk: {
        shops: 'Shops',
        events: 'Events',
        journal: 'Journal',
        fromTheShops: 'From the London shop',
        ourShops: 'Our shops',
        whereToFind: 'Where to find us',
        upcoming: 'Coming up at the London shop',
        allEvents: 'All workshops',
        privacy: 'Privacy policy',
        lastUpdated: 'Last updated',
        group: 'Hagen Group',
        about: '',
        shopPages: '',
        help: 'Delivery',
        care: 'Plant care',
        visit: 'Visit the shop',
    },
    norway: {
        shops: 'Butikker',
        events: 'Arrangementer',
        journal: 'Journal',
        fromTheShops: 'Fra butikkene i Oslo og Bergen',
        ourShops: 'Butikkene våre',
        whereToFind: 'Her finner du oss',
        upcoming: '',
        allEvents: '',
        privacy: 'Personvern',
        lastUpdated: 'Sist oppdatert',
        group: 'Hagen Group',
        about: 'Om oss',
        shopPages: 'Butikkene',
        help: 'Kundeservice',
        care: '',
        visit: '',
    },
    'norway:en': {
        shops: 'Shops',
        events: 'Events',
        journal: 'Journal',
        fromTheShops: 'From the shops in Oslo and Bergen',
        ourShops: 'Our shops',
        whereToFind: 'Where to find us',
        upcoming: '',
        allEvents: '',
        privacy: 'Privacy policy',
        lastUpdated: 'Last updated',
        group: 'Hagen Group',
        about: 'About us',
        shopPages: 'The shops',
        help: 'Customer service',
        care: '',
        visit: '',
    },
};

/**
 * What the app says on a site, in a language it serves.
 */
export const wordsOf = (site: 'uk' | 'norway', locale: string) => words[`${site}:${locale}` as keyof typeof words] ?? words[site];
