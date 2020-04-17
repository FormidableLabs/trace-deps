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

      const { dependencies } = await traceFile({ srcPath: "exported.js" });
      expect(dependencies).to.eql([]);
    });
  });

  describe("traceFiles", () => {
    it("handles no dependencies", async () => {
      mock({
        "exported.js": "module.exports = 'exported';"
      });

      const { dependencies } = await traceFiles({ srcPaths: ["exported.js"] });
      expect(dependencies).to.eql([]);
    });
  });
});
