"use strict";

const { promisify } = require("util");
const fs = require("fs");

// TODO: Collapse into inline?
const readFile = promisify(fs.readFile);

// TODO: Unused?
const stat = promisify(fs.stat);
const exists = (filePath) => stat(filePath)
  .then(() => true)
  .catch((err) => {
    if (err.code === "ENOENT") { return false; }
    throw err;
  });

// TODO: Check we actually need these.
module.exports = {
  exists,
  readFile
};
