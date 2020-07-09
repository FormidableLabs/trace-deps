"use strict";

/* eslint-disable max-statements */

const path = require("path");

const mock = require("mock-fs");
const sinon = require("sinon");

const { version } = require("../../package.json");
const { cli } = require("../../bin/trace-deps");

const INDENT = 2;
const stringify = (val) => JSON.stringify(val, null, INDENT);
const normalizePath = (line) => line.replace(
  /(\/PATH\/TO\/)([^"]*)/,
  (m, cwd, part) => path.normalize(path.resolve(part))
);
const normalizePaths = (str) => str
  .split("\n")
  .map(normalizePath)
  .join("\n");

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
        `.trim().replace(/^ {10}/gm, ""));
      });

      it("shows dependencies + misses in text format", async () => {
        mock({
          "hi.js": `
            const one = require("one");
            require("two");
            require(\`three\`);

            const variableDep = "missing-dynamic-pkg";
            require(variableDep);
            require.resolve("missing-static-pkg");
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
                main: "index.js"
              }),
              "index.js": "module.exports = 'three';"
            }
          }
        });

        await cli({ args: ["trace", "-i", "hi.js", "-o", "text"] });
        expect(logStub).to.be.calledWithMatch(normalizePaths(`
          ## Dependencies
          - /PATH/TO/node_modules/one/index.js
          - /PATH/TO/node_modules/one/package.json
          - /PATH/TO/node_modules/three/index.js
          - /PATH/TO/node_modules/three/package.json
          - /PATH/TO/node_modules/two/index.js
          - /PATH/TO/node_modules/two/package.json

          ## Misses
          - /PATH/TO/hi.js
            - dynamic (1)
              - "require(variableDep)"
            - static (1)
              - "missing-static-pkg"
        `.trim().replace(/^ {10}/gm, "")));
      });

      it("shows dependencies + misses in json format", async () => {
        mock({
          "hi.mjs": `
            import { one } from "one";
            export { two } from "two";
            import { three } from 'three';
            import missing from "missing-static-pkg";

            const variableDep = "missing-dynamic-pkg";
            import(variableDep);
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
              "index.mjs": "export const two = 'two';"
            },
            three: {
              "package.json": stringify({
                main: "index.mjs"
              }),
              "index.mjs": "export const three = 'three';"
            }
          }
        });

        await cli({ args: ["trace", "-i", "hi.mjs", "-o", "json"] });
        expect(logStub).to.be.calledWithMatch(stringify({
          dependencies: [
            "/PATH/TO/node_modules/one/index.mjs",
            "/PATH/TO/node_modules/one/package.json",
            "/PATH/TO/node_modules/three/index.mjs",
            "/PATH/TO/node_modules/three/package.json",
            "/PATH/TO/node_modules/two/index.mjs",
            "/PATH/TO/node_modules/two/package.json"
          ].map(normalizePath),
          misses: {
            [normalizePath("/PATH/TO/hi.mjs")]: [
              {
                start: 244,
                end: 263,
                loc: {
                  start: {
                    line: 8,
                    column: 12
                  },
                  end: {
                    line: 8,
                    column: 31
                  }
                },
                src: "import(variableDep)",
                type: "dynamic"
              },
              {
                start: 134,
                end: 175,
                loc: {
                  start: {
                    line: 5,
                    column: 12
                  },
                  end: {
                    line: 5,
                    column: 53
                  }
                },
                src: "import missing from \"missing-static-pkg\";",
                dep: "missing-static-pkg",
                type: "static"
              }
            ]
          }
        }));
      });
    });
  });
});
