"use strict";

const { promisify } = require("util");
const fs = require("fs");

const readFile = promisify(fs.readFile);
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
