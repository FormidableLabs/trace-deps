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
    it("TODO: remove mock test", async () => {
      mock({
        "hi.js": "module.exports = 'hi';"
      });
      expect(await traceFile({ file: "hi.js" })).to.include("TODO/one.js");
    });
    it("handles no dependencies."); // TODO
    it("handles circular dependencies."); // TODO
    it("handles single requires with .js."); // TODO
    it("handles single imports with .mjs."); // TODO
    it("handles nested requires with .js."); // TODO
    it("handles nested imports with .mjs."); // TODO
  });
});
