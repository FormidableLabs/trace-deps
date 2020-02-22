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
    it("TODO: remove mock test", async () => {
      mock({
        "hi.js": "module.exports = 'hi';"
      });
      expect(await traceFile({ file: "hi.js" })).to.include("TODO/one.js");
    });
    it("handles no dependencies"); // TODO
    // TODO: Other tests?
  });
});
