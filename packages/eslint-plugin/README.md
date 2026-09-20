# @kizunajs/eslint-plugin

`@kizunajs/eslint-plugin` catches Kizuna mistakes in your editor, as you type. These are things the type system cannot express on its own.

## Installation

```sh
pnpm add -D @kizunajs/eslint-plugin
```

## Usage

Add the recommended config to your `eslint.config.js`:

```js
import kizuna from '@kizunajs/eslint-plugin';

export default [kizuna.configs.recommended];
```

## Documentation

[ESLint plugin](https://kizunajs.com/docs/eslint)
