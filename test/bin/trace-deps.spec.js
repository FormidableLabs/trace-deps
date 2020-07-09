"use strict";

/* eslint-disable max-statements */

const { version } = require("../../package.json");
const mock = require("mock-fs");
const sinon = require("sinon");

const { cli } = require("../../bin/trace-deps");

describe("bin/trace-deps", () => {
  let sandbox;
  let logStub;

  beforeEach(() => {
    mock({});
    sandbox = sinon.createSandbox();
    logStub = sandbox.stub(console, "log");
    sandbox.stub(console, "error");
  });

  afterEach(() => {
    sandbox.restore();
    mock.restore();
  });

  describe("cli", () => {
    describe("basics", () => {
      it("shows help with no args", async () => {
        await cli();
        expect(logStub).to.be.calledWithMatch("Usage: trace-deps");
      });

      it("shows help with --help", async () => {
        await cli({ args: ["--help"] });
        expect(logStub).to.be.calledWithMatch("Usage: trace-deps");
      });

      it("shows version with -v", async () => {
        await cli({ args: ["-v"] });
        expect(logStub).to.be.calledWith(version);
      });
    });

    describe("trace", () => {
      it("requires --input", async () => {
        await expect(cli({ args: ["trace"] }))
          .to.eventually.be.rejectedWith("Must specify --input file to trace");

        await expect(cli({ args: ["trace", "--input"] }))
          .to.eventually.be.rejectedWith("Must specify --input file to trace");

        await expect(cli({ args: ["trace", "--input", ""] }))
          .to.eventually.be.rejectedWith("Must specify --input file to trace");
      });

      it("errors on non-existent file", async () => {
        await expect(cli({ args: ["trace", "--input", "DOES_NOT_EXIST.js"] }))
          .to.eventually.be.rejectedWith("Could not find source file");
      });

      it("handles no dependencies", async () => {
        mock({
          "hi.js": "module.exports = 'hi';"
        });

        await cli({ args: ["trace", "--input", "hi.js"] });
        expect(logStub).to.be.calledWithMatch(`
          ## Dependencies


          ## Misses
        `.trim().replace(/ {10}/, ""));
      });

      it("shows dependencies + misses in text format"); // TODO
      it("shows dependencies + misses in json format"); // TODO
    });
  });
});
