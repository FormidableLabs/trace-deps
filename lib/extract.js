"use strict";

/**
 * Extract dependencies from code.
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
    ImportDeclaration({ source } = {}) {
      source = source || {};
      if (source.type === "Literal") {
        deps.add(source.value);
      }
    },

    // ESM: `import()`
    // https://nodejs.org/api/esm.html#esm_import_expressions
    //
    // ```js
    // import("foo");
    // ```
    //
    // ```yml
    // type: ImportExpression
    // source:
    //   type: Literal
    //   value: foo
    //   raw: '"foo"'
    // ```
    ImportExpression({ source } = {}) {
      source = source || {};
      if (source.type === "Literal") {
        deps.add(source.value);
      }
    },

    // ESM: `export { <var> } from`
    //
    // ```js
    // export { one } from "one";
    // ```
    //
    // ```yml
    // type: ExportNamedDeclaration
    // declaration: null
    // specifiers:
    //   - type: ExportSpecifier
    //     local: &ref_0
    //       type: Identifier
    //       name: one
    //     exported: *ref_0
    // source:
    //   type: Literal
    //   value: one
    //   raw: '"one"'
    // ```
    //
    // ESM: `export { <var> as <other-var> } from`
    //
    // ```js
    // export { two as twoVar } from "two";
    // ```
    //
    // ```yml
    // type: ExportNamedDeclaration
    // declaration: null
    // specifiers:
    //   - type: ExportSpecifier
    //     local:
    //       type: Identifier
    //       name: two
    //     exported:
    //       type: Identifier
    //       name: twoVar
    // source:
    //   type: Literal
    //   value: two
    //   raw: '"two"'
    // ```
    //
    // ESM: `export * as <var> from`
    //
    // ```js
    // export * as four from "four";
    // ```
    //
    // ```yml
    // type: ExportNamedDeclaration
    // declaration: null
    // specifiers:
    //   - type: ExportNamespaceSpecifier
    //     exported:
    //       type: Identifier
    //       name: four
    // source:
    //   type: Literal
    //   value: four
    //   raw: '"four"'
    // ```
    ExportNamedDeclaration({ source } = {}) {
      source = source || {};
      if (source.type === "Literal") {
        deps.add(source.value);
      }
    },

    // ESM: `export * from`
    //
    // ```js
    // export * from "three";
    // ```
    //
    // ```yml
    // type: ExportAllDeclaration
    // source:
    //   type: Literal
    //   value: three
    //   raw: '"three"'
    // ```
    ExportAllDeclaration({ source } = {}) {
      source = source || {};
      if (source.type === "Literal") {
        deps.add(source.value);
      }
    }

    // ESM: `import.meta.resolve()`
    // https://nodejs.org/api/esm.html#esm_no_require_resolve
    // TODO(3): Implement `import.meta.resolve()`
    // https://github.com/FormidableLabs/trace-deps/issues/3
  });

  return deps;
};

module.exports = {
  getDeps
};
