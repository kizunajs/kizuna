import { ArrowLeftRight, Blocks, FileText, Globe, ImageIcon, Library, Link2, Pilcrow, UserCheck } from 'lucide-react';
import type { Feature } from './features';

export const cmsFeatures: Feature[] = [
    {
        icons: [FileText],
        title: 'Pages',
        href: '/docs/cms/content#pages',
        description: 'A content.ts beside each route lists what editors may change.',
    },
    {
        icons: [Globe],
        title: 'Globals',
        href: '/docs/cms/content#globals',
        description: 'Content every page shows, like the footer or contact details, kept as one copy.',
    },
    {
        icons: [Library],
        title: 'Collections',
        href: '/docs/cms/content#collections',
        description: 'Many items of one shape, like articles or team members, each with its own id.',
    },
    {
        icons: [Blocks],
        title: 'Blocks',
        href: '/docs/cms/content#blocks',
        description: 'A set of fields several pages share, like a hero, with its rules wherever it goes.',
    },
    {
        icons: [Pilcrow],
        title: 'Rich text',
        href: '/docs/cms/content#rich-text',
        description: 'Headings, lists, links and images as Portable Text, which never holds HTML.',
    },
    {
        icons: [ImageIcon],
        title: 'Images',
        href: '/docs/cms/content#images',
        description: 'Upload, crop, focal point and alt text for each use, with location data stripped.',
    },
    {
        icons: [Link2],
        title: 'Relationships',
        href: '/docs/cms/content#relationships',
        description: 'Pick products from your own API or Stripe. The page holds their ids.',
    },
    {
        icons: [UserCheck],
        title: 'Reviews',
        href: '/docs/cms/reviews',
        description: 'Ask a colleague to look before a page goes live, and name who owns each page.',
    },
    {
        icons: [ArrowLeftRight],
        title: 'Environments',
        href: '/docs/cms/cli#environments',
        description: 'Copy drafts between local, staging and production with kizuna cms push and pull.',
    },
];
