trace-deps 🔬
============

[![npm version][npm_img]][npm_site]
[![Travis Status][trav_img]][trav_site]
[![AppVeyor Status][appveyor_img]][appveyor_site]
[![Coverage Status][cov_img]][cov_site]

A dependency tracing tool for Node.js source files.

## Overview

`trace-deps` can parse CommonJS / ESM source files, inspect dependency statements, and produce a list of absolute file paths on-disk for all inferred dependencies. The library currently works with files ending in `.js`, `.mjs` file extensions that contain the following dependency statements:

- `require("<string>")`: CommonJS require.
- `require.resolve("<string>")`: CommonJS require resolution (returns path to dependency instead of loaded code).
- `import "<string>"`, `import <var> from "<string>"`: ECMAScript Module static import.
- `import("<string>")`: ECMAScript Module dynamic import.

## API

### `traceFile({ srcPath, ignores })`

Trace and return on-disk locations of all file dependencies from a source file.

_Parameters_:

* `srcPath` (`string`): source file path to trace
* `ignores` (`Array<string>`): list of package prefixes to ignore

_Returns_:

* (`Promise<Array<string>>`): list of absolute paths to on-disk dependencies

### `traceFiles({ srcPaths, ignores })`

Trace and return on-disk locations of all file dependencies from source files.

_Parameters_:

* `srcPaths` (`Array<string>`): source file paths to trace
* `ignores` (`Array<string>`): list of package prefixes to ignore

_Returns_:

* (`Promise<Array<string>>`): list of absolute paths to on-disk dependencies

## Notes

* **Only parses Node.js JavaScript**: `trace-deps` presently will only Node.js-compatible JavaScript in CommonJS or ESM formats. It will not correctly parse things like TypeScript, JSX, ReasonML, non-JavaScript, etc.

* **Only handles single string dependencies**: `require`, `require.resolve`, and dynamic `import()` support calls with variables or other expressions like `require(aVar)`, `import(process.env.VAL + "more-stuff")`. This library presently only supports calls with a **single string** and nothing else. We have a [tracking ticket](https://github.com/FormidableLabs/trace-deps/issues/2) to consider expanding support for things like partial evaluation.

[npm_img]: https://badge.fury.io/js/trace-deps.svg
[npm_site]: http://badge.fury.io/js/trace-deps
[trav_img]: https://api.travis-ci.com/FormidableLabs/trace-deps.svg
[trav_site]: https://travis-ci.com/FormidableLabs/trace-deps
[appveyor_img]: https://ci.appveyor.com/api/projects/status/github/formidablelabs/trace-deps?branch=master&svg=true
[appveyor_site]: https://ci.appveyor.com/project/FormidableLabs/trace-deps
[cov_img]: https://codecov.io/gh/FormidableLabs/trace-deps/branch/master/graph/badge.svg
[cov_site]: https://codecov.io/gh/FormidableLabs/trace-deps
