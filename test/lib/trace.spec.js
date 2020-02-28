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
    it("throws on no source file", async () => {
      await expect(traceFile()).to.be.rejectedWith("Empty source file path");
    });

    it("throws on nonexistent source file", async () => {
      await expect(traceFile({ srcPath: "nope.js" })).to.be.rejectedWith(
        "Could not find source file"
      );
    });

    it("throws on nonexistent dependency", async () => {
      mock({
        "hi.js": "require('doesnt-exist');"
      });

      await expect(traceFile({ srcPath: "hi.js" })).to.be.rejectedWith(
        "Encountered resolution error in hi.js for doesnt-exist: "
        + "Error: Cannot find module 'doesnt-exist' from '.'"
      );
    });

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

          const variableDep = "shouldnt-find";
          require(variableDep);

          const variableResolve = "also-shouldnt-find";
          require.resolve(variableResolve);
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

            const variableDep = "shouldnt-find";
            await import(variableDep);
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
        "hi.mjs": `
          import one from "one";
          const dynamicTwo = () => import("two");

          (async () => {
            await import("three");

            const variableDep = "shouldnt-find";
            await import(variableDep);
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

      expect(await traceFile({ srcPath: "hi.mjs" })).to.eql(fullPath([
        "node_modules/nested-flattened-three/index.mjs",
        "node_modules/one/index.mjs",
        "node_modules/three/index.mjs",
        "node_modules/two/index.mjs"
      ]));
    });

    it("handles lower directories than where file is located", async () => {
      mock({
        nested: {
          path: {
            "hi.js": `
              const one = require("one");
              require("two");
            `
          },
          node_modules: {
            one: {
              "package.json": stringify({
                main: "index.js"
              }),
              "index.js": "module.exports = 'one';"
            }
          }
        },
        node_modules: {
          two: {
            "package.json": stringify({
              main: "index.js"
            }),
            "index.js": "module.exports = 'two';"
          }
        }
      });

      expect(await traceFile({ srcPath: "nested/path/hi.js" })).to.eql(fullPath([
        "nested/node_modules/one/index.js",
        "node_modules/two/index.js"
      ]));
    });

    it("handles circular dependencies", async () => {
      mock({
        "hi.js": `
          // All are circular. Import two of them.
          require("one");
          require("three");
        `,
        node_modules: {
          one: {
            "package.json": stringify({
              main: "index.js"
            }),
            "index.js": `
              module.exports = {
                one: () => "one",
                two: () => require("two").two
              };
            `
          },
          two: {
            "package.json": stringify({
              main: "index.js"
            }),
            "index.js": `
              module.exports = {
                two: () => "two",
                three: () => require("three").three
              };
            `
          },
          three: {
            "package.json": stringify({
              main: "index.js"
            }),
            "index.js": `
              module.exports = {
                three: () => "three",
                four: () => require("four").four
              };
            `
          },
          four: {
            "package.json": stringify({
              main: "index.js"
            }),
            "index.js": `
              module.exports = {
                one: () => require("one").one,
                four: () => "four"
              };
            `
          }
        }
      });

      expect(await traceFile({ srcPath: "hi.js" })).to.eql(fullPath([
        "node_modules/four/index.js",
        "node_modules/one/index.js",
        "node_modules/three/index.js",
        "node_modules/two/index.js"
      ]));
    });

    it("ignores specified names and prefixes", async () => {
      mock({
        "hi.js": `
          require("one");
          const nope = () => import("doesnt-exist");
          require.resolve("does-exist-shouldnt-import/index");
        `,
        node_modules: {
          one: {
            "package.json": stringify({
              main: "index.js"
            }),
            "index.js": `
              module.exports = {
                one: () => "one",
                two: () => require("two").two
              };
            `
          },
          two: {
            "package.json": stringify({
              main: "index.js"
            }),
            "index.js": `
              module.exports = {
                two: () => "two"
              };
            `
          },
          "does-exist-shouldnt-import": {
            "package.json": stringify({
              main: "index.js"
            }),
            "index.js": `
              module.exports = "does-exist-shouldnt-import";
            `
          }
        }
      });

      expect(await traceFile({
        srcPath: "hi.js",
        ignores: [
          "doesnt-exist",
          "does-exist-shouldnt-import"
        ]
      })).to.eql(fullPath([
        "node_modules/one/index.js",
        "node_modules/two/index.js"
      ]));
    });
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

    it("handles dynamic imports with .js", async () => {
      mock({
        "first.js": `
          const one = require("one");
          const dynamicTwo = () => import("two");
        `,
        "second.js": `
          const one = require.resolve("one");

          (async () => {
            await import("three");

            const variableDep = "shouldnt-find";
            await import(variableDep);
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

      expect(await traceFiles({ srcPaths: [
        "first.js",
        "second.js"
      ] })).to.eql(fullPath([
        "node_modules/one/index.js",
        "node_modules/three/index.mjs",
        "node_modules/three/node_modules/nested-three/index.mjs",
        "node_modules/two/index.js"
      ]));
    });

    it("handles dynamic imports with .mjs", async () => {
      mock({
        "first.mjs": `
          import one from "one";
          const dynamicTwo = () => import("two");
        `,
        "second.mjs": `
          import one from "one";

          (async () => {
            await import("three");

            const variableDep = "shouldnt-find";
            await import(variableDep);
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

      expect(await traceFiles({ srcPaths: [
        "first.mjs",
        "second.mjs"
      ] })).to.eql(fullPath([
        "node_modules/nested-flattened-three/index.mjs",
        "node_modules/one/index.mjs",
        "node_modules/three/index.mjs",
        "node_modules/two/index.mjs"
      ]));
    });
  });
});
