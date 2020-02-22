trace-deps 🔎
============

[![npm version][npm_img]][npm_site]
[![Travis Status][trav_img]][trav_site]
[![AppVeyor Status][appveyor_img]][appveyor_site]
[![Coverage Status][cov_img]][cov_site]

A dependency tracing tool for Node.js source files.

## API

### `traceFile({ file })`

Trace and return on-disk locations of all file dependencies from a source file.

_Parameters_:

* `file` (`string`): source file to trace

_Returns_:

* (`Promise<Array<String>>`): list of relative paths to on-disk dependencies


[npm_img]: https://badge.fury.io/js/trace-deps.svg
[npm_site]: http://badge.fury.io/js/trace-deps
[trav_img]: https://api.travis-ci.com/FormidableLabs/trace-deps.svg
[trav_site]: https://travis-ci.com/FormidableLabs/trace-deps
[appveyor_img]: https://ci.appveyor.com/api/projects/status/github/formidablelabs/trace-deps?branch=master&svg=true
[appveyor_site]: https://ci.appveyor.com/project/FormidableLabs/trace-deps
[cov_img]: https://codecov.io/gh/FormidableLabs/trace-deps/branch/master/graph/badge.svg
[cov_site]: https://codecov.io/gh/FormidableLabs/trace-deps
