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

module.exports = {
  getPackages,
  getLastPackage,
  getLastPackageSegment
};
