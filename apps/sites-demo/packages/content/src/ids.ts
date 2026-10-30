import { z } from 'zod';
import { Kizuna } from 'kizunajs';

/**
 * Someone at Hagen, an item of the shared employees collection.
 */
export const EmployeeId = Kizuna.brand('EmployeeId', z.string());

/**
 * One of Hagen's shops, an item of the shared offices collection.
 */
export const OfficeId = Kizuna.brand('OfficeId', z.string());

/**
 * A workshop or open day the UK runs, an item of its own events collection.
 */
export const EventId = Kizuna.brand('EventId', z.string());

/**
 * A post in Hagen's journal, an item of the shared articles collection.
 */
export const ArticleId = Kizuna.brand('ArticleId', z.string());
