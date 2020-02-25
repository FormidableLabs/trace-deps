"use strict";

const path = require("path");
const { promisify } = require("util");

const { parse } = require("acorn-node");
const { getDeps } = require("./extract");
const { exists, readFile } = require("./util");

const resolve = promisify(require("resolve"));

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
 * @param {*}                         opts          options object
 * @param {string}                    opts.srcPath  path to source file to trace
 * @param {Map<Promise<string>>}      opts.traceMap map of `{ depPath: }
 * @returns {Promise<Array<String>>}  list of relative paths to on-disk dependencies
 */
const traceFile = async ({ srcPath, traceMap } = {}) => {
  if (!srcPath) {
    throw new Error("Empty source file path");
  } else if (!await exists(srcPath)) {
    throw new Error(`Could not find source file: ${srcPath}`);
  }

  // Get dependencies
  const src = await readFile(srcPath);
  const depNames = Array.from(getDeps(parse(src, { sourceType: "module" }))).sort();

  // Resolve to full file paths.
  // TODO: Consider limiting concurrent resolutions?
  const basedir = path.dirname(srcPath);
  const depPaths = await Promise
    .all(depNames.map((depName) => resolve(depName, {
      basedir
    })))
    // Remove core standard Node.js libraries (`path`, etc.)
    .then((allPaths) => allPaths.filter((depPath, i) => depPath !== depNames[i]));

  // Recurse into each file and resolve further.

  // TODO: Catch resolve errors and re-throw / blow up?
  // TODO: Recurse and read.
  // TODO: Consider output format: List? Set? Tree?

  return {
    depNames,
    depPaths
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
