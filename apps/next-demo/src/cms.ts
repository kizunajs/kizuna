import { createCms } from '@kizunajs/cms/next';
import kizuna from '../kizuna.config';

/**
 * The typed reader server components use: `cms.pages.springPage.get()`.
 */
export const cms = createCms(kizuna.api);
