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

// HELPER: Recursively track and trace dependency paths.
// - `srcPaths`: If provided, **don't** add to resolvedDepPaths
// - `depPaths`: If provided, **do** add to resolvedDepPaths
const _recurseDeps = async ({ srcPaths, depPaths = [], ignores, tracedDepPaths }) => {
  // Start **only** with depPaths.
  let resolvedDepPaths = Array.from(depPaths);

  // If srcPaths is provided, now **replace** depPaths.
  // (Allows easier accomodation of `traceFile` vs. `traceFiles`)
  depPaths = srcPaths || depPaths;

  // TODO(6): Consider parallelizing file traversal
  // https://github.com/FormidableLabs/trace-deps/issues/6
  for (const depPath of depPaths) {
    if (!tracedDepPaths.has(depPath) && (/\.(js|mjs)$/).test(depPath)) {
      // Mark encountered to avoid future recursion.
      tracedDepPaths.add(depPath);

      // Recurse.
      // eslint-disable-next-line no-use-before-define
      const recursedDepPaths = await traceFile({ srcPath: depPath, ignores, tracedDepPaths });

      // Aggregate.
      resolvedDepPaths = resolvedDepPaths.concat(recursedDepPaths);
    }
  }

  return resolvedDepPaths;
};

/**
 * Trace and return on-disk locations of all file dependencies from a source file.
 *
 * **Note**: An internal set, `tracedDepPaths`, tracks every file we encounter
 * before recursion and won't recurse additional times once we hit a file. This
 * is used internally within a `traceFile` call and for any use of `traceFiles`.
 * This does mean if you are repeatedly calling `traceFile` with the same entry
 * point file you should manually create and pass a shared `tracedDepPaths` set
 * to avoid unnecessary additional tracing.
 *
 * @param {*}                         opts                options object
 * @param {string}                    opts.srcPath        source file path to trace
 * @param {Array<string>}             opts.ignores        list of package prefixes to ignore
 * @param {Set}                       opts.tracedDepPaths tracked dependencies
 * @returns {Promise<Array<string>>}  list of absolute paths to on-disk dependencies
 */
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
      throw new Error(`Encountered resolution error in ${srcPath} for ${depName}: ${err}`);
    })))
    // Remove core standard Node.js libraries (`path`, etc.)
    .then((allPaths) => allPaths.filter((depPath, i) => depPath !== depNames[i]));

  // Aggregate all resolved deps and recurse into each file and resolve further.
  tracedDepPaths.add(srcPath);
  const resolvedDepPaths = await _recurseDeps({ depPaths, ignores, tracedDepPaths });

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
  // Recurse all source files.
  const resolvedDepPaths = await _recurseDeps({ srcPaths, ignores, tracedDepPaths });

  // Make unique and return.
  return uniq(resolvedDepPaths);
};

module.exports = {
  traceFile,
  traceFiles
};
