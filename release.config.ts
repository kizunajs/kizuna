import { defineConfig } from '@kizunajs/release';
import writeReadmeVersion from './tools/write-readme-version.ts';

export default defineConfig({
    releaseEveryCommit: true,
    afterBump: [writeReadmeVersion],
});
