trace-deps 🔬
============

[![npm version][npm_img]][npm_site]
[![Travis Status][trav_img]][trav_site]
[![AppVeyor Status][appveyor_img]][appveyor_site]
[![Coverage Status][cov_img]][cov_site]

A dependency tracing tool for Node.js source files.

## Overview

`trace-deps` can parse CommonJS / ESM source files, inspect dependency statements, and produce a list of absolute file paths on-disk for all inferred dependencies. The library currently works with files ending in `.js`, `.mjs` file extensions that contain the following dependency statements:

- `require("<string>")`: A CommonJS require. Only detects calls with a **single string argument**.
- `require.resolve("<string>")`: A CommonJS require resolution (returns path to dependency instead of loaded code). Only detects calls with a **single string argument**.
- `import "<string>"`, `import <var> from "<string>"`: A ECMAScript Module static import.
- `import("<string>")`: A ECMAScript Module dynamic import. Only detects calls with a **single string argument**.

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

[npm_img]: https://badge.fury.io/js/trace-deps.svg
[npm_site]: http://badge.fury.io/js/trace-deps
[trav_img]: https://api.travis-ci.com/FormidableLabs/trace-deps.svg
[trav_site]: https://travis-ci.com/FormidableLabs/trace-deps
[appveyor_img]: https://ci.appveyor.com/api/projects/status/github/formidablelabs/trace-deps?branch=master&svg=true
[appveyor_site]: https://ci.appveyor.com/project/FormidableLabs/trace-deps
[cov_img]: https://codecov.io/gh/FormidableLabs/trace-deps/branch/master/graph/badge.svg
[cov_site]: https://codecov.io/gh/FormidableLabs/trace-deps
