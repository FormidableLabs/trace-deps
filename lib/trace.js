"use strict";

const path = require("path");
const { promisify } = require("util");

const { parse } = require("acorn-node");
const { getDeps } = require("./extract");
const { readFile } = require("./util");

const resolve = promisify(require("resolve"));
const uniq = (items) => Array.from(new Set(items)).sort();

/**
 * Trace and return on-disk locations of all file dependencies from a source file.
 *
 * @param {*}                         opts                options object
 * @param {string}                    opts.srcPath        path to source file to trace
 * @param {Set}                       opts.tracedDepPaths tracked dependencies
 * @returns {Promise<Array<String>>}  list of relative paths to on-disk dependencies
 */
// TODO: REFACTOR TO AVOID WARNING DISABLE
// eslint-disable-next-line max-statements
const traceFile = async ({ srcPath, tracedDepPaths } = {}) => {
  if (!srcPath) {
    throw new Error("Empty source file path");
  }

  // Get source.
  let src;
  try {
    src = await readFile(srcPath);
  } catch (readErr) {
    if (readErr.code === "ENOENT") {
      throw new Error(`Could not find source file: ${srcPath}`);
    }
    throw readErr;
  }

  // Track dependency paths that have started/finished resolution.
  tracedDepPaths = tracedDepPaths || new Set();

  // Get dependencies.
  const depNames = uniq(getDeps(parse(src, { sourceType: "module" })));
  if (!depNames.length) {
    // Base case: no additional dependencies.
    return [];
  }

  // Resolve to full file paths.
  // TODO: Consider limiting concurrent resolutions?
  // TODO: Catch resolve errors and re-throw / blow up?
  const basedir = path.dirname(srcPath);
  const depPaths = await Promise
    .all(depNames.map((depName) => resolve(depName, {
      basedir
    })))
    // Remove core standard Node.js libraries (`path`, etc.)
    .then((allPaths) => allPaths.filter((depPath, i) => depPath !== depNames[i]));

  // Aggregate all resolved deps.
  let resolvedDepPaths = Array.from(depPaths);

  // Recurse into each file and resolve further.
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
