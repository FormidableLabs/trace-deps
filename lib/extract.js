"use strict";

/**
 * Extract dependencies from code.
 */
const path = require("path");

const walk = require("acorn-walk").simple;

// Helper to extract a usable string argument.
const getStringArg = ({ args }) => {
  // Only continue with exactly **one** argument.
  const firstArg = args.length === 1 ? args[0] : {};

  // String literal.
  if (firstArg.type === "Literal") {
    return firstArg.value;
  }

  // Template string: Require a single TemplateElement quasis and nothing else.
  if (
    firstArg.type === "TemplateLiteral"
    && !firstArg.expressions.length
    && firstArg.quasis.length === 1
    && firstArg.quasis[0].type === "TemplateElement"
  ) {
    // Cooked can technically be undefined.
    // https://2ality.com/2016/09/template-literal-revision.html#solution
    const { cooked } = firstArg.quasis[0].value;
    return typeof cooked === "undefined" ? null : cooked;
  }

  // Default: No usable string.
  return null;
};

const getNode = ({ node: { start, end, loc }, src }) => ({
  start,
  end,
  loc,
  src: src.slice(start, end).toString()
});

const getDep = ({ dep, node, src }) => Object.assign(getNode({ node, src }), { dep });

// Extract all dependency strings from require/import statements.
const getDeps = ({ ast, src }) => {
  const dependencies = new Map();
  const misses = [];

  walk(ast, {
    // Node
    // eslint-disable-next-line complexity
    CallExpression(node) {
      // Populate callee with empty defaults.
      const callee = Object.assign({ object: {}, property: {} }, node.callee);

      // Only get first argument if only one to ensure we have a single string
      // literal for `require()` and `import()`.
      const args = node.arguments || [];
      const dep = getStringArg({ args });

      // Node: `require`
      //
      // ## Hits
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
      //
      // ```js
      // require(`foo`);
      // ```
      //
      // ```yml
      // type: CallExpression
      // callee:
      //   type: Identifier
      //   name: require
      // arguments:
      // - type: TemplateLiteral
      //   expressions: []
      //   quasis:
      //     - type: TemplateElement
      //       value:
      //         raw: foo
      //         cooked: foo
      //       tail: true
      // ```
      //
      // ## Misses
      //
      // ```js
      // require(A_VAR);
      // ```
      //
      // ```yml
      // type: CallExpression
      // callee:
      //   type: Identifier
      //   name: require
      // arguments:
      //   - type: Identifier
      //     name: A_VAR
      // ```
      //
      // ```js
      // require("a"|`a`|A_VAR + B_VAR|"_b"|`_b`);
      // ```
      //
      // ```yml
      // type: CallExpression
      // callee:
      //   type: Identifier
      //   name: require
      // arguments:
      // - type: BinaryExpression
      //   left:
      //     type: <Something>
      //     <...>
      //   operator: +
      //   right:
      //     type: <Something>
      //     <...>
      // ```
      //
      // ```js
      // require(`a_template_string_${A_VAR}`);
      // ```
      //
      // ```yml
      // type: CallExpression
      // callee:
      //   type: Identifier
      //   name: require
      // arguments:
      // - type: TemplateLiteral
      //   expressions:
      //     - type: Identifier
      //       name: A_VAR
      //   quasis:
      //     - type: TemplateElement
      //       value:
      //         raw: a_template_string_
      //         cooked: a_template_string_
      //       tail: false
      //     - type: TemplateElement
      //       value:
      //         raw: ''
      //         cooked: ''
      //       tail: true
      // ```
      if (callee.type === "Identifier" && callee.name === "require") {
        // Hit.
        if (dep !== null) {
          return void dependencies.set(dep, getDep({ dep, node, src }));
        }

        // Miss.
        return void misses.push(getNode({ node, src }));
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
        && callee.property.type === "Identifier" && callee.property.name === "resolve") {
        // Hit.
        if (dep !== null) {
          return void dependencies.set(dep, getDep({ dep, node, src }));
        }

        // Miss.
        return void misses.push(getNode({ node, src }));
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
    ImportDeclaration(node) {
      const source = node.source || {};
      const dep = source.value;
      if (source.type === "Literal") {
        dependencies.set(dep, getDep({ dep, node, src }));
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
    //
    // ```js
    // import(`foo`);
    // ```
    //
    // ```yml
    // type: ImportExpression
    // source:
    //   type: TemplateLiteral
    //   expressions: []
    //   quasis:
    //     - type: TemplateElement
    //       value:
    //         raw: foo
    //         cooked: foo
    //       tail: true
    // ```
    ImportExpression(node) {
      const dep = getStringArg({ args: [node.source || {}] });

      // Hit.
      if (dep !== null) {
        return void dependencies.set(dep, getDep({ dep, node, src }));
      }

      // Miss.
      return void misses.push(getNode({ node, src }));
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
    ExportNamedDeclaration(node) {
      const source = node.source || {};
      const dep = source.value;
      if (source.type === "Literal") {
        dependencies.set(dep, getDep({ dep, node, src }));
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
    ExportAllDeclaration(node) {
      const source = node.source || {};
      const dep = source.value;
      if (source.type === "Literal") {
        dependencies.set(dep, getDep({ dep, node, src }));
      }
    }

    // ESM: `import.meta.resolve()`
    // https://nodejs.org/api/esm.html#esm_no_require_resolve
    // TODO(3): Implement `import.meta.resolve()`
    // https://github.com/FormidableLabs/trace-deps/issues/3
  });

  return { dependencies, misses };
};

const SOURCE_MAP_HASH_PREFIX = "# sourceMappingURL=";
const SOURCE_MAP_AT_PREFIX = "@ sourceMappingURL=";
const HTTP_RE = /^http(s)?:\/\//;

// Extractor helper.
class SourceMap {
  constructor({ basedir, includeSourceMaps = false }) {
    this.basedir = basedir;
    this.includeSourceMaps = includeSourceMaps;
    this.sourceMapPath = undefined;
  }

  // Extract source map URLs from comments, and resolve to full paths.
  //
  // Source Maps comment spec: https://sourcemaps.info/spec.html#h.lmz475t4mvbx
  //
  // Allow:
  // - `//# sourceMappingURL=<url>`
  // - `//@ sourceMappingURL=<url>`
  //
  // ... in single line form only. This means we ignore the CSS version:
  // - `/*# sourceMappingURL=<url> */`
  //
  // We also presently ignore `http|https://`-style URLs.
  onComment(block, text) {
    text = text.trim();

    // Must be inline comment.
    if (block === true) { return; }

    let url;
    if (text.startsWith(SOURCE_MAP_HASH_PREFIX)) {
      url = text.replace(SOURCE_MAP_HASH_PREFIX, "").trim();
    } else if (text.startsWith(SOURCE_MAP_AT_PREFIX)) {
      url = text.replace(SOURCE_MAP_AT_PREFIX, "").trim();
    }

    // Could not extract a URL.
    if (!url) { return; }

    // URL is not file-based.
    if (HTTP_RE.test(url)) { return; }

    // Update sourceMapPath
    this.sourceMapPath = path.resolve(this.basedir, url);
  }

  // Return array of last non-empty path.
  getPaths() {
    return this.sourceMapPath ? [this.sourceMapPath] : [];
  }
}

module.exports = {
  getDeps,
  SourceMap
};
