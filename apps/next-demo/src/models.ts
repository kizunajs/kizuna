import { z } from 'zod';
import { Kizuna } from 'kizunajs';

// The ids both APIs use. The app API serves products, the CMS API stores
// employees and articles, and pages on either side reference all three.

/**
 * A product in the shop. Branded, so a page that lists products stores ids
 * the CMS can index and check.
 */
export const ProductId = Kizuna.brand('ProductId', z.string());

/**
 * Someone on the team, an item of the employees collection. Branded, so pages
 * reference people by id.
 */
export const EmployeeId = Kizuna.brand('EmployeeId', z.string());

/**
 * An article, an item of the articles collection. Branded, so pages feature
 * articles by id.
 */
export const ArticleId = Kizuna.brand('ArticleId', z.string());
