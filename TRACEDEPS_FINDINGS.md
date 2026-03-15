# Findings: Nitro `traceDeps: ['@aws-crypto/crc32']`

## What this config means

From Nitro config docs, `traceDeps` is for **additional dependencies to trace and include in the build output**.

In this reproduction, Nitro config now includes:

- `noExternals: true`
- `traceDeps: ['@aws-crypto/crc32']`

Because `noExternals: true` already bundles all dependencies, `traceDeps` is expected to have little or no additional effect in this specific setup.

## Change made

Updated `vite.config.ts`:

```ts
nitro({
  preset: 'bun',
  noExternals: true,
  traceDeps: ['@aws-crypto/crc32'],
})
```

## Verification steps run

1. `bun run build`
2. `bun -e "import('./.output/server/_libs/@aws-crypto/crc32+[...].mjs').then(() => console.log('OK')).catch(e => { console.error(e.message); console.error(e.stack); process.exit(1); })"`

## Observed result

The same runtime error still occurs after adding `traceDeps`:

```txt
Cannot destructure property '__extends' from null or undefined value
TypeError: Cannot destructure property '__extends' from null or undefined value
    at .output/server/_libs/@aws-crypto/crc32+[...].mjs:560:552
```

## What this helped localize

Adding `traceDeps` did provide useful debugging signal by making the problematic dependency an explicit traced target and confirming the crash is inside the generated server chunk for that package (not app code).

The failing generated line is:

```js
var { __extends, ... } = (/* @__PURE__ */ __toESM(require_tslib())).default;
```

In the same build output, Rolldown's runtime helper is:

```js
var __toESM = (mod, isNodeMode, target) => (
  target = mod != null ? __create(__getProtoOf(mod)) : {},
  __copyProps(
    isNodeMode || !mod || !mod.__esModule
      ? __defProp(target, "default", { value: mod, enumerable: true })
      : target,
    mod
  )
);
```

Because this call site is `__toESM(require_tslib())` (no second `isNodeMode` argument), modules like `tslib` that set `__esModule: true` but do not provide a `default` export can produce `(...).default === undefined`, which matches the observed destructuring crash.

So the practical localization is:

- failing artifact: `.output/server/_libs/@aws-crypto/crc32+[...].mjs`
- exact failure site: destructure from `__toESM(require_tslib()).default`
- likely cause area: Nitro/Rolldown server bundler interop mode selection (node-mode flagging for CJS->ESM interop)

## Conclusion

Adding `traceDeps: ['@aws-crypto/crc32']` does **not** fix this reproduction.

This is consistent with the current repro conditions (`noExternals: true`), where the problematic dependency is already bundled; the underlying interop issue in generated server output remains unchanged.
