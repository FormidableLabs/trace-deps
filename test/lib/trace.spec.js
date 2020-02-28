"use strict";

const path = require("path");
const mock = require("mock-fs");

const { traceFile, traceFiles } = require("../../lib/trace");

const INDENT = 2;
const stringify = (val) => JSON.stringify(val, null, INDENT);
const fullPath = (paths) => paths.map((p) => path.resolve(p));

describe("lib/trace", () => {
  beforeEach(() => {
    mock({});
  });

  afterEach(() => {
    mock.restore();
  });

  describe("traceFile", () => {
    it("handles no dependencies", async () => {
      mock({
        "hi.js": "module.exports = 'hi';"
      });

      expect(await traceFile({ srcPath: "hi.js" })).to.eql([]);
    });

    it("handles requires with .js", async () => {
      mock({
        "hi.js": `
          const one = require("one");
          require("two");
        `,
        node_modules: {
          one: {
            "package.json": stringify({
              main: "index.js"
            }),
            "index.js": "module.exports = 'one';"
          },
          two: {
            "package.json": stringify({
              main: "index.js"
            }),
            "index.js": "module.exports = 'two';"
          }
        }
      });

      expect(await traceFile({ srcPath: "hi.js" })).to.eql(fullPath([
        "node_modules/one/index.js",
        "node_modules/two/index.js"
      ]));
    });

    it("handles imports with .mjs", async () => {
      mock({
        "hi.mjs": `
          import { one } from "one";
          import "two";
        `,
        node_modules: {
          one: {
            "package.json": stringify({
              main: "index.mjs"
            }),
            "index.mjs": "export const one = 'one';"
          },
          two: {
            "package.json": stringify({
              main: "index.mjs"
            }),
            "index.mjs": `
              const two = 'two';
              export default two;
            `
          }
        }
      });

      expect(await traceFile({ srcPath: "hi.mjs" })).to.eql(fullPath([
        "node_modules/one/index.mjs",
        "node_modules/two/index.mjs"
      ]));
    });

    it("handles nested requires with .js", async () => {
      mock({
        "hi.js": `
          const one = require("one");
          if (one === "one") {
            require.resolve("two");
          }
        `,
        node_modules: {
          one: {
            "package.json": stringify({
              main: "index.js"
            }),
            "index.js": `
              const subDepOne = require("sub-dep-one");
              module.exports = 'one';
            `,
            node_modules: {
              "sub-dep-one": {
                "package.json": stringify({
                  main: "index.js"
                }),
                "index.js": `
                  module.exports = 'one';
                `
              }
            }
          },
          two: {
            "package.json": stringify({
              main: "index.js"
            }),
            "index.js": `
              const subDepTwo = require("sub-dep-flattened-two");
              module.exports = subDepTwo;
            `
          },
          "sub-dep-flattened-two": {
            "package.json": stringify({
              main: "index.js"
            }),
            "index.js": `
              module.exports = 'two';
            `
          }
        }
      });

      expect(await traceFile({ srcPath: "hi.js" })).to.eql(fullPath([
        "node_modules/one/index.js",
        "node_modules/one/node_modules/sub-dep-one/index.js",
        "node_modules/sub-dep-flattened-two/index.js",
        "node_modules/two/index.js"
      ]));
    });

    it("handles dynamic imports with .js", async () => {
      mock({
        "hi.js": `
          const one = require("one");
          const dynamicTwo = () => import("two");

          (async () => {
            await import("three");
          })();
        `,
        node_modules: {
          one: {
            "package.json": stringify({
              main: "index.js"
            }),
            "index.js": "module.exports = 'one';"
          },
          two: {
            "package.json": stringify({
              main: "index.js"
            }),
            "index.js": "module.exports = 'two';"
          },
          three: {
            "package.json": stringify({
              main: "index.mjs"
            }),
            "index.mjs": `
              import three from "nested-three";
              export default three;
            `,
            node_modules: {
              "nested-three": {
                "package.json": stringify({
                  main: "index.mjs"
                }),
                "index.mjs": "export const three = 'three';"
              }
            }
          }
        }
      });

      expect(await traceFile({ srcPath: "hi.js" })).to.eql(fullPath([
        "node_modules/one/index.js",
        "node_modules/three/index.mjs",
        "node_modules/three/node_modules/nested-three/index.mjs",
        "node_modules/two/index.js"
      ]));
    });

    it("handles dynamic imports with .mjs", async () => {
      mock({
        "hi.js": `
          const one = require("one");
          const dynamicTwo = () => import("two");

          (async () => {
            await import("three");
          })();
        `,
        node_modules: {
          one: {
            "package.json": stringify({
              main: "index.mjs"
            }),
            "index.mjs": `
              const one = 'one';
              export default one;
            `
          },
          two: {
            "package.json": stringify({
              main: "index.mjs"
            }),
            "index.mjs": `
              const two = 'two';
              export default two;
            `
          },
          three: {
            "package.json": stringify({
              main: "index.mjs"
            }),
            "index.mjs": `
              import three from "nested-flattened-three";
              export default three;
            `
          },
          "nested-flattened-three": {
            "package.json": stringify({
              main: "index.mjs"
            }),
            "index.mjs": "export const three = 'three';"
          }
        }
      });

      expect(await traceFile({ srcPath: "hi.js" })).to.eql(fullPath([
        "node_modules/nested-flattened-three/index.mjs",
        "node_modules/one/index.mjs",
        "node_modules/three/index.mjs",
        "node_modules/two/index.mjs"
      ]));
    });

    it("handles lower directories than where file is located"); // TODO
    it("handles circular dependencies"); // TODO
    it("ignores specified names and prefixes"); // TODO
  });

  describe("traceFiles", () => {
    it("handles empty sources list", async () => {
      expect(await traceFiles({ srcPaths: [] })).to.eql([]);
    });

    it("handles no dependencies", async () => {
      mock({
        "hi.js": "module.exports = 'hi';"
      });

      expect(await traceFiles({ srcPaths: ["hi.js"] })).to.eql([]);
    });

    it("TODO TESTS"); // TODO
  });
});
