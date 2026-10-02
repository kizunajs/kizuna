import { createCms } from '@kizunajs/cms/next';
import kizuna from '../kizuna.cms.config';

/**
 * The typed reader server components use: `cms.pages.frontPage.get()`.
 */
export const cms = createCms(kizuna.api);
