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

    it("handles single requires with .js", async () => {
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

    it("handles single imports with .mjs"); // TODO
    it("handles nested requires with .js"); // TODO
    it("handles nested imports with .mjs"); // TODO
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
