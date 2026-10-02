import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

/**
 * An in-memory Postgres for the CMS plugin, so the demo installs every
 * first-party plugin without a database server. The Next demo is where the CMS
 * has pages; here it only serves the plugin.
 */
export const cmsDatabase = drizzle(new PGlite());
