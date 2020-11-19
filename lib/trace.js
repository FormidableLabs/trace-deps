"use strict";

const fs = require("fs");
const path = require("path");
const { promisify } = require("util");

const { parse } = require("acorn-node");
const { getDeps } = require("./extract");
const { getLastPackage, getLastPackageSegment } = require("./package");

// File extensions that we know are or are not JavaScript (but still
// require-able in Node.js)
const NOT_JS_EXTS = new Set([".json", ".node"]);

// Extensions to infer for resolving. Follow Node.js algorithm.
const RESOLVE_EXTS = [".js", ".json"];

// Helpers
const resolve = promisify(require("resolve"));
const readFile = promisify(fs.readFile);
const uniq = (items) => Array.from(new Set(items)).sort();
const sortObj = (obj) => uniq(Object.keys(obj)).reduce((memo, key) => {
  memo[key] = obj[key];
  return memo;
}, {});
const toPosixPath = (file) => !file ? file : path.normalize(file.replace(/\\/g, "/"));

// The dependency file name matches a configuration package prefix.
// Only allow:
// - exact match
// - match up to file separator
const matchesPkgPrefix = (depName) => (pkg) => depName === pkg || depName.startsWith(`${pkg}/`);

// Convert all keys to posix paths.
const normalizeExtraImports = (extraImports) => Object.entries(extraImports)
  .reduce((memo, [key, vals]) => {
    memo[toPosixPath(key)] = vals;
    return memo;
  }, {});

// Return any extra imports to add to the dependencies for a given source path.
const getExtraImports = ({ srcPath, _extraImports }) => {
  if (!srcPath) { return new Set(); }

  // Application source match of full path.
  // Use either posix or win path for keys.
  const fullMatch = _extraImports[toPosixPath(srcPath)];
  if (fullMatch) {
    return new Set(fullMatch);
  }

  // Package match of relative prefix.
  // Use either native or Posix path for keys.
  const relPath = getLastPackageSegment(srcPath);
  if (relPath) {
    const relMatch = _extraImports[toPosixPath(relPath)];
    if (relMatch) {
      return new Set(relMatch);
    }
  }

  // Empty set.
  return new Set();
};

const SOURCE_MAP_HASH_PREFIX = "# sourceMappingURL=";
const SOURCE_MAP_AT_PREFIX = "@ sourceMappingURL=";
const HTTP_RE = /^http(s)?:\/\//;

// Extract source map URLs from comments, and resolve to full paths.
//
// Source Maps comment spec: https://sourcemaps.info/spec.html#h.lmz475t4mvbx
//
// Allow:
// - `//# sourceMappingURL=<url>`
// - `//@ sourceMappingURL=<url>`
//
// ... in single line form only. This means we ignore the CSS version:
// - `/*# sourceMappingURL=<url> */`
//
// We also presently ignore `http|https://`-style URLs.
const extractSourceMapPaths = ({ basedir, sourceMapPaths }) => (block, text) => {
  text = text.trim();

  // Must be inline comment.
  if (block === true) { return; }

  let url;
  if (text.startsWith(SOURCE_MAP_HASH_PREFIX)) {
    url = text.replace(SOURCE_MAP_HASH_PREFIX, "").trim();
  } else if (text.startsWith(SOURCE_MAP_AT_PREFIX)) {
    url = text.replace(SOURCE_MAP_AT_PREFIX, "").trim();
  }

  // Could not extract a URL.
  if (!url) { return; }

  // URL is not file-based.
  if (HTTP_RE.test(url)) { return; }

  sourceMapPaths.push(path.resolve(basedir, url));
};

// HELPER: Recursively track and trace dependency paths.
// - `srcPaths`: If provided, **don't** add to resolvedDepPaths
// - `depPaths`: If provided, **do** add to resolvedDepPaths
const _recurseDeps = async ({
  srcPaths,
  depPaths = [],
  ignores = [],
  allowMissing = {},
  bailOnMissing = true,
  includeSourceMaps = false,
  _extraImports,
  _tracedDepPaths
}) => {
  // Start **only** with depPaths.
  let dependencies = Array.from(depPaths);
  const misses = {};

  // If srcPaths is provided, now **replace** depPaths.
  // (Allows easier accommodation of `traceFile` vs. `traceFiles`)
  depPaths = srcPaths || depPaths;

  // TODO(6): Consider parallelizing file traversal
  // https://github.com/FormidableLabs/trace-deps/issues/6
  for (const depPath of depPaths) {
    if (!_tracedDepPaths.has(depPath)) {
      // Mark encountered to avoid future recursion.
      _tracedDepPaths.add(depPath);

      // Short-circuit: Is it a known non-traceable extension?
      if (NOT_JS_EXTS.has(path.extname(depPath))) { continue; }

      // Recurse.
      // eslint-disable-next-line no-use-before-define
      const traced = await traceFile({
        srcPath: depPath,
        ignores,
        allowMissing,
        bailOnMissing,
        includeSourceMaps,
        _extraImports,
        _tracedDepPaths
      });

      // Aggregate.
      Object.assign(misses, traced.misses);
      dependencies = dependencies.concat(traced.dependencies);
    }
  }

  return {
    dependencies,
    misses
  };
};

/**
 * Trace and return on-disk locations of all file dependencies from a source file.
 *
 * **Note**: An internal set, `_tracedDepPaths`, tracks every file we encounter
 * before recursion and won't recurse additional times once we hit a file. This
 * is used internally within a `traceFile` call and for any use of `traceFiles`.
 * This does mean if you are repeatedly calling `traceFile` with the same entry
 * point file you should manually create and pass a shared `_tracedDepPaths` set
 * to avoid unnecessary additional tracing.
 *
 * @param {*}             opts                    options object
 * @param {string}        opts.srcPath            source file path to trace
 * @param {Array<string>} opts.ignores            list of package prefixes to ignore
 * @param {Object}        opts.allowMissing       map packages to list of allowed missing package
 * @param {boolean}       opts.bailOnMissing      allow static dependencies to be missing
 * @param {boolean}       opts.includeSourceMaps  include source map paths in output
 * @param {Object}        opts.extraImports       map files to additional imports to trace
 * @param {Object}        opts._extraImports      (internal) normalized map
 * @param {Set}           opts._tracedDepPaths    (internal) tracked dependencies
 * @returns {Promise<Object>}                     dependencies and other information
 */
// eslint-disable-next-line max-statements
const traceFile = async ({
  srcPath,
  ignores = [],
  allowMissing = {},
  bailOnMissing = true,
  includeSourceMaps = false,
  extraImports = {},
  _extraImports,
  _tracedDepPaths = new Set()
} = {}) => {
  if (!srcPath) {
    throw new Error("Empty source file path");
  }

  // Parameters
  _extraImports = _extraImports || normalizeExtraImports(extraImports);

  // Get source.
  const basedir = path.dirname(srcPath);
  const src = await readFile(srcPath)
    .then((buf) => buf.toString())
    .catch((err) => {
      // Enhance read error.
      throw err.code === "ENOENT" ? new Error(`Could not find source file: ${srcPath}`) : err;
    });

  // Start results object.
  const results = {
    dependencies: [],
    misses: {}
  };
  const resolvedSrcPath = path.resolve(srcPath);
  const addMisses = (vals) => {
    if (vals && vals.length) {
      results.misses[resolvedSrcPath] = []
        .concat(results.misses[resolvedSrcPath] || [])
        .concat(vals);
    }
  };

  // Source Maps
  const sourceMapPaths = [];
  const onComment = includeSourceMaps
    ? extractSourceMapPaths({ basedir, sourceMapPaths })
    : undefined;

  // Parse and extract.
  //
  // Rather than trying to infer if a given source file is ESM vs. CJS, we just
  // try both...
  let ast;
  try {
    // First try as a module.
    ast = parse(src, { sourceType: "module", locations: true, onComment });
  } catch (modErr) {
    // Then as script.
    try {
      ast = parse(src, { sourceType: "script", locations: true, onComment });
    } catch (scriptErr) {
      // Use original module error, with some helper errors.
      throw new Error(`Encountered parse error in ${srcPath}: ${modErr}`);
    }
  }

  // Take only _last_ source map path as real one if available.
  const sourceMapPath = sourceMapPaths.pop();
  const { dependencies, misses } = getDeps({ ast, src });

  // Add in additional dependencies.
  const allDepKeys = new Set(dependencies.keys());
  const extraDepKeys = getExtraImports({ srcPath, _extraImports });
  Array.from(extraDepKeys).forEach((key) => {
    allDepKeys.add(key);
  });

  // Merge in misses, if any
  addMisses(misses.map((miss) => Object.assign({}, miss, { type: "dynamic" })));

  // Handle dependencies.
  const depNames = uniq(allDepKeys)
    // Remove ignored names.
    .filter((depName) => !ignores.some(matchesPkgPrefix(depName)));
  if (!depNames.length) {
    // Base case: no additional dependencies.
    return results;
  }

  // Resolve to full file paths.
  // TODO(5): Consider limiting concurrent resolution.
  // https://github.com/FormidableLabs/trace-deps/issues/5
  // Start with the resolve path and any package.json used to get there.
  const depObjs = await Promise
    .all(depNames.map(async (depName) => {
      // Capture all package.json files encountered in node resolution.
      //
      // Related issues:
      // - Optimization: https://github.com/FormidableLabs/trace-deps/issues/13
      // - Upstream bug (pkg.json): https://github.com/FormidableLabs/trace-deps/issues/14
      const pkgPaths = [];
      return resolve(depName, {
        basedir,
        extensions: RESOLVE_EXTS,
        packageFilter: (pkg, pkgfile) => {
          pkgPaths.push(pkgfile);
          return pkg;
        }
      })
        // Add in package files if any.
        .then((depPath) => ({ depPath, pkgPaths }))
        .catch((err) => {
          // Handle module not found.
          if (err.code === "MODULE_NOT_FOUND") {
            // If allowed, then totally ignore.
            const srcPkg = getLastPackage(srcPath);
            const isAllowed = srcPkg && (allowMissing[srcPkg] || [])
              .some(matchesPkgPrefix(depName));
            if (isAllowed) {
              return null;
            }

            // If we don't bail on missing, just aggregate into misses object.
            if (!bailOnMissing) {
              if (dependencies.has(depName)) {
                addMisses([Object.assign({}, dependencies.get(depName), { type: "static" })]);
                return null;
              }

              if (extraDepKeys.has(depName)) {
                addMisses([{ dep: depName, type: "extra" }]);
                return null;
              }

              // This indicates a programming error.
              throw new Error(`Unaccounted dependency in ${srcPath} for ${depName}: ${err}`);
            }
          }

          // Convert to more useful error.
          throw new Error(`Encountered resolution error in ${srcPath} for ${depName}: ${err}`);
        });
    }))
    // Post-resolution processing.
    .then((allPaths) => allPaths
      // Remove empty names (e.g., from allowed missing modules).
      .filter(Boolean)
      // Remove core standard Node.js libraries (`path`, etc.)
      .filter(({ depPath }, i) => depPath !== depNames[i])
    );

  // Extract to different types of paths.
  const depPaths = depObjs.map(({ depPath }) => depPath);
  const allPkgPaths = depObjs.reduce((memo, { pkgPaths }) => memo.concat(pkgPaths), []);

  // Aggregate all resolved deps and recurse into each file and resolve further.
  _tracedDepPaths.add(srcPath);
  const recursed = await _recurseDeps({
    depPaths,
    ignores,
    allowMissing,
    bailOnMissing,
    includeSourceMaps,
    _extraImports,
    _tracedDepPaths
  });

  results.misses = sortObj(Object.assign(results.misses, recursed.misses));
  results.dependencies = uniq([].concat(
    // Add all needed package.json files
    allPkgPaths,
    // Add dependencies from recursion.
    recursed.dependencies
  ));

  if (includeSourceMaps) {
    results.sourceMaps = uniq([].concat(
      // Add all needed package.json files
      sourceMapPath || [],
      // Add dependencies from recursion.
      recursed.sourceMaps || []
    ));
  }

  // Make unique and return.
  return results;
};

/**
 * Trace and return on-disk locations of all file dependencies from source files.
 *
 * @param {*}             opts                  options object
 * @param {Array<string>} opts.srcPaths         source file paths to trace
 * @param {Array<string>} opts.ignores          list of package prefixes to ignore
 * @param {Object}        opts.allowMissing     map packages to list of allowed missing package
 * @param {Object}        opts.extraImports     map files to additional imports to trace
 * @param {Object}        opts._extraImports    (internal) normalized map
 * @param {Set}           opts._tracedDepPaths  (internal) tracked dependencies
 * @returns {Promise<Object>}                   dependencies and other information
 */
const traceFiles = async ({
  srcPaths,
  ignores = [],
  allowMissing = {},
  bailOnMissing = true,
  includeSourceMaps = false,
  extraImports = {},
  _extraImports,
  _tracedDepPaths = new Set()
} = {}) => {
  _extraImports = _extraImports || normalizeExtraImports(extraImports);

  // Recurse all source files.
  const results = await _recurseDeps({
    srcPaths,
    ignores,
    allowMissing,
    bailOnMissing,
    includeSourceMaps,
    _extraImports,
    _tracedDepPaths
  });

  // Make unique and return.
  results.misses = sortObj(results.misses);
  results.dependencies = uniq(results.dependencies);
  if (includeSourceMaps) {
    results.sourceMaps = uniq(results.sourceMaps);
  }

  return results;
};

module.exports = {
  traceFile,
  traceFiles
};
