import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateOpenApi } from '@ts-kizuna/openapi';
import kizuna from '../kizuna.config';

const spec = generateOpenApi(kizuna.api);

const target = resolve(process.cwd(), 'openapi.yaml');
writeFileSync(target, spec('yaml'));

console.log(`Wrote ${target}`);
