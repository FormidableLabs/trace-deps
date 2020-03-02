"use strict";

const mock = require("mock-fs");

const { traceFile, traceFiles } = require("..");

describe("index", () => {
  beforeEach(() => {
    mock({});
  });

  afterEach(() => {
    mock.restore();
  });

  // ... some simple tests to just make sure we re-exported things.

  describe("traceFile", () => {
    it("handles no dependencies", async () => {
      mock({
        "exported.js": "module.exports = 'exported';"
      });

      expect(await traceFile({ srcPath: "exported.js" })).to.eql([]);
    });
  });

  describe("traceFiles", () => {
    it("handles no dependencies", async () => {
      mock({
        "exported.js": "module.exports = 'exported';"
      });

      expect(await traceFiles({ srcPaths: ["exported.js"] })).to.eql([]);
    });
  });
});
