"use strict";

const { parse } = require("acorn-node");
const walk = require("acorn-node/walk");
const { exists, readFile } = require("./util");

// TODO: Support
// - require
// - require.resolve
// - static import

const parseDeps = (ast) => {
  const deps = new Set();

  walk.simple(ast, {
    // Node
    CallExpression(node) {
      // Populate callee with empty defaults.
      const callee = {
        object: {},
        property: {},
        ...node.callee || {}
      };

      // Only get first argument if only one to ensure we have a single string
      // literal.
      const args = node.arguments || [];
      const firstArg = args.length === 1 ? args[0] : {};

      // Node: `require`
      //
      // ```js
      // require("foo");
      // ```
      //
      // ```yml
      // type: CallExpression
      // callee:
      //   type: Identifier
      //   name: require
      // arguments:
      // - type: Literal
      //   value: foo
      //   raw: '"foo"'
      // ```
      if (
        callee.type === "Identifier" && callee.name === "require"
        && firstArg.type === "Literal"
      ) {
        deps.add(firstArg.value);
      }

      // Node: `require.resolve`
      //
      // ```js
      // require.resolve("foo");
      // ```
      //
      // ```yml
      // type: CallExpression
      // callee:
      //   type: MemberExpression
      //   object:
      //     type: Identifier
      //     name: require
      //   property:
      //     type: Identifier
      //     name: resolve
      //   computed: false
      // arguments:
      // - type: Literal
      //   value: foo
      //   raw: '"foo"'
      // ```
      if (callee.type === "MemberExpression"
        && callee.object.type === "Identifier" && callee.object.name === "require"
        && callee.property.type === "Identifier" && callee.property.name === "resolve"
        && firstArg.type === "Literal") {
        deps.add(firstArg.value);
      }
    },

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

// TODO: Delete
const SAMPLE_SRC_FILE = `
import * as React from "react-esm";
import "bar-esm";

// Shouldn't be included
const stringifiedReq = "require('dont-include-me')";

// Some CJS stuff too
const ReactDom = require("react-dom-cjs");
if (true) {
  require("nested-cjs");

  const baz = require.resolve("resolved-baz-cjs");
}

const foo = () => "foo";

export default foo;
`;

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

  const src = await readFile(file);
  const deps = parseDeps(parse(src, { sourceType: "module" }));

  // TODO: Resolve each dep to file location.
  // TODO: Recurse and read.

  return Array.from(deps).sort();
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
