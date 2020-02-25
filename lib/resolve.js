"use strict";

const { promisify } = require("util");
const _resolve = promisify(require("resolve"));

/**
 * Resolve on-disk location of dependencies.
 *
 * @param {*}       opts          options object
 * @param {string}  opts.basedir  path to source file's directory with dependency
 * @param {string}  opts.name     dependency name
 * @returns {Promise<Array<String>>} list of relative paths to on-disk dependencies.
 */
const resolve = ({ basedir, name }) => _resolve(name, {
  basedir
});

module.exports = {
  resolve
};
