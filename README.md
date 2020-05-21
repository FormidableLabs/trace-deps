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
- `import "<string>"`, `import <var> | { <var> } | * as <var> from "<string>"`: ECMAScript Module static import.
- `export <var> | { <var> } | * as <var> from "<string>"`: ECMAScript Module static re-export.
- `import("<string>")`: ECMAScript Module dynamic import.

## API

### `traceFile({ srcPath, ignores })`

Trace and return on-disk locations of all file dependencies from a source file.

_Parameters_:

* `srcPath` (`string`): source file path to trace
* `ignores` (`Array<string>`): list of package prefixes to ignore tracing entirely
* `allowMissing` (`Object.<string, Array<string>`): Mapping of package prefixes to permitted missing module prefixes.
* `bailOnMissing` (`boolean`): Throw error if missing static import. (Default: `true`). If false, misses are added to `misses` object.
* `extraImports` (`Object.<string, Array<string>`): Mapping of files to additional imports to trace.
    * The **key** is path (either Posix or native OS paths are accepted) in the form of either:
        1. an **absolute** path to a source file (e.g., `/PATH/TO/src/foo.js`), or;
        2. a **relative** path to a file from a package in `node_modules` starting at the package name (e.g. `lodash/index.js`).
    * The **value** is an array of additional import specifiers that are resolved and further traced. The additional imports are anything that could be validly passed to a `require()` or `import` call (e.g., `./relative/path/to/source-file.js`, `a-pkg`, `a-pkg/with/nested/path.js`).
        * Paths should be specified as you would in a Node.js `require()` which is to say Posix `/` form.

_Returns_:

* (`Promise<Object>`): Dependencies and other information.
    * `dependencies` (`Array<string>`): list of absolute paths to on-disk dependencies
    * `misses` (`Object.<string, Array<Object>`): Mapping of file absolute paths on disk to an array of imports that `trace-deps` was **not** able to resolve (dynamic requires, etc.). The object contained in the value array is structured as follows:
        * `src` (`string`): The source code snippet of the import in question (e.g., `"require(A_VAR)"`)
        * `start`, `end` (`number`): The starting / ending character indexes in the source code string corresponding to the source file.
        * `loc` (`Object`): Line / column information for the code string at issue taking the form:
            ```js
            {
              start: { line: Number, column: Number},
              end:   { line: Number, column: Number}
            }
            ```

### `traceFiles({ srcPaths, ignores })`

Trace and return on-disk locations of all file dependencies from source files.

_Parameters_:

* `srcPaths` (`Array<string>`): source file paths to trace
* `ignores` (`Array<string>`): list of package prefixes to ignore
* `allowMissing` (`Object.<string, Array<string>`): Mapping of package prefixes to permitted missing module prefixes.
* `bailOnMissing` (`boolean`): Throw error if missing static import.
* `extraImports` (`Object.<string, Array<string>`): Mapping of files to additional imports to trace.

_Returns_:

* (`Promise<Object>`): Dependencies and other information. See `traceFile()` for object shape.

## Notes

* **Only parses Node.js JavaScript**: `trace-deps` presently will only Node.js-compatible JavaScript in CommonJS or ESM formats. It will not correctly parse things like TypeScript, JSX, ReasonML, non-JavaScript, etc.

* **Only handles single string dependencies**: `require`, `require.resolve`, and dynamic `import()` support calls with variables or other expressions like `require(aVar)`, `import(process.env.VAL + "more-stuff")`. This library presently only supports calls with a **single string** and nothing else. We have a [tracking ticket](https://github.com/FormidableLabs/trace-deps/issues/2) to consider expanding support for things like partial evaluation.

* **Includes `package.json` files used in resolution**: As this is a Node.js-focused library, to follow the Node.js [module resolution algorithm](https://nodejs.org/api/modules.html#modules_all_together) which notably uses intermediate encountered `package.json` files to determine how to resolve modules. This means that we include a lot of `package.json` files that seemingly aren't directly imported (such as a `const pkg = require("mod/package.json")`) because they are needed for the list of all traced files to together resolve correctly if all on disk together.

* **Using the `allowMissing` option**: The `allowMissing` function field helps in situations where you want to allow certain dependencies to have known missing sub-dependencies, often seen in patterns like: `try { require("optional-dep"); } catch (e) {}`. If the sub-dependency is found, then it will be returned just like any normal one. If not, the module not found error is just swallowed and normal processing resumes.

    To configure the parameter, create an object of key `package-prefix` with a value of an array of other package prefixes to skip over not found errors:

    ```js
    traceFile({
      srcPath,
      allowMissing: {
        "ws": [
          // See, e.g.: https://github.com/websockets/ws/blob/08c6c8ba70404818f7f4bc23eb5fd0bf9c94c039/lib/buffer-util.js#L121-L122
          "bufferutil",
          // See, e.g.: https://github.com/websockets/ws/blob/b6430fea423d88926847a47d4ecfc36e52dc1164/lib/validation.js#L3-L10
          "utf-8-validate"
        ]
      }
    })
    ```

* **`ignores` vs. `allowMissing`**: The `ignores` option completely skips a dependency from being further traversed irrespective of whether or not a matching dependency exists on disk. The `allowMissing` option will include and further traverse dependencies that are present on disk if found and suppress any errors for matches that are missing.

[npm_img]: https://badge.fury.io/js/trace-deps.svg
[npm_site]: http://badge.fury.io/js/trace-deps
[trav_img]: https://api.travis-ci.com/FormidableLabs/trace-deps.svg
[trav_site]: https://travis-ci.com/FormidableLabs/trace-deps
[appveyor_img]: https://ci.appveyor.com/api/projects/status/github/formidablelabs/trace-deps?branch=master&svg=true
[appveyor_site]: https://ci.appveyor.com/project/FormidableLabs/trace-deps
[cov_img]: https://codecov.io/gh/FormidableLabs/trace-deps/branch/master/graph/badge.svg
[cov_site]: https://codecov.io/gh/FormidableLabs/trace-deps
