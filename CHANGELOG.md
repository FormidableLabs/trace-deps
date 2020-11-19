Changes
=======

## UNRELEASED

* Feature: Add `sourceMaps` parameter with support for source map file inclusion.

## 0.3.5

* Feature: Add `trace-deps` CLI.
* Feature: Add `bailOnMissing` parameter to `traceFile`/`traceFiles`.
* Feature: Add `dep` and `type` fields to `misses` array values returned by `traceFile`/`traceFiles`.

## 0.3.4

* Bug: Handle non-`.js|mjs|json` extensions in JS files and parse when directly included. (E.g, `require('./url-alphabet/index.cjs')`).
* Internal: Misc dependency updates.

## 0.3.3

* Feature: Add `extraImports` parameter to `traceFile`/`traceFiles`.

## 0.3.2

* Feature/Bug: More permissively parse JS code using `module` Acorn type first, with fallback to `script`.

## 0.3.1

* Chore: Minor internal refactor.

## 0.3.0

**Breaking**

* Feature: Change `traceFile|traceFiles` return object shape to `{ dependencies, misses }` to include imports that cannot be traced.
  [#25](https://github.com/FormidableLabs/trace-deps/issues/25)

**Features**

* Feature: Add tracing for template literal strings in imports (e.g., ``require(`tmpl-str`)``).

## 0.2.4

* Bug: Search for `index.json` files when no `package.json:main` is specified.

## 0.2.3

* Bug/Feature: Allow permissive handling of try/catch `require`s with `allowMissing` parameter.
  [#19](https://github.com/FormidableLabs/trace-deps/issues/19)

## 0.2.2

* Upgrade `node-acorn` to `^2.0.0`.

## 0.2.1

* Feature: Add `export *|{} from` ESM support.
  [#9](https://github.com/FormidableLabs/trace-deps/issues/9)

## 0.2.0

* Bug: Include `package.json` files that are needed for Node.js resolution.
  [#12](https://github.com/FormidableLabs/trace-deps/issues/12)

## 0.1.0

* Initial release.
