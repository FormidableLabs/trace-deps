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
 * @returns {Promise<Array<string>>}  list of relative paths to on-disk dependencies
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
  // TODO/TICKET: Consider limiting concurrent resolutions?
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
  // TODO/TICKET: Recursion concurrency.
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
 * @param {Array<string>}             opts.srcPaths       path to source files to trace
 * @param {Set}                       opts.tracedDepPaths tracked dependencies
 * @returns {Promise<Array<string>>}  list of relative paths to on-disk dependencies
 */
const traceFiles = async ({ srcPaths, tracedDepPaths } = {}) => {
  tracedDepPaths = tracedDepPaths || new Set();

  // TODO: Refactor a ton of common code with traceFiles out.
  let resolvedDepPaths = [];

  // TODO/TICKET: Recursion concurrency.
  for (const srcPath of srcPaths) {
    if (!tracedDepPaths.has(srcPath) && (/\.(js|mjs)$/).test(srcPath)) {
      // Mark encountered to avoid future recursion.
      tracedDepPaths.add(srcPath);

      // Recurse.
      const recursedDepPaths = await traceFile({
        srcPath,
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

// TODO: REMOVE
// TODO/TICKET: future dynamic resolution / eval-ing / more than one arg things.
// TODO: NOTE -- might need `ignore` array of depNames / prefixes.
//       in case things like `react-ssr-prepass` are meant to be _not_ resolved or something
if (require.main === module) {
  (async () => {
    const { log } = console;
    try {
      const tracedFile = await traceFile({ srcPath: __filename });
      log("tracedFile", tracedFile.length, tracedFile);

      const tracedFiles = await traceFiles({
        srcPaths: [
          __filename,
          path.resolve(__dirname, "../test/setup.js")
        ]
      });
      log("tracedFiles", tracedFiles.length, tracedFiles);
    } catch (err) {
      console.error(err); // eslint-disable-line no-console
      process.exit(-1); // eslint-disable-line no-process-exit
    }
  })();
}
