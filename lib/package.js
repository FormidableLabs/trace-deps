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

module.exports = {
  getPackages,
  getLastPackage
};
