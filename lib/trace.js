"use strict";

const path = require("path");

const { parse } = require("acorn-node");
const { getDeps } = require("./extract");
const { resolve } = require("./resolve");
const { exists, readFile } = require("./util");

// TODO: Delete
// eslint-disable-next-line no-unused-vars
const SAMPLE_SRC_FILE = `
import * as React from "react-esm";
import "bar-esm";

// Shouldn't be included
const stringifiedReq = "require('dont-include-me')";

// Some CJS stuff too
const ReactDom = require("react-dom-cjs");
if (true) {
  require("nested-cjs");

  const baz = require.resolve("resolved-baz-cjs");
}

const foo = () => "foo";

export default foo;
`;

/**
 * Trace and return on-disk locations of all file dependencies from a source file.
 *
 * @param {*}       opts              options object
 * @param {string}  opts.srcPath      path to source file to trace
 * @returns {Promise<Array<String>>}  list of relative paths to on-disk dependencies
 */
const traceFile = async ({ srcPath } = {}) => {
  if (!srcPath) {
    throw new Error("Empty source file path");
  } else if (!await exists(srcPath)) {
    throw new Error(`Could not find source file: ${srcPath}`);
  }

  // Get dependencies
  const src = await readFile(srcPath);
  const deps = Array.from(getDeps(parse(src, { sourceType: "module" }))).sort();

  // Resolve to full file paths.
  // TODO: Consider limiting concurrent resolutions?
  const basedir = path.dirname(srcPath);
  const resolved = await Promise
    .all(deps.map((name) => resolve({ basedir, name })))
    // Remove core standard Node.js libraries (`path`, etc.)
    .then((depPaths) => depPaths.filter((depPath, i) => depPath !== deps[i]));

  // TODO: Resolve each dep to file location.
  // TODO: Recurse and read.
  // TODO: Consider output format: List? Set? Tree?

  return {
    deps,
    resolved
  };
};

module.exports = {
  traceFile
};

// TODO: REMOVE
if (require.main === module) {
  traceFile({ srcPath: __filename })
    .then(console.log) // eslint-disable-line no-console
    .catch((err) => {
      console.error(err); // eslint-disable-line no-console
      process.exit(-1); // eslint-disable-line no-process-exit
    });
}
