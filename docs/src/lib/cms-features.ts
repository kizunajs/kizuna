import {
    ArrowLeftRight,
    Blocks,
    FileText,
    Globe,
    ImageIcon,
    Languages,
    Library,
    Link2,
    Network,
    Pilcrow,
    Search,
    UserCheck,
} from 'lucide-react';
import type { Feature } from './features';

export const cmsFeatures: Feature[] = [
    {
        icons: [FileText],
        title: 'Pages',
        href: '/docs/cms/pages',
        description: 'A content.ts beside each route lists what editors may change.',
    },
    {
        icons: [Globe],
        title: 'Globals',
        href: '/docs/cms/globals',
        description: 'Content every page shows, like the footer or contact details, kept as one copy.',
    },
    {
        icons: [Library],
        title: 'Collections',
        href: '/docs/cms/collections',
        description: 'Many items of one shape, like articles or team members, each with its own id.',
    },
    {
        icons: [Blocks],
        title: 'Blocks',
        href: '/docs/cms/blocks',
        description: 'A set of fields several pages share, like a hero, with its rules wherever it goes.',
    },
    {
        icons: [Pilcrow],
        title: 'Rich text',
        href: '/docs/cms/rich-text',
        description: 'Headings, lists, links and images as Portable Text, which never holds HTML.',
    },
    {
        icons: [ImageIcon],
        title: 'Images',
        href: '/docs/cms/rich-text#images',
        description: 'Upload, crop, focal point and alt text for each use, with location data stripped.',
    },
    {
        icons: [Link2],
        title: 'Relationships',
        href: '/docs/cms/relationships',
        description: 'Pick products from your own API or Stripe. The page holds their ids.',
    },
    {
        icons: [UserCheck],
        title: 'Reviews',
        href: '/docs/cms/reviews',
        description: 'Ask a colleague to look before a page goes live, and name who owns each page.',
    },
    {
        icons: [Languages],
        title: 'Localization',
        href: '/docs/cms/localization',
        description: 'Every page in every language the site serves, published one language at a time.',
    },
    {
        icons: [Network],
        title: 'Sites',
        href: '/docs/cms/sites',
        description: 'Content every site reads, written once, and each site’s own content beside it.',
    },
    {
        icons: [Search],
        title: 'SEO',
        href: '/docs/cms/seo',
        description: 'Titles joined in one place, structured data from the fields, and addresses that last.',
    },
    {
        icons: [ArrowLeftRight],
        title: 'Environments',
        href: '/docs/cms/cli#environments',
        description: 'Copy drafts between local, staging and production with kizuna cms push and pull.',
    },
];
