import { definePage } from '@kizunajs/cms';
import { Articles } from '../../../cms/content';

/**
 * Each article at its slug: `[slug]` reads the article's `slug` field.
 */
export default definePage({
    name: 'articlePage',
    collection: Articles,
});
