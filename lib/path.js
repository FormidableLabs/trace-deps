"use strict";

const path = require("path");

const toPosixPath = (file) => !file ? file : path.normalize(file).replace(/\\/g, "/");

module.exports = {
  toPosixPath
};
