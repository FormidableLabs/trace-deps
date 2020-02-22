"use strict";

const { parse } = require("acorn-node");
const walk = require("acorn-node/walk");
const { exists } = require("./util");

// TODO: Support
// - require
// - require.resolve
// - static import

const parseDeps = (ast) => {
  const deps = new Set();

  walk.simple(ast, {
    // Node: `require`
    CallExpression(node) {
      const callee = node.callee || {};
      const firstArg = (node.arguments || [])[0];
      if (
        callee.type === "Identifier" && callee.name === "require"
        && firstArg.type === "Literal"
      ) {
        deps.add(firstArg.value);
      }
    },

    // Node: `require.resolve` TODO

    // ESM: `import`
    ImportDeclaration({ source = {} }) {
      if (source.type === "Literal") {
        deps.add(source.value);
      }
    }

    // ESM: `import()` TODO
  });

  return deps;
};

/**
 * Trace and return on-disk locations of all file dependencies from a source file.
 *
 * @param {*}       opts              options object
 * @param {string}  opts.file         source file to trace
 * @returns {Promise<Array<String>>}  list of relative paths to on-disk dependencies
 */
const traceFile = async ({ file } = {}) => {
  if (!file) {
    throw new Error("Empty file");
  } else if (!await exists(file)) {
    throw new Error(`Could not find source file: ${file}`);
  }

  const CJS_FILE = `
    const React = require("react");
    if (true) {
      require("nested");
    }
    module.exports = 'hi';
  `;
  const cjsDeps = parseDeps(parse(CJS_FILE));

  const ESM_FILE = `
    "use module";

    import * as React from "react";
    import "bar";
    const foo = () => "foo";

    export default foo;
  `;
  const esmDeps = parseDeps(parse(ESM_FILE, { sourceType: "module" }));

  return {
    cjs: Array.from(cjsDeps).sort(),
    esm: Array.from(esmDeps).sort()
  };
};

// TODO: REMOVE
if (require.main === module) {
  traceFile({ file: __filename })
    .then(console.log) // eslint-disable-line no-console
    .catch((err) => {
      console.error(err); // eslint-disable-line no-console
      process.exit(-1); // eslint-disable-line no-process-exit
    });
}

module.exports = {
  traceFile
};
