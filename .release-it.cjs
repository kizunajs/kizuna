/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable no-undef */
const { capBumpAtMinor, getTypes, ignoreReleaseCommits } = require('./tools/release-shared.cjs');

const allowsMajor = process.env.RELEASE_MAJOR === '1';

const commitUrl = '{{~@root.host}}/{{@root.owner}}/{{@root.repository}}/commit/{{commit.hash}}';

const mainTemplate = `{{> header}}
{{#if noteGroups}}
{{#each noteGroups}}

### ⚠ {{title}}

{{#each notes}}
* {{#if commit.scope}}**{{commit.scope}}:** {{/if}}{{text}} ([{{commit.shortHash}}](${commitUrl}))
{{/each}}
{{/each}}
{{/if}}
{{#each commitGroups}}

{{#if title}}
### {{title}}

{{/if}}
{{#each commits}}
{{> commit root=@root}}
{{/each}}
{{/each}}
{{> footer}}
`;

module.exports = {
    git: {
        commit: true,
        commitMessage: 'chore: release v${version}',
        push: true,
        tag: true,
        tagName: 'v${version}',
        tagMatch: 'v[0-9]*',
        requireCleanWorkingDir: false,
        requireUpstream: false,
    },
    github: {
        release: true,
        releaseName: 'v${version}',
    },
    npm: {
        publish: false,
    },
    hooks: {
        'after:bump':
            'node tools/sync-versions.cjs && git add package.json packages/*/package.json README.md packages/core/README.md docs/src/lib/site.ts',
        'after:release': 'node tools/publish.cjs',
    },
    plugins: {
        '@release-it/conventional-changelog': {
            preset: {
                name: 'conventionalcommits',
                types: getTypes(),
            },
            ...(allowsMajor ? {} : { whatBump: capBumpAtMinor }),
            gitRawCommitsOpts: {
                ignore: ignoreReleaseCommits,
            },
            writerOpts: {
                mainTemplate,
                headerPartial:
                    '## [{{version}}]({{~@root.host}}/{{@root.owner}}/{{@root.repository}}/compare/{{previousTag}}...v{{version}})\n',
            },
        },
    },
};
