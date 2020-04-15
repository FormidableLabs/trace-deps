"use strict";

/* eslint-disable max-statements */

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
          require(\`three\`);

          const variableDep = "shouldnt-find";
          require(variableDep);
          require(\`interpolated_\${variableDep}\`);
          require("binary" + "-expression");
          require("binary" + variableDep);

          const variableResolve = "also-shouldnt-find";
          require.resolve(variableResolve);
          require.resolve(\`interpolated_\${variableDep}\`);
          require.resolve("binary" + "-expression");
          require.resolve("binary" + variableDep);
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

      expect(await traceFile({ srcPath: "hi.js" })).to.eql(fullPath([
        "node_modules/one/index.js",
        "node_modules/one/package.json",
        "node_modules/three/index.js",
        "node_modules/three/package.json",
        "node_modules/two/index.js",
        "node_modules/two/package.json"
      ]));
    });

    it("handles imports with .mjs", async () => {
      mock({
        "hi.mjs": `
          import { one as oneVar } from "one";
          import "two";
          import * as three from "three";
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
          },
          three: {
            "package.json": stringify({
              main: "index.mjs"
            }),
            "index.mjs": `
              const threeNum = 3;
              const threeStr = 'three';
              export { threeNum, threeStr }
            `
          }
        }
      });

      expect(await traceFile({ srcPath: "hi.mjs" })).to.eql(fullPath([
        "node_modules/one/index.mjs",
        "node_modules/one/package.json",
        "node_modules/three/index.mjs",
        "node_modules/three/package.json",
        "node_modules/two/index.mjs",
        "node_modules/two/package.json"
      ]));
    });


    it("handles re-exports with .mjs", async () => {
      mock({
        "hi.mjs": `
          export { one } from "one";
          export { two as twoVar } from "two";
          export * from "three";
          export * as four from "four";
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
            "index.mjs": `
              const threeNum = 3;
              const threeStr = 'three';
              export { threeNum, threeStr };
            `
          },
          four: {
            "package.json": stringify({
              main: "index.mjs"
            }),
            "index.mjs": `
              const four = 'four';
              export default four;
            `
          }
        }
      });

      expect(await traceFile({ srcPath: "hi.mjs" })).to.eql(fullPath([
        "node_modules/four/index.mjs",
        "node_modules/four/package.json",
        "node_modules/one/index.mjs",
        "node_modules/one/package.json",
        "node_modules/three/index.mjs",
        "node_modules/three/package.json",
        "node_modules/two/index.mjs",
        "node_modules/two/package.json"
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
        "node_modules/one/node_modules/sub-dep-one/package.json",
        "node_modules/one/package.json",
        "node_modules/sub-dep-flattened-two/index.js",
        "node_modules/sub-dep-flattened-two/package.json",
        "node_modules/two/index.js",
        "node_modules/two/package.json"
      ]));
    });

    it("handles dynamic imports with .js", async () => {
      mock({
        "hi.js": `
          const one = require("one");
          const dynamicTwo = () => import(\`two\`);

          (async () => {
            await import("three");

            const variableDep = "shouldnt-find";
            await import(variableDep);
            await import(variableResolve);
            await import(\`interpolated_\${variableDep}\`);
            await import("binary" + "-expression");
            await import("binary" + variableDep);
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
        "node_modules/one/package.json",
        "node_modules/three/index.mjs",
        "node_modules/three/node_modules/nested-three/index.mjs",
        "node_modules/three/node_modules/nested-three/package.json",
        "node_modules/three/package.json",
        "node_modules/two/index.js",
        "node_modules/two/package.json"
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
        "node_modules/nested-flattened-three/package.json",
        "node_modules/one/index.mjs",
        "node_modules/one/package.json",
        "node_modules/three/index.mjs",
        "node_modules/three/package.json",
        "node_modules/two/index.mjs",
        "node_modules/two/package.json"
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
        "nested/node_modules/one/package.json",
        "node_modules/two/index.js",
        "node_modules/two/package.json"
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
        "node_modules/four/package.json",
        "node_modules/one/index.js",
        "node_modules/one/package.json",
        "node_modules/three/index.js",
        "node_modules/three/package.json",
        "node_modules/two/index.js",
        "node_modules/two/package.json"
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
              require("doesnt-exist");

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
        "node_modules/one/package.json",
        "node_modules/two/index.js",
        "node_modules/two/package.json"
      ]));
    });

    it("handles try/catch missing requires", async () => {
      mock({
        "hi.js": `
          require("one");

          const { aFunction } = require("nested-first-level");
          const { aFile } = require("nested-trycatch-requireresolve");
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
          "nested-first-level": {
            "package.json": stringify({
              main: "lib/index.js"
            }),
            lib: {
              "index.js": `
                const { aFunction } = require("nested-trycatch-require");

                module.exports = {
                  aFunction
                };
              `
            }
          },
          "nested-trycatch-require": {
            "package.json": stringify({
              main: "index.js"
            }),
            "index.js": `
              let aFunction;
              try {
                aFunction = () => import("doesnt-exist/with/path.js");
              } catch (err) {
                aFunction = () => null;
              }

              module.exports = { aFunction };
            `
          },
          "nested-trycatch-requireresolve": {
            "package.json": stringify({
              main: "index.js"
            }),
            "index.js": `
              let noFile = null;
              try {
                noFile = require.resolve("also-doesnt-exist");
              } catch (err) {}

              module.exports = { noFile };
            `
          }
        }
      });

      expect(await traceFile({
        srcPath: "hi.js",
        allowMissing: {
          "nested-trycatch-require": [
            "doesnt-exist"
          ],
          "nested-trycatch-requireresolve": [
            "also-doesnt-exist"
          ]
        }
      })).to.eql(fullPath([
        "node_modules/nested-first-level/lib/index.js",
        "node_modules/nested-first-level/package.json",
        "node_modules/nested-trycatch-require/index.js",
        "node_modules/nested-trycatch-require/package.json",
        "node_modules/nested-trycatch-requireresolve/index.js",
        "node_modules/nested-trycatch-requireresolve/package.json",
        "node_modules/one/index.js",
        "node_modules/one/package.json",
        "node_modules/two/index.js",
        "node_modules/two/package.json"
      ]));
    });

    it("still errors on missing imports in a catch", async () => {
      mock({
        "hi.js": `
          const { aFunction } = require("nested-first-level");
        `,
        node_modules: {
          "nested-first-level": {
            "package.json": stringify({
              main: "lib/index.js"
            }),
            lib: {
              "index.js": `
                const { aFunction } = require("nested-trycatch-require");

                module.exports = {
                  aFunction
                };
              `
            }
          },
          "nested-trycatch-require": {
            "package.json": stringify({
              main: "index.js"
            }),
            "index.js": `
              let aFunction;
              try {
                aFunction = () => import("doesnt-exist/with/path.js");
              } catch (err) {
                aFunction = () => null;
              }

              module.exports = { aFunction };
            `
          }
        }
      });

      await expect(traceFile({
        srcPath: "hi.js",
        allowMissing: {
          "nested-first-level": [
            // This won't be a permitted missing because only `nested-trycatch-require` is checked.
            "doesnt-exist"
          ]
        }
      })).to.be.rejectedWith(
        /Encountered resolution error in .*nested-trycatch-require.* for doesnt-exist.*/
      );
    });

    it("handles missing package.json:main and index.json", async () => {
      mock({
        "hi.js": `
          require("one");
          require("two");
          require("three");
        `,
        node_modules: {
          // `resolve()` can handle this straight up.
          one: {
            "package.json": stringify({
              main: "index.json"
            }),
            "index.json": JSON.stringify([
              "one",
              "1"
            ])
          },
          // `resolve()` **can't** handle this.
          two: {
            "package.json": stringify({
            }),
            "index.json": JSON.stringify([
              "two",
              "2"
            ])
          },
          // `resolve()` can handle this straight up.
          three: {
            "package.json": stringify({
            }),
            "index.js": "module.exports = 'three';"
          }
        }
      });

      expect(await traceFile({ srcPath: "hi.js" })).to.eql(fullPath([
        "node_modules/one/index.json",
        "node_modules/one/package.json",
        "node_modules/three/index.js",
        "node_modules/three/package.json",
        "node_modules/two/index.json",
        "node_modules/two/package.json"
      ]));
    });

    // TODO(misses): require(`foo`);
    // TODO(misses): require(`foo_${A_VAR}`);
    // TODO(misses): require("foo_" + A_VAR);
    // TODO(misses): require(A_VAR + "bar");
    // TODO(misses): require("foo_" + "bar");
    //
    // TODO(misses): ALL REQUIRES but for `require.resolve()`
    // TODO(misses): ALL REQUIRES but for `import()`
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
        "node_modules/one/package.json",
        "node_modules/three/index.mjs",
        "node_modules/three/node_modules/nested-three/index.mjs",
        "node_modules/three/node_modules/nested-three/package.json",
        "node_modules/three/package.json",
        "node_modules/two/index.js",
        "node_modules/two/package.json"
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
        "node_modules/nested-flattened-three/package.json",
        "node_modules/one/index.mjs",
        "node_modules/one/package.json",
        "node_modules/three/index.mjs",
        "node_modules/three/package.json",
        "node_modules/two/index.mjs",
        "node_modules/two/package.json"
      ]));
    });

    it("handles requires with arguments and local libs", async () => {
      mock({
        "hi.js": "module.exports = require('./ho');",
        "ho.js": `
          const one = require("one");
          require("two")("my message for two");

          const variableDep = "shouldnt-find";
          require(variableDep)();
        `,
        // TODO(13) Optimization: Verify `package.json` is not included
        // https://github.com/FormidableLabs/trace-deps/issues/13
        "package.json": stringify({
          description: "should be unused",
          main: "hi.js"
        }),
        node_modules: {
          one: {
            "package.json": stringify({
              main: "index.js"
            }),
            "index.js": `
              module.exports = {
                another: require("./another-one"),
                andMore: require("./and-more")
              };
            `,
            "another-one": {
              // Should use _index_ and not package.json
              // TODO(13) Optimization: Verify `another-one/package.json` is not included
              // https://github.com/FormidableLabs/trace-deps/issues/13
              "index.js": "module.exports = 'another one';",
              "package.json": stringify({
                description: "should be not included because it points to a bad path",
                main: "bad-path.js"
              })
            },
            "and-more": {
              // Should use _diff-path_ and include package.json
              "diff-path.js": "module.exports = 'one more';",
              "package.json": stringify({
                description: "should be included because it points to a good path",
                main: "diff-path.js"
              })
            }
          },
          two: {
            "package.json": stringify({
              main: "index.js"
            }),
            "index.js": "module.exports = (msg) => `two :${msg}`;"
          }
        }
      });

      expect(await traceFiles({ srcPaths: ["hi.js"] })).to.eql(fullPath([
        "ho.js",
        "node_modules/one/and-more/diff-path.js",
        "node_modules/one/and-more/package.json",
        "node_modules/one/another-one/index.js",
        "node_modules/one/another-one/package.json",
        "node_modules/one/index.js",
        "node_modules/one/package.json",
        "node_modules/two/index.js",
        "node_modules/two/package.json",
        "package.json"
      ]));
    });
  });
});
