Changes
=======

## UNRELEASED

**Breaking**

* Feature: Change `traceFile|traceFiles` signature to `{ dependencies, misses }` and report imports that cannot be traced.
  [#25](https://github.com/FormidableLabs/trace-deps/issues/25)

**Features**

* Feature: Add inference for template literal strings in imports.

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
