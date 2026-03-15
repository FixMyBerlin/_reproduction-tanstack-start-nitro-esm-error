# Nitro server build missing `platform: "node"` → CJS `__esModule` interop crash

Minimal reproduction for a Nitro bug where the server build generates incorrect
CJS-to-ESM interop code, causing a runtime `TypeError` when bundling packages
that depend on `tslib` (or any CJS module that sets `__esModule: true` without
providing a `.default` export).

## Environment

| Package | Version |
|---|---|
| nitro | `3.0.1-20260227-142232-5ccf672a` (nitro-nightly) |
| vite | `8.0.0` |
| rolldown | `1.0.0-rc.9` |
| nf3 | `0.3.10` |
| @tanstack/react-start | `1.166.11` |
| @aws-sdk/client-s3 | `3.1009.0` |
| bun | `1.3.10` |
| node | `24.12.0` |
| OS | macOS (darwin arm64) |

## Reproduction

```bash
git clone git@github.com:FixMyBerlin/_reproduction-tanstack-start-nitro-esm-error.git
cd _reproduction-tanstack-start-nitro-esm-error
bun install
bun run build

# Verify the bug exists in the built output:
cd .output/server
bun -e "import('./_libs/@aws-crypto/crc32+[...].mjs').then(() => console.log('OK')).catch(e => console.error(e.message, '\n', e.stack))"

# Or start the server and visit http://localhost:3000 — the page shows "Something went wrong!":
cd ../..
bun .output/server/index.mjs
```

**Expected**: Page renders `S3Client loaded: function`
**Actual**: Runtime crash from the server-bundled `@aws-crypto/crc32` chunk:

```
TypeError: Cannot destructure property '__extends' from null or undefined value
    at .output/server/_libs/@aws-crypto/crc32+[...].mjs:560
```

## Describe the bug

### What happens

Nitro's server build (via Rolldown) generates incorrect CJS-to-ESM interop for
modules whose CommonJS `exports` object sets `__esModule: true` **without**
explicitly providing `exports.default`.

The most common trigger is **`tslib`**, which is a UMD/CJS module that sets
`Object.defineProperty(exports, "__esModule", { value: true })` but has no
`exports.default`. It is a transitive dependency of `@aws-crypto/*` (used by
`@aws-sdk/client-s3`).

### Root cause

Rolldown's `__toESM` helper has this logic:

```javascript
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

When `isNodeMode` is `true` (or when `__esModule` is absent), `__toESM` always
creates a synthetic `.default` property pointing to the original module. But when
`isNodeMode` is **falsy** and `__esModule` is `true`, it assumes the module
already provides its own `.default` — which `tslib` does not.

Rolldown sets `isNodeMode = 1` when `platform: "node"` is configured. **Nitro's
server build never sets `platform: "node"` in its Rolldown config**, so
`isNodeMode` is always `undefined`. This causes `__toESM` to skip the synthetic
`.default` for `tslib`, but the generated code expects it:

```javascript
// Generated in .output/server/_libs/@aws-crypto/crc32+[...].mjs:
var { __extends, __assign, ... } = (/* @__PURE__ */ __toESM(require_tslib())).default;
//                                                                            ^^^^^^^^ undefined!
```

### Where the bug is

In Nitro's `vite.mjs` → `getBundlerConfig()`, the `rolldownConfig` object never
includes `platform: "node"`. Since the server build targets Node.js/Bun (not the
browser), it should set `platform: "node"`.

The relevant code path is approximately:

```javascript
// nitro/dist/vite.mjs — getBundlerConfig()
const rolldownConfig = defu({
  transform: { inject: base.env.inject },
  output: { ... }
}, nitro.options.rolldownConfig, nitro.options.rollupConfig, commonConfig);
// ↑ No `platform: "node"` anywhere in this chain
```

### Note on nf3 0.3.11+ masking the bug

In `nf3@0.3.11`, `tslib` was added to the `NonBundleablePackages` list, so
Nitro's dep-tracing auto-externalizes it. This prevents the bug from manifesting
for `tslib` specifically, but **the root cause remains**: any other CJS module
with `__esModule: true` and no `.default` will still trigger the same crash.

To reproduce with the latest nf3, set `noExternals: true` in the Nitro config
(as this repo does), or pin `nf3@0.3.10`.

## Additional context

- **Workaround**: Externalize the affected packages in `vite.config.ts`:
  ```typescript
  nitro({
    preset: 'bun',
    rolldownConfig: {
      external: ['@aws-sdk/client-s3', /^@aws-crypto\//, /^@smithy\//],
    },
  })
  ```

- **Expected fix**: Nitro should pass `platform: "node"` in its Rolldown config
  for server builds. This makes `__toESM` generate `__toESM(x, 1)` which always
  adds the synthetic `.default`, matching Node.js/Bun CJS interop semantics.

- Rolldown itself behaves correctly — it respects `platform: "node"` when told.
  The issue is that Nitro doesn't pass this option.

- The `platform: "node"` setting is correct even when targeting Bun, as Bun
  implements the Node.js module system and CJS interop.

## Logs

```
TypeError: Cannot destructure property '__extends' from null or undefined value
    at .output/server/_libs/@aws-crypto/crc32+[...].mjs:560:552
    at moduleEvaluation (native:1:11)
    at requestImportModule (native:2)
```
