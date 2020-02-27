"use strict";

const mock = require("mock-fs");

const { traceFile } = require("..");

describe("index", () => {
  beforeEach(() => {
    mock({});
  });

  afterEach(() => {
    mock.restore();
  });

  describe("traceFile", () => {
    it("handles no dependencies", async () => {
      mock({
        "exported.js": "module.exports = 'exported';"
      });

      expect(await traceFile({ srcPath: "exported.js" })).to.eql([]);
    });
  });

  describe("traceFiles", () => {
    it("TODO TESTS"); // TODO
  });
});
