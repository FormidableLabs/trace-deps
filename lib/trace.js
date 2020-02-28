"use strict";

const fs = require("fs");
const path = require("path");
const { promisify } = require("util");

const { parse } = require("acorn-node");
const { getDeps } = require("./extract");

// Helpers
const resolve = promisify(require("resolve"));
const readFile = promisify(fs.readFile);
const uniq = (items) => Array.from(new Set(items)).sort();

/**
 * Trace and return on-disk locations of all file dependencies from a source file.
 *
 * @param {*}                         opts                options object
 * @param {string}                    opts.srcPath        source file path to trace
 * @param {Array<string>}             opts.ignores        list of package prefixes to ignore
 * @param {Set}                       opts.tracedDepPaths tracked dependencies
 * @returns {Promise<Array<string>>}  list of absolute paths to on-disk dependencies
 */
// TODO: REFACTOR TO AVOID WARNING DISABLE
// eslint-disable-next-line max-statements
const traceFile = async ({ srcPath, ignores = [], tracedDepPaths = new Set() } = {}) => {
  if (!srcPath) {
    throw new Error("Empty source file path");
  }

  // Get source.
  const src = await readFile(srcPath).catch((err) => {
    // Enhance read error.
    throw err.code === "ENOENT" ? new Error(`Could not find source file: ${srcPath}`) : err;
  });

  // Get dependencies.
  const depNames = uniq(getDeps(parse(src, { sourceType: "module" })))
    // Remove ignored names.
    .filter((depName) => !ignores.some((i) => depName === i || depName.startsWith(`${i}/`)));
  if (!depNames.length) {
    // Base case: no additional dependencies.
    return [];
  }

  // Resolve to full file paths.
  // TODO(5): Consider limiting concurrent resolution.
  // https://github.com/FormidableLabs/trace-deps/issues/5
  const basedir = path.dirname(srcPath);
  const depPaths = await Promise
    .all(depNames.map((depName) => resolve(depName, { basedir }).catch((err) => {
      // Convert to more useful error.
      throw new Error(
        `Encountered resolution error in ${srcPath} for ${depName}: ${err}`
      );
    })))
    // Remove core standard Node.js libraries (`path`, etc.)
    .then((allPaths) => allPaths.filter((depPath, i) => depPath !== depNames[i]));

  // Aggregate all resolved deps.
  let resolvedDepPaths = Array.from(depPaths);

  // Recurse into each file and resolve further.
  // TODO(6): Consider parallelizing file traversal
  // https://github.com/FormidableLabs/trace-deps/issues/6
  for (const depPath of depPaths) {
    if (!tracedDepPaths.has(depPath) && (/\.(js|mjs)$/).test(depPath)) {
      // Mark encountered to avoid future recursion.
      tracedDepPaths.add(depPath);

      // Recurse.
      const recursedDepPaths = await traceFile({
        srcPath: depPath,
        tracedDepPaths
      });

      // Aggregate.
      resolvedDepPaths = resolvedDepPaths.concat(recursedDepPaths);
    }
  }

  // Make unique and return.
  return uniq(resolvedDepPaths);
};

/**
 * Trace and return on-disk locations of all file dependencies from source files.
 *
 * @param {*}                         opts                options object
 * @param {Array<string>}             opts.srcPaths       source file paths to trace
 * @param {Array<string>}             opts.ignores        list of package prefixes to ignore
 * @param {Set}                       opts.tracedDepPaths tracked dependencies
 * @returns {Promise<Array<string>>}  list of absolute paths to on-disk dependencies
 */
const traceFiles = async ({ srcPaths, ignores = [], tracedDepPaths = new Set() } = {}) => {
  // TODO: Refactor a ton of common code with traceFiles out.
  let resolvedDepPaths = [];

  // TODO(6): Consider parallelizing file traversal
  // https://github.com/FormidableLabs/trace-deps/issues/6
  for (const srcPath of srcPaths) {
    if (!tracedDepPaths.has(srcPath) && (/\.(js|mjs)$/).test(srcPath)) {
      // Mark encountered to avoid future recursion.
      tracedDepPaths.add(srcPath);

      // Recurse.
      const recursedDepPaths = await traceFile({
        srcPath,
        ignores,
        tracedDepPaths
      });

      // Aggregate.
      resolvedDepPaths = resolvedDepPaths.concat(recursedDepPaths);
    }
  }

  // Make unique and return.
  return uniq(resolvedDepPaths);
};

module.exports = {
  traceFile,
  traceFiles
};
