"use strict";

const fs = require("fs");
const path = require("path");
const { promisify } = require("util");

const { parse } = require("acorn-node");
const resolve = promisify(require("resolve"));
const resolveExports = require("resolve.exports");

const { getDeps, SourceMap } = require("./extract");
const {
  getLastPackage,
  getLastPackageSegment,
  getLastPackageRoot,
  getDependencyParts
} = require("./package");
const { toPosixPath } = require("./path");

// File extensions that we know are or are not JavaScript (but still
// require-able in Node.js)
const NOT_JS_EXTS = new Set([".json", ".node"]);

// Extensions to infer for resolving. Follow Node.js algorithm.
const RESOLVE_EXTS = [".js", ".json"];

// ESM: We infer **all** of the likely conditions used for Node.js ESM runtime.
//
// TODO(56): Add/override with user-specified conditions.
// https://github.com/FormidableLabs/trace-deps/issues/56
const CONDITIONS = [
  // Node.js conditions
  // https://nodejs.org/api/packages.html#packages_conditional_exports
  "import",
  "require",
  "node",
  // Try `default` in both CJS + ESM modes.
  ["default", { require: true }],
  ["default", { require: false }],

  // Endorsed user conditions.
  // https://nodejs.org/api/packages.html#packages_conditions_definitions
  //
  // Note: We are ignoring
  // - `browser`
  "development",
  "production"
];

// Exports that disable modern ESM.
// <string>: <Set<string>>
const PASSTHROUGH_EXPORTS = {
  "./": new Set([
    "./"
  ])
};

const IGNORE_IMPORT_PREFIXES = ["data:", "node:"];


// default ECMA version passed to acorn
// matches acorn@2.0.1 default
const DEFAULT_ECMA_VERSION = 2020;

// Helpers
const readFile = promisify(fs.readFile);
const stat = promisify(fs.stat);
// True if both exists _and_ a file.
const fileExists = (filePath) => stat(filePath)
  .then((stats) => stats.isFile())
  .catch((err) => {
    if (err.code === "ENOENT") { return false; }
    throw err;
  });

const uniq = (items) => Array.from(new Set(items)).sort();
const sortObj = (obj) => uniq(Object.keys(obj)).reduce((memo, key) => {
  memo[key] = obj[key];
  return memo;
}, {});

// The dependency file name matches a configuration package prefix.
// Only allow:
// - exact match
// - match up to file separator
const matchesPkgPrefix = ({ fullSrcPath, depName }) => {
  // Do a temporary internal resolution of in-package imports
  // so we can use ignore's, etc.
  //
  // Get the directory of the full path, truncate to last package,
  // and _then_ resolve to local path in package.
  let relPkgPath = null;
  if (depName.startsWith(".")) {
    const lastDir = path.dirname(fullSrcPath);
    const lastPkg = getLastPackageSegment(lastDir);
    if (lastPkg) {
      relPkgPath = toPosixPath(path.normalize(path.join(lastPkg, depName)));
    }
  }

  return (
    (pkg) => depName === pkg || depName.startsWith(`${pkg}/`)
    || relPkgPath && (relPkgPath === pkg || relPkgPath.startsWith(`${pkg}/`))
  );
};

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

const matchesAllowed = ({ fullSrcPath, depName, allowed }) =>
  allowed && allowed.some(matchesPkgPrefix({ fullSrcPath, depName }));

const isAllowedMiss = ({ depName, srcPath, allowMissing }) => {
  const fullSrcPath = path.resolve(srcPath);
  // Try full source path match first.
  if (matchesAllowed({
    fullSrcPath,
    depName,
    allowed: allowMissing[fullSrcPath]
  })) {
    return true;
  }

  // Then try package name.
  const srcPkg = getLastPackage(srcPath);
  if (srcPkg) {
    if (matchesAllowed({ depName, allowed: allowMissing[srcPkg] })) {
      return true;
    }
  }

  // Then try package relative path to file.
  const srcPkgSegment = toPosixPath(getLastPackageSegment(srcPath));
  if (srcPkgSegment) {
    if (matchesAllowed({ depName, allowed: allowMissing[srcPkgSegment] })) {
      return true;
    }
  }

  // Default
  return false;
};

// HELPER: Recursively track and trace dependency paths.
// - `srcPaths`: If provided, **don't** add to resolvedDepPaths
// - `depPaths`: If provided, **do** add to resolvedDepPaths
// eslint-disable-next-line max-statements
const _recurseDeps = async ({
  srcPaths,
  depPaths = [],
  ignores = [],
  allowMissing = {},
  bailOnMissing = true,
  includeSourceMaps = false,
  ecmaVersion,
  _extraImports,
  _tracedDepPaths
}) => {
  // Start **only** with depPaths.
  let dependencies = Array.from(depPaths);
  let sourceMaps = [];
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
        ecmaVersion,
        _extraImports,
        _tracedDepPaths
      });

      // Aggregate.
      Object.assign(misses, traced.misses);
      dependencies = dependencies.concat(traced.dependencies);
      sourceMaps = sourceMaps.concat(traced.sourceMaps || []);
    }
  }

  return {
    dependencies,
    misses,
    ...includeSourceMaps ? { sourceMaps } : undefined
  };
};

// Resolve a single dependency.
const _resolveDep = async ({
  depName,
  basedir,
  srcPath,
  dependencies,
  extraDepKeys,
  addMisses,
  allowMissing,
  bailOnMissing,
  addRootPackagePaths = false
}) => {
  // Support advanced Node.js ESM import types by ignoring built-in's as not
  // needing any further inspection / inclusion.
  if (IGNORE_IMPORT_PREFIXES.find((prefix) => depName.startsWith(prefix))) {
    return null;
  }

  // Check for modern import `?` query imports and mutate dep name to remove.
  const queryStringPosition = depName.indexOf("?");
  if (queryStringPosition > -1) {
    depName = depName.substring(0, queryStringPosition);
  }

  // Capture all package.json files encountered in node resolution.
  //
  // Related issues:
  // - Optimization: https://github.com/FormidableLabs/trace-deps/issues/13
  // - Upstream bug (pkg.json): https://github.com/FormidableLabs/trace-deps/issues/14
  const pkgPaths = [];
  const exportSrcs = new Map();
  return resolve(depName, {
    basedir,
    extensions: RESOLVE_EXTS,
    packageIterator: (request, start, opts) => {
      const dirs = opts();

      if (!addRootPackagePaths) {
        return dirs;
      }

      // Special second try with extra package roots.
      //
      // To handle the case of no package.json:main and nested paths,
      // we need to add in potential additional roots of package.json
      // which otherwise won't be found by `resolve()`.
      const dirsSet = new Set(dirs);
      const dirsExtra = dirs
        .map((filePath) => getLastPackageRoot(filePath))
        .filter((pkgPath) => !dirsSet.has(pkgPath));

      // Join and remove any empty / false-y dirs.
      return []
        .concat(dirs, dirsExtra)
        .filter(Boolean);
    },
    // Note: We can hit multiple package.json's if within a *single*
    // package which is definitely non-standard. See the test
    // `handles requires with arguments and local libs` for such a
    // scenario.
    packageFilter: (pkg, pkgfile) => {
      // Skip processing if already encountered package.json file.
      if (pkgPaths.includes(pkgfile)) {
        return pkg;
      }

      // Short circuit if dependency is relative.
      // https://nodejs.org/api/esm.html#resolver-algorithm-specification
      // > Otherwise, if specifier starts with "/", "./" or "../", then
      // > Set resolved to the URL resolution of specifier relative to parentURL.
      const isRelative
        = depName.startsWith("/")
        || depName.startsWith("./")
        || depName.startsWith("../")
      ;

      // Only add exports from the _root_ package.json for a given module.
      // From basic experiments, if we have:
      //
      // ```
      // ROOT/package.json:exports        -> "./nested": "./nested/from-root.js"
      // ROOT/nested/package.json:exports -> ".": "./from-nested.js"
      // ```
      //
      // The **root** one (`ROOT/nested/from-root.js`) always wins.
      if (!pkgPaths.length && !isRelative) {
        const pkgDir = path.dirname(pkgfile);

        // Special case handle "passthrough" export configuration to make
        // modern ESM act like old file-based CommonJS.
        //
        // Our approach is to simply ignore these declarations since the
        // `resolve` library takes care of the straight path-based file
        // resolution already and there's nothing _different_ we expect
        // to happen with an export mapping.
        //
        // **NOTE**: Mutates `package.json`.
        //
        // From: https://nodejs.org/api/packages.html#packages_package_entry_points
        // > As a last resort, package encapsulation can be disabled entirely
        // > by creating an export for the root of the package "./*": "./*".
        // > This exposes every file in the package at the cost of disabling
        // > the encapsulation and potential tooling benefits this provides.
        // > As the ES Module loader in Node.js enforces the use of the full
        // > specifier path, exporting the root rather than being explicit
        // > about entry is less expressive than either of the prior examples.
        // > Not only is encapsulation lost but module consumers are unable to
        // > import feature from 'my-mod/feature' as they need to provide the
        // > full path import feature from 'my-mod/feature/index.js.
        Object.entries(PASSTHROUGH_EXPORTS).forEach(([key, vals]) => {
          if (vals.has((pkg.exports || {})[key])) {
            delete pkg.exports[key];
          }
        });

        CONDITIONS.forEach((cond) => {
          let resolveOpts;
          if (Array.isArray(cond)) {
            resolveOpts = cond[1];
            cond = cond[0];
          }

          let relPath;
          try {
            relPath = resolveExports.resolve(pkg, depName, {
              conditions: [cond],
              require: cond === "require",
              ...resolveOpts
            });
          } catch (e) {
            // Swallow export resolve errors, as things like a subpath
            // reference allowed in node10 that doesn't have an export
            // specification.
          }

          // If we have defined exports, resolve and add to tracking list.
          if (relPath) {
            // Use fullPath as our map key because there are likely to be
            // duplicate export sources in package.json configurations.
            const fullPath = path.resolve(pkgDir, relPath);
            exportSrcs.set(fullPath, { relPath, fullPath });
          }
        });
      }

      pkgPaths.push(pkgfile);
      return pkg;
    }
  })
    // **Special Case #1**: Handle missing `package.json:main` or old CJS path
    // miss with extra, early catch + re-throw
    .catch((err) => {
      // Detect and allow the following scenarios when we have 1+ valid
      // matching exports:
      // - Missing `package.json:main`
      // - A subpath like `pkg/path` with `exports` matches of non-`.js`
      //   files (like `.cjs` and `.mjs`)
      if (err.code === "MODULE_NOT_FOUND" && exportSrcs.size) {
        return null;
      }

      throw err;
    })
    // Add in package files if any.
    .then(async (depPath) => {
      // Validate the export source paths exist, format and send on.
      const exportPaths = await Promise.all(Array.from(exportSrcs.values()).map(
        async ({ relPath, fullPath }) => {
          if (!await fileExists(fullPath)) {
            // Mimic not found error from `resolve` library.
            const err = new Error(
              `Cannot find export '${relPath}' in module '${depName}' from '${basedir}'`
            );
            err.code = "MODULE_NOT_FOUND";
            throw err;
          }

          return fullPath;
        }
      ));

      return { depPath, pkgPaths, exportPaths };
    })
    // **Special Case #2**: Due to some weird behavior in `resolve`, we never
    // even get to a `packageFilter` package.json file to inspect when we hit
    // the case of:
    // 1. A missing `package.json:main`
    // 2. A dependency path of the form `pkg/one/two` (at least one intermediate
    //    directory from the package name).
    // In this limited case, detect and try again with more package.json path
    // candidates.
    .catch((err) => {
      if (
        err.code === "MODULE_NOT_FOUND"
        && pkgPaths.length === 0
        && exportSrcs.size === 0
        && !addRootPackagePaths
      ) {
        const { name, parts } = getDependencyParts(depName) || {};

        // eslint-disable-next-line no-magic-numbers
        if (name && parts.length >= 2) {
          // Try again with special flag to check root package files.
          return _resolveDep({
            depName,
            basedir,
            srcPath,
            dependencies,
            extraDepKeys,
            addMisses,
            allowMissing,
            bailOnMissing,
            addRootPackagePaths: true
          });
        }
      }

      throw err;
    })
    // Now, generally handle missing modules.
    .catch((err) => {
      // Handle module not found.
      if (err.code === "MODULE_NOT_FOUND") {
        // If allowed, then add to depObjs anyway.
        if (isAllowedMiss({ depName, srcPath, allowMissing })) {
          return { depPath: depName, pkgPaths: [], exportPaths: [] };
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
 * @param {Object}        opts.ecmaVersion        ECMAScript version to be passed to acorn
 * @param {Object}        opts._extraImports      (internal) normalized map
 * @param {Set}           opts._tracedDepPaths    (internal) tracked dependencies
 * @returns {Promise<Object>}                     dependencies and other information
 */
// eslint-disable-next-line max-statements,complexity
const traceFile = async ({
  srcPath,
  ignores = [],
  allowMissing = {},
  bailOnMissing = true,
  includeSourceMaps = false,
  extraImports = {},
  ecmaVersion = DEFAULT_ECMA_VERSION,
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

  // Source Maps
  const sourceMap = new SourceMap({ basedir, includeSourceMaps });
  const onComment = sourceMap.onComment.bind(sourceMap);

  // Parse and extract.
  //
  // Rather than trying to infer if a given source file is ESM vs. CJS, we just
  // try both...
  let ast;
  try {
    // First try as a module.
    ast = parse(src, {
      sourceType: "module",
      allowAwaitOutsideFunction: true, // for top-level await
      locations: true,
      onComment,
      ecmaVersion
    });
  } catch (modErr) {
    // Then as script.
    try {
      ast = parse(src, { sourceType: "script", locations: true, onComment, ecmaVersion });
    } catch (scriptErr) {
      // Use original module error, with some helper errors.
      throw new Error(`Encountered parse error in ${srcPath}: ${modErr}`);
    }
  }

  // Traverse dependencies and add in.
  const { dependencies, misses } = getDeps({ ast, src });
  const allDepKeys = new Set(dependencies.keys());
  const extraDepKeys = getExtraImports({ srcPath, _extraImports });
  Array.from(extraDepKeys).forEach((key) => {
    allDepKeys.add(key);
  });

  // Start results object.
  const results = {
    dependencies: [],
    misses: {},
    ...includeSourceMaps ? { sourceMaps: sourceMap.getPaths() } : undefined
  };

  // Create miss accumulator and kick off with top-level misses.
  const fullSrcPath = path.resolve(srcPath);
  const addMisses = (vals = []) => {
    if (!vals.length) { return; }
    results.misses[fullSrcPath] = (results.misses[fullSrcPath] || []).concat(vals);
  };
  addMisses(misses.map((miss) => Object.assign({}, miss, { type: "dynamic" })));

  // Handle dependencies.
  const depNames = uniq(allDepKeys)
    // Remove ignored names.
    .filter((depName) => !ignores.some(matchesPkgPrefix({ fullSrcPath, depName })));
  if (!depNames.length) {
    // Base case: no additional dependencies.
    return results;
  }

  // Resolve to full file paths.
  // TODO(5): Consider limiting concurrent resolution.
  // https://github.com/FormidableLabs/trace-deps/issues/5
  // Start with the resolve path and any package.json used to get there.
  const depObjs = await Promise
    .all(depNames.map((depName) => _resolveDep({
      depName,
      basedir,
      srcPath,
      dependencies,
      extraDepKeys,
      addMisses,
      allowMissing,
      bailOnMissing
    })))
    // Post-resolution processing.
    .then((allPaths) => allPaths
      .filter((depObj, i) => {
        // Remove empty names (e.g., from allowed missing modules).
        if (!depObj) {
          return false;
        }

        // Remove core standard Node.js libraries (`path`, etc.)
        return depObj.depPath !== depNames[i];
      })
    );

  // Extract to different types of paths.
  const depPaths = uniq(depObjs.reduce(
    (memo, { depPath, exportPaths }) => memo.concat(depPath || [], exportPaths),
    []
  ));
  const allPkgPaths = uniq(depObjs.reduce(
    (memo, { pkgPaths }) => memo.concat(pkgPaths),
    []
  ));

  // Aggregate all resolved deps and recurse into each file and resolve further.
  _tracedDepPaths.add(srcPath);
  const recursed = await _recurseDeps({
    depPaths,
    ignores,
    allowMissing,
    bailOnMissing,
    includeSourceMaps,
    ecmaVersion,
    _extraImports,
    _tracedDepPaths
  });

  results.misses = sortObj(Object.assign(results.misses, recursed.misses));
  results.dependencies = uniq([].concat(
    allPkgPaths,
    recursed.dependencies
  ));

  if (includeSourceMaps) {
    results.sourceMaps = uniq([].concat(
      results.sourceMaps || [],
      recursed.sourceMaps || []
    ));
  }

  // Make unique and return.
  return results;
};

/**
 * Trace and return on-disk locations of all file dependencies from source files.
 *
 * @param {*}             opts                    options object
 * @param {Array<string>} opts.srcPaths           source file paths to trace
 * @param {Array<string>} opts.ignores            list of package prefixes to ignore
 * @param {Object}        opts.allowMissing       map packages to list of allowed missing package
 * @param {boolean}       opts.bailOnMissing      allow static dependencies to be missing
 * @param {boolean}       opts.includeSourceMaps  include source map paths in output
 * @param {Object}        opts.extraImports       map files to additional imports to trace
 * @param {Object}        opts.ecmaVersion        ECMAScript version to be passed to acorn
 * @param {Object}        opts._extraImports      (internal) normalized map
 * @param {Set}           opts._tracedDepPaths    (internal) tracked dependencies
 * @returns {Promise<Object>}                     dependencies and other information
 */
const traceFiles = async ({
  srcPaths,
  ignores = [],
  allowMissing = {},
  bailOnMissing = true,
  includeSourceMaps = false,
  extraImports = {},
  ecmaVersion = DEFAULT_ECMA_VERSION,
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
    ecmaVersion,
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
