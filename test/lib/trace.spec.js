"use strict";

/* eslint-disable max-statements */

const path = require("path");
const mock = require("mock-fs");

const { traceFile, traceFiles } = require("../../lib/trace");

const INDENT = 2;
const stringify = (val) => JSON.stringify(val, null, INDENT);
const fullPath = (paths) => paths.map((p) => path.resolve(p));

// Resolve file paths in keys to OS-native.
const resolveObjKeys = (obj) => Object.entries(obj)
  .map(([key, val]) => [path.resolve(key), val])
  .reduce((memo, [key, val]) => ({ ...memo, [key]: val }), {});

// Convert to map of sources.
const missesMap = ({ misses }) => Object.entries(misses)
  .map(([key, objs]) => {
    // Test and mutate.
    const srcs = objs.map((obj, i) => {
      const msg = `Entry(${i}): ${key}, val: ${JSON.stringify(obj)}`;
      expect(obj, msg).to.have.keys("start", "end", "loc", "src");

      return obj.src;
    });

    return [key, srcs];
  })
  .reduce((memo, [key, srcs]) => ({ ...memo, [key]: srcs }), {});

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

      const { dependencies, misses } = await traceFile({ srcPath: "hi.js" });
      expect(dependencies).to.eql([]);
      expect(misses).to.eql({});
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
          require.resolve(\`interpolated_\${variableResolve}\`);
          require.resolve("binary" + "-expression");
          require.resolve("binary" + variableResolve);
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

      const srcPath = "hi.js";
      const { dependencies, misses } = await traceFile({ srcPath });
      expect(dependencies).to.eql(fullPath([
        "node_modules/one/index.js",
        "node_modules/one/package.json",
        "node_modules/three/index.js",
        "node_modules/three/package.json",
        "node_modules/two/index.js",
        "node_modules/two/package.json"
      ]));

      expect(missesMap({ misses })).to.eql(resolveObjKeys({
        [srcPath]: [
          "require(variableDep)",
          "require(`interpolated_${variableDep}`)",
          "require(\"binary\" + \"-expression\")",
          "require(\"binary\" + variableDep)",
          "require.resolve(variableResolve)",
          "require.resolve(`interpolated_${variableResolve}`)",
          "require.resolve(\"binary\" + \"-expression\")",
          "require.resolve(\"binary\" + variableResolve)"
        ]
      }));
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

      const { dependencies, misses } = await traceFile({ srcPath: "hi.mjs" });
      expect(dependencies).to.eql(fullPath([
        "node_modules/one/index.mjs",
        "node_modules/one/package.json",
        "node_modules/three/index.mjs",
        "node_modules/three/package.json",
        "node_modules/two/index.mjs",
        "node_modules/two/package.json"
      ]));
      expect(misses).to.eql({});
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

      const { dependencies, misses } = await traceFile({ srcPath: "hi.mjs" });
      expect(dependencies).to.eql(fullPath([
        "node_modules/four/index.mjs",
        "node_modules/four/package.json",
        "node_modules/one/index.mjs",
        "node_modules/one/package.json",
        "node_modules/three/index.mjs",
        "node_modules/three/package.json",
        "node_modules/two/index.mjs",
        "node_modules/two/package.json"
      ]));
      expect(misses).to.eql({});
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

      const { dependencies, misses } = await traceFile({ srcPath: "hi.js" });
      expect(dependencies).to.eql(fullPath([
        "node_modules/one/index.js",
        "node_modules/one/node_modules/sub-dep-one/index.js",
        "node_modules/one/node_modules/sub-dep-one/package.json",
        "node_modules/one/package.json",
        "node_modules/sub-dep-flattened-two/index.js",
        "node_modules/sub-dep-flattened-two/package.json",
        "node_modules/two/index.js",
        "node_modules/two/package.json"
      ]));
      expect(misses).to.eql({});
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

      const srcPath = "hi.js";
      const { dependencies, misses } = await traceFile({ srcPath });
      expect(dependencies).to.eql(fullPath([
        "node_modules/one/index.js",
        "node_modules/one/package.json",
        "node_modules/three/index.mjs",
        "node_modules/three/node_modules/nested-three/index.mjs",
        "node_modules/three/node_modules/nested-three/package.json",
        "node_modules/three/package.json",
        "node_modules/two/index.js",
        "node_modules/two/package.json"
      ]));
      expect(missesMap({ misses })).to.eql(resolveObjKeys({
        [srcPath]: [
          "import(variableDep)",
          "import(variableResolve)",
          "import(`interpolated_${variableDep}`)",
          "import(\"binary\" + \"-expression\")",
          "import(\"binary\" + variableDep)"
        ]
      }));
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

      const srcPath = "hi.mjs";
      const { dependencies, misses } = await traceFile({ srcPath });
      expect(dependencies).to.eql(fullPath([
        "node_modules/nested-flattened-three/index.mjs",
        "node_modules/nested-flattened-three/package.json",
        "node_modules/one/index.mjs",
        "node_modules/one/package.json",
        "node_modules/three/index.mjs",
        "node_modules/three/package.json",
        "node_modules/two/index.mjs",
        "node_modules/two/package.json"
      ]));
      expect(missesMap({ misses })).to.eql(resolveObjKeys({
        [srcPath]: [
          "import(variableDep)"
        ]
      }));
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

      const { dependencies, misses } = await traceFile({ srcPath: "nested/path/hi.js" });
      expect(dependencies).to.eql(fullPath([
        "nested/node_modules/one/index.js",
        "nested/node_modules/one/package.json",
        "node_modules/two/index.js",
        "node_modules/two/package.json"
      ]));
      expect(misses).to.eql({});
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

      const { dependencies, misses } = await traceFile({ srcPath: "hi.js" });
      expect(dependencies).to.eql(fullPath([
        "node_modules/four/index.js",
        "node_modules/four/package.json",
        "node_modules/one/index.js",
        "node_modules/one/package.json",
        "node_modules/three/index.js",
        "node_modules/three/package.json",
        "node_modules/two/index.js",
        "node_modules/two/package.json"
      ]));
      expect(misses).to.eql({});
    });

    it("ignores specified names and prefixes", async () => {
      mock({
        "hi.js": `
          require("one");
          const nope = () => import("doesnt-exist");
          const nestedNope = () => import("doesnt-exist-nested/one/two");
          const nestedMore = () => import("doesnt-exist-nested/one/even/more.js");
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

      const { dependencies, misses } = await traceFile({
        srcPath: "hi.js",
        ignores: [
          "doesnt-exist",
          "doesnt-exist-nested/one",
          "does-exist-shouldnt-import"
        ]
      });
      expect(dependencies).to.eql(fullPath([
        "node_modules/one/index.js",
        "node_modules/one/package.json",
        "node_modules/two/index.js",
        "node_modules/two/package.json"
      ]));
      expect(misses).to.eql({});
    });

    it("handles try/catch misses requires", async () => {
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

              const nested = require("doesnt-exist-nested/one/more.js");

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

      const { dependencies, misses } = await traceFile({
        srcPath: "hi.js",
        allowMissing: {
          "nested-trycatch-require": [
            "doesnt-exist",
            "doesnt-exist-nested/one"
          ],
          "nested-trycatch-requireresolve": [
            "also-doesnt-exist"
          ]
        }
      });
      expect(dependencies).to.eql(fullPath([
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
      expect(misses).to.eql({});
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

      const { dependencies, misses } = await traceFile({ srcPath: "hi.js" });
      expect(dependencies).to.eql(fullPath([
        "node_modules/one/index.json",
        "node_modules/one/package.json",
        "node_modules/three/index.js",
        "node_modules/three/package.json",
        "node_modules/two/index.json",
        "node_modules/two/package.json"
      ]));
      expect(misses).to.eql({});
    });

    it("reports on complex, nested misses", async () => {
      mock({
        "hi.js": `
          const one = require("one");
          require("two");
          require(\`three\`);
        `,
        node_modules: {
          one: {
            "package.json": stringify({
              main: "index.js"
            }),
            "index.js": `
              const more = require("./more");
              const variableDep = "shouldnt-find-one";
              const fn = () => require(variableDep);

              module.exports = 'one';
            `,
            "more.js": `
              require(\`interpolated_\${variableDep}\`);
              require("binary" + "-expression");
              require("binary" + variableDep);
              module.exports = "one-more";
            `
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
            "index.js": "module.exports = require('three-more');",
            node_modules: {
              "three-more": {
                "package.json": stringify({
                  main: "index.js"
                }),
                "index.js": "module.exports = require('./more');",
                "more.js": `
                  const variableResolve = "also-shouldnt-find";
                  require.resolve(variableResolve);
                  require.resolve(\`interpolated_\${variableResolve}\`);
                  require.resolve("binary" + "-expression");
                  require.resolve("binary" + variableResolve);

                  module.exports = 'three-more-more!';
                `
              }
            }
          }
        }
      });

      const srcPath = "hi.js";
      const { dependencies, misses } = await traceFile({ srcPath });
      expect(dependencies).to.eql(fullPath([
        "node_modules/one/index.js",
        "node_modules/one/more.js",
        "node_modules/one/package.json",
        "node_modules/three/index.js",
        "node_modules/three/node_modules/three-more/index.js",
        "node_modules/three/node_modules/three-more/more.js",
        "node_modules/three/node_modules/three-more/package.json",
        "node_modules/three/package.json",
        "node_modules/two/index.js",
        "node_modules/two/package.json"
      ]));

      expect(missesMap({ misses })).to.be.eql(resolveObjKeys({
        "node_modules/one/index.js": [
          "require(variableDep)"
        ],
        "node_modules/one/more.js": [
          "require(`interpolated_${variableDep}`)",
          "require(\"binary\" + \"-expression\")",
          "require(\"binary\" + variableDep)"
        ],
        "node_modules/three/node_modules/three-more/more.js": [
          "require.resolve(variableResolve)",
          "require.resolve(`interpolated_${variableResolve}`)",
          "require.resolve(\"binary\" + \"-expression\")",
          "require.resolve(\"binary\" + variableResolve)"
        ]
      }));
    });

    it("errors on syntax errors", async () => {
      mock({
        "hi.js": `
          UN;&!PARSEABLE
        `
      });

      const srcPath = "hi.js";
      await expect(traceFile({ srcPath })).to.be.rejectedWith(
        /Encountered parse error in .* SyntaxError: Unexpected token/
      );
    });

    it("handles already declared identifier code", async () => {
      mock({
        "hi.js": `
          var foo = foo;

          function foo() { return "Wow, this is valid!"; }

          require("one");
        `,
        node_modules: {
          one: {
            "package.json": stringify({
              main: "index.js"
            }),
            "index.js": `
              module.exports = 'one';
            `
          }
        }
      });

      const srcPath = "hi.js";
      const { dependencies, misses } = await traceFile({ srcPath });
      expect(dependencies).to.eql(fullPath([
        "node_modules/one/index.js",
        "node_modules/one/package.json"
      ]));

      expect(missesMap({ misses })).to.be.eql({});
    });

    it("adds extraImports", async () => {
      mock({
        "hi.js": `
          require("./lib/middle/ho");
          require("./lib/middle/how");
          require("one");
        `,
        lib: {
          middle: {
            "ho.js": `
              module.exports = "No actual missing imports";
            `,
            "how.js": `
              module.exports = "No actual missing imports";
            `
          },
          extra: {
            "file.js": `
              module.exports = "Not imported directly";
            `,
            "file2.js": `
              module.exports = "Not imported directly";
            `
          }
        },
        node_modules: {
          one: {
            "package.json": stringify({
              main: "index.js"
            }),
            "index.js": `
              require("./lib/nested/deeper-one");

              module.exports = {
                one: () => "one",
                two: () => require("two").two
              };
            `,
            lib: {
              nested: {
                "deeper-one.js": `
                  module.exports = require(process.env.MISSING_DYNAMIC_IMPORT);
                `
              }
            }
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
          "extra-pkg-app": {
            "package.json": stringify({
              main: "index.js"
            }),
            "index.js": `
              module.exports = "Not directly imported via extraImports";
            `,
            nested: {
              "path.js": `
                module.exports = "Directly imported via extraImports";
              `
            }
          },
          "extra-pkg-one": {
            "package.json": stringify({
              main: "index.js"
            }),
            "index.js": `
              module.exports = "Directly imported via extraImports";
            `
          },
          "extra-pkg-from-extra-import": {
            "package.json": stringify({
              main: "index.js"
            }),
            "index.js": `
              module.exports = "An extraImports bring this one in!";
            `
          }
        }
      });

      const { dependencies, misses } = await traceFile({
        srcPath: "hi.js",
        extraImports: {
          // Absolute path, so application source file with **full match**
          // Use win32 path.
          [path.win32.resolve("./lib/middle/ho.js")]: [
            "../extra/file",
            "extra-pkg-app/nested/path"
          ],
          // Use posix path.
          [path.posix.resolve("./lib/middle/how.js")]: [
            "../extra/file2"
          ],
          // Package, so relative match after _last_ `node_modules`.
          "one/lib/nested/deeper-one.js": [
            "extra-pkg-one"
          ],
          // Package from the **above** extra import! Should also get traversed
          // same as the other ones...
          "extra-pkg-one/index.js": [
            "extra-pkg-from-extra-import"
          ]
        }
      });
      expect(dependencies).to.eql(fullPath([
        "lib/extra/file.js",
        "lib/extra/file2.js",
        "lib/middle/ho.js",
        "lib/middle/how.js",
        "node_modules/extra-pkg-app/nested/path.js",
        "node_modules/extra-pkg-app/package.json",
        "node_modules/extra-pkg-from-extra-import/index.js",
        "node_modules/extra-pkg-from-extra-import/package.json",
        "node_modules/extra-pkg-one/index.js",
        "node_modules/extra-pkg-one/package.json",
        "node_modules/one/index.js",
        "node_modules/one/lib/nested/deeper-one.js",
        "node_modules/one/package.json",
        "node_modules/two/index.js",
        "node_modules/two/package.json"
      ]));
      expect(missesMap({ misses })).to.eql(resolveObjKeys({
        "node_modules/one/lib/nested/deeper-one.js": [
          "require(process.env.MISSING_DYNAMIC_IMPORT)"
        ]
      }));
    });
  });

  describe("traceFiles", () => {
    it("handles empty sources list", async () => {
      const { dependencies, misses } = await traceFiles({ srcPaths: [] });
      expect(dependencies).to.eql([]);
      expect(misses).to.eql({});
    });

    it("handles no dependencies", async () => {
      mock({
        "hi.js": "module.exports = 'hi';"
      });

      const { dependencies, misses } = await traceFiles({ srcPaths: ["hi.js"] });
      expect(dependencies).to.eql([]);
      expect(misses).to.eql({});
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

      const { dependencies, misses } = await traceFiles({ srcPaths: [
        "first.js",
        "second.js"
      ] });
      expect(dependencies).to.eql(fullPath([
        "node_modules/one/index.js",
        "node_modules/one/package.json",
        "node_modules/three/index.mjs",
        "node_modules/three/node_modules/nested-three/index.mjs",
        "node_modules/three/node_modules/nested-three/package.json",
        "node_modules/three/package.json",
        "node_modules/two/index.js",
        "node_modules/two/package.json"
      ]));
      expect(missesMap({ misses })).to.eql(resolveObjKeys({
        "second.js": [
          "import(variableDep)"
        ]
      }));
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

      const { dependencies, misses } = await traceFiles({ srcPaths: [
        "first.mjs",
        "second.mjs"
      ] });
      expect(dependencies).to.eql(fullPath([
        "node_modules/nested-flattened-three/index.mjs",
        "node_modules/nested-flattened-three/package.json",
        "node_modules/one/index.mjs",
        "node_modules/one/package.json",
        "node_modules/three/index.mjs",
        "node_modules/three/package.json",
        "node_modules/two/index.mjs",
        "node_modules/two/package.json"
      ]));
      expect(missesMap({ misses })).to.eql(resolveObjKeys({
        "second.mjs": [
          "import(variableDep)"
        ]
      }));
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

      const { dependencies, misses } = await traceFiles({ srcPaths: ["hi.js"] });
      expect(dependencies).to.eql(fullPath([
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
      expect(missesMap({ misses })).to.eql(resolveObjKeys({
        "ho.js": [
          "require(variableDep)"
        ]
      }));
    });

    it("reports on complex, nested misses", async () => {
      mock({
        "first.js": `
          const one = require("one");
          require("two");
        `,
        "second.js": `
          require('./root-more');
        `,
        "root-more.js": `
          require(\`three\`);
        `,
        node_modules: {
          one: {
            "package.json": stringify({
              main: "index.js"
            }),
            "index.js": `
              const more = require("./more");
              const variableDep = "shouldnt-find-one";
              const fn = () => require(variableDep);

              module.exports = 'one';
            `,
            "more.js": `
              require(\`interpolated_\${variableDep}\`);
              require("binary" + "-expression");
              require("binary" + variableDep);
              module.exports = "one-more";
            `
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
            "index.js": "module.exports = require('three-more');",
            node_modules: {
              "three-more": {
                "package.json": stringify({
                  main: "index.js"
                }),
                "index.js": "module.exports = require('./more');",
                "more.js": `
                  const variableResolve = "also-shouldnt-find";
                  require.resolve(variableResolve);
                  require.resolve(\`interpolated_\${variableResolve}\`);
                  require.resolve("binary" + "-expression");
                  require.resolve("binary" + variableResolve);

                  module.exports = 'three-more-more!';
                `
              }
            }
          }
        }
      });

      const srcPaths = [
        "first.js",
        "second.js"
      ];
      const { dependencies, misses } = await traceFiles({ srcPaths });
      expect(dependencies).to.eql(fullPath([
        "node_modules/one/index.js",
        "node_modules/one/more.js",
        "node_modules/one/package.json",
        "node_modules/three/index.js",
        "node_modules/three/node_modules/three-more/index.js",
        "node_modules/three/node_modules/three-more/more.js",
        "node_modules/three/node_modules/three-more/package.json",
        "node_modules/three/package.json",
        "node_modules/two/index.js",
        "node_modules/two/package.json",
        "root-more.js"
      ]));

      expect(missesMap({ misses })).to.be.eql(resolveObjKeys({
        "node_modules/one/index.js": [
          "require(variableDep)"
        ],
        "node_modules/one/more.js": [
          "require(`interpolated_${variableDep}`)",
          "require(\"binary\" + \"-expression\")",
          "require(\"binary\" + variableDep)"
        ],
        "node_modules/three/node_modules/three-more/more.js": [
          "require.resolve(variableResolve)",
          "require.resolve(`interpolated_${variableResolve}`)",
          "require.resolve(\"binary\" + \"-expression\")",
          "require.resolve(\"binary\" + variableResolve)"
        ]
      }));
    });
  });
});
