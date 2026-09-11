/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable no-undef */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const extensionDirectory = path.join(root, 'packages', 'vscode');
const pluginDirectory = path.join(root, 'packages', 'typescript-plugin');
const stagingDirectory = path.join(root, 'build', 'vscode');

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const run = (command, commandArguments, cwd) =>
    execFileSync(command, commandArguments, {
        cwd,
        stdio: 'inherit',
    });

const plugin = readJson(path.join(pluginDirectory, 'package.json'));

// `npm ls`, which vsce runs, fails on the plugin's workspace symlink.
const stage = () => {
    const extension = readJson(path.join(extensionDirectory, 'package.json'));

    fs.rmSync(stagingDirectory, { recursive: true, force: true });
    fs.mkdirSync(stagingDirectory, { recursive: true });

    for (const name of ['README.md', 'icon.png']) {
        fs.copyFileSync(path.join(extensionDirectory, name), path.join(stagingDirectory, name));
    }
    fs.copyFileSync(path.join(root, 'LICENSE.MD'), path.join(stagingDirectory, 'LICENSE.MD'));

    delete extension.private;
    extension.dependencies = {
        [plugin.name]: plugin.version,
    };

    fs.writeFileSync(path.join(stagingDirectory, 'package.json'), JSON.stringify(extension, null, 2) + '\n');

    // vsce warns when the file is missing.
    fs.writeFileSync(path.join(stagingDirectory, '.vscodeignore'), '# Nothing to ignore.\n');

    return extension.version;
};

// npm serves a new version a minute or two after `pnpm publish` returns, so installing the
// plugin by version races the release that just published it.
const copyPlugin = () => {
    const distributionDirectory = path.join(pluginDirectory, 'dist');
    if (!fs.existsSync(distributionDirectory)) {
        throw new Error(`${plugin.name} is not built. Run: pnpm --filter ${plugin.name} build`);
    }

    const destination = path.join(stagingDirectory, 'node_modules', plugin.name);
    fs.mkdirSync(destination, { recursive: true });
    fs.cpSync(distributionDirectory, path.join(destination, 'dist'), { recursive: true });
    fs.copyFileSync(path.join(pluginDirectory, 'package.json'), path.join(destination, 'package.json'));
};

const assertPluginPackaged = (version) => {
    const vsix = path.join(stagingDirectory, `ts-kizuna-vscode-${version}.vsix`);
    const listing = execFileSync('unzip', ['-l', vsix], { encoding: 'utf8' });
    if (!listing.includes('typescript-plugin/dist/index.cjs')) {
        throw new Error(`${vsix} carries no plugin. The extension contributes one by name, so it would install and do nothing.`);
    }
    return vsix;
};

const version = stage();
copyPlugin();
run('npx', ['@vscode/vsce', 'package'], stagingDirectory);
const vsix = assertPluginPackaged(version);

console.log(`Packaged ${path.relative(root, vsix)} with the plugin inside`);
