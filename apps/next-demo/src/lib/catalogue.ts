/**
 * What the shop sells. The products route serves these, and pages add what
 * the API leaves out: each plant's botanical name, its pot or pack, and a
 * photo from `public/products` where the shop has one.
 */
export const catalogue: Array<{
    id: string;
    name: string;
    botanicalName: string;
    size: string;
    price: number;
    photo?: string;
}> = [
    {
        id: 'prod_boston_fern',
        name: 'Boston fern',
        botanicalName: 'Nephrolepis exaltata',
        size: '17 cm pot',
        price: 249,
        photo: '/products/boston-fern.jpg',
    },
    {
        id: 'prod_lady_fern',
        name: 'Lady fern',
        botanicalName: 'Athyrium filix-femina',
        size: '2 litre pot, hardy',
        price: 189,
        photo: '/products/lady-fern.jpg',
    },
    {
        id: 'prod_japanese_cherry',
        name: 'Japanese cherry',
        botanicalName: 'Prunus serrulata',
        size: '120 cm, bare root',
        price: 1290,
        photo: '/products/japanese-cherry.jpg',
    },
    {
        id: 'prod_woodland_ferns',
        name: 'Woodland fern set',
        botanicalName: 'Dryopteris, Athyrium and Polystichum',
        size: 'Three plants for a shady bed',
        price: 449,
        photo: '/products/woodland-ferns.jpg',
    },
    {
        id: 'prod_wildflower_seeds',
        name: 'Meadow seed mix',
        botanicalName: 'Papaver, Centaurea and Leucanthemum',
        size: 'Sows 5 m²',
        price: 59,
    },
    {
        id: 'prod_snake_plant',
        name: 'Snake plant',
        botanicalName: 'Dracaena trifasciata',
        size: '21 cm pot',
        price: 329,
    },
    {
        id: 'prod_pothos',
        name: 'Golden pothos',
        botanicalName: 'Epipremnum aureum',
        size: '12 cm pot, trailing',
        price: 199,
    },
    {
        id: 'prod_tulips',
        name: 'Tulip bulbs',
        botanicalName: 'Tulipa',
        size: 'Bag of 20',
        price: 149,
    },
    {
        id: 'prod_hyacinth',
        name: 'Hyacinth in a clay pot',
        botanicalName: 'Hyacinthus orientalis',
        size: '3 bulbs, ready to flower',
        price: 179,
    },
];

export const catalogueEntry = (id: string) => catalogue.find((entry) => entry.id === id);
