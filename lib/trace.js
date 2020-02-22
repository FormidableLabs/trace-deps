"use strict";

const { exists } = require("./util");

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

  return ["TODO/one.js", "TODO/two.js", `TODO/${file}`];
};

module.exports = {
  traceFile
};
