"use strict";

/**
 * Package utilities.
 */
const path = require("path");

// Return in-order list of all `node_modules` packages from a file path.
const getPackages = (filePath) => {
  if (!filePath) { return []; }

  // Iterate all normalized parts of the file path and extract packages.
  return path.normalize(filePath).split(path.sep)
    .map((part, i, parts) => {
      if (parts[i - 1] === "node_modules") {
        if (part[0] !== "@") {
          // Unscoped: Add name.
          return part;
        }

        const nextPart = parts[i + 1];
        if (nextPart) {
          // Scoped: Add scope + name.
          return `${part}/${nextPart}`;
        }
      }

      return null;
    })
    .filter(Boolean);
};

// Return last (deepest) package in a file path.
const getLastPackage = (filePath) => getPackages(filePath).pop() || null;

// Return the entire path after that last (deepest) package after `node_modules`
const getLastPackageSegment = (filePath) => {
  if (!filePath) { return null; }

  // Iterate all normalized parts of the file path and extract packages.
  const parts = path.normalize(filePath).split(path.sep);
  const lastModsIdx = parts.lastIndexOf("node_modules");
  // Not within node_modules.
  if (lastModsIdx === -1) { return null; }

  const relParts = parts.slice(lastModsIdx + 1);
  // Not a valid starting package.
  if (relParts.length === 0 || relParts.length === 1 && relParts[0][0] === "@") { return null; }

  const relPath = relParts.join(path.sep);
  return relPath || null;
};

// Get path up to and including the package name (but no further).
const getLastPackageRoot = (filePath) => {
  if (!filePath) { return null; }

  // Iterate all normalized parts of the file path and extract packages.
  const parts = path.normalize(filePath).split(path.sep);
  const lastModsIdx = parts.lastIndexOf("node_modules");

  // Not within node_modules or potential path possibility.
  if (lastModsIdx === -1 || lastModsIdx + 1 === parts.length) { return null; }

  // Find package root index. Start with unscoped.
  let pkgRootIdx = lastModsIdx + 1;
  if (parts[pkgRootIdx][0] === "@") {
    // Check possible scoped path possibility.
    if (pkgRootIdx + 1 === parts.length) { return null; }
    // Scoped.
    pkgRootIdx++;
  }

  return parts.slice(0, pkgRootIdx + 1).join(path.sep);
};

// Return module name and relative path (as array of path parts).
const getDependencyParts = (dep) => {
  if (
    !dep
    || path.isAbsolute(dep)
    || dep.startsWith(".")
  ) {
    return null;
  }

  // Note that `package.json:exports` don't normalize/resolve `..` or file
  // paths, so leave them intact (which means manually replace `\\` instead
  // of using `toPosixPath`).
  let parts = dep
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean);

  let name;
  if (parts.length > 0) {
    if (parts[0][0] === "@") {
      if (parts[1]) {
        name = `${parts[0]}/${parts[1]}`;
        parts = parts.slice(2); // eslint-disable-line no-magic-numbers
      }
    } else if (parts[0]) {
      name = parts[0];
      parts = parts.slice(1);
    }
  }

  if (!name) {
    return null;
  }

  return { name, parts };
};

module.exports = {
  getPackages,
  getLastPackage,
  getLastPackageSegment,
  getLastPackageRoot,
  getDependencyParts
};
