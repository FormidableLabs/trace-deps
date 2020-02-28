"use strict";

/**
 * Extact dependencies from code.
 */

const walk = require("acorn-node/walk");

// Extract all dependency strings from require/import statements.
const getDeps = (ast) => {
  const deps = new Set();

  walk.simple(ast, {
    // Node
    // eslint-disable-next-line complexity
    CallExpression(node) {
      // Populate callee with empty defaults.
      const callee = {
        object: {},
        property: {},
        ...node.callee
      };

      // Only get first argument if only one to ensure we have a single string
      // literal for `require()` and `import()`.
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

      // ESM: `import()`
      // https://nodejs.org/api/esm.html#esm_import_expressions
      //
      // ```js
      // import("foo");
      // ```
      //
      // ```yml
      // callee:
      //   type: Import
      // arguments:
      // - type: Literal
      //   value: foo
      //   raw: "'foo'
      // ```
      if (
        callee.type === "Import" && firstArg.type === "Literal"
      ) {
        deps.add(firstArg.value);
      }
    },

    // ESM: `import`
    //
    // ```js
    // import "foo";
    // ```
    //
    // ```yml
    // type: ImportDeclaration
    // source:
    //   type: Literal
    //   value: foo
    //   raw: '"foo"'
    // ```
    ImportDeclaration({ source = {} }) {
      if (source.type === "Literal") {
        deps.add(source.value);
      }
    }

    // ESM: `import.meta.resolve()`
    // https://nodejs.org/api/esm.html#esm_no_require_resolve
    // TODO: https://github.com/FormidableLabs/trace-deps/issues/3
  });

  return deps;
};

module.exports = {
  getDeps
};
