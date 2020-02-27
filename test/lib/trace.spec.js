"use strict";

const mock = require("mock-fs");

const { traceFile } = require("../../lib/trace");


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
    it("handles circular dependencies"); // TODO
    it("handles single requires with .js"); // TODO
    it("handles single imports with .mjs"); // TODO
    it("handles nested requires with .js"); // TODO
    it("handles nested imports with .mjs"); // TODO
    it("ignores specified names and prefixes"); // TODO
  });

  describe("traceFiles", () => {
    it("TODO TESTS"); // TODO
  });
});
