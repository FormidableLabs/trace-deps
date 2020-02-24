"use strict";

const { parse } = require("acorn-node");
const { getDeps } = require("./extract");
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
 * @param {string}  opts.file         source file to trace
 * @returns {Promise<Array<String>>}  list of relative paths to on-disk dependencies
 */
const traceFile = async ({ file } = {}) => {
  if (!file) {
    throw new Error("Empty file");
  } else if (!await exists(file)) {
    throw new Error(`Could not find source file: ${file}`);
  }

  const src = await readFile(file);
  const deps = getDeps(parse(src, { sourceType: "module" }));

  // TODO: Resolve each dep to file location.
  // TODO: Recurse and read.
  // TODO: Consider output format: List? Set? Tree?

  return Array.from(deps).sort();
};

// TODO: REMOVE
if (require.main === module) {
  traceFile({ file: __filename })
    .then(console.log) // eslint-disable-line no-console
    .catch((err) => {
      console.error(err); // eslint-disable-line no-console
      process.exit(-1); // eslint-disable-line no-process-exit
    });
}

module.exports = {
  traceFile
};
