"use strict";

/* eslint-disable max-statements */

const path = require("path");
const mock = require("mock-fs");

const { traceFile, traceFiles } = require("../../lib/trace");

const INDENT = 2;
const stringify = (val) => JSON.stringify(val, null, INDENT);
const fullPaths = (paths) => paths.map((p) => path.resolve(p));

// Resolve file paths in keys to OS-native.
const resolveObjKeys = (obj) => Object.entries(obj)
  .map(([key, val]) => [path.resolve(key), val])
  .reduce((memo, [key, val]) => Object.assign(memo, { [key]: val }), {});

// Convert to map of sources.
const missesMap = ({ misses }) => Object.entries(misses)
  .map(([key, objs]) => {
    // Test and mutate.
    const srcs = objs.map((obj, i) => {
      const msg = `Entry(${i}): ${key}, val: ${JSON.stringify(obj)}`;

      // Everything has a type.
      expect(obj, msg).to.include.keys("type");

      if (obj.type === "dynamic") {
        expect(obj, msg).to.have.keys("start", "end", "loc", "src", "type");
        return obj.src;
      } else if (obj.type === "static") {
        expect(obj, msg).to.have.keys("dep", "start", "end", "loc", "src", "type");
        return obj.dep;
      } else if (obj.type === "extra") {
        expect(obj, msg).to.have.keys("dep", "type");
        return obj.dep;
      }

      throw new Error(`Unknown object type: ${JSON.stringify(obj)}`);
    });

    return [key, srcs];
  })
  .reduce((memo, [key, srcs]) => Object.assign(memo, { [key]: srcs }), {});

describe("lib/trace", () => {
  beforeEach(() => {
    mock({});
  });

  afterEach(() => {
    mock.restore();
  });

  describe("traceFile", () => {
    describe("common errors", () => {
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

      it("throws on dependency with missing file", async () => {
        mock({
          "hi.js": "require('missing-file');",
          node_modules: {
            "missing-file": {
              "package.json": stringify({
                main: "file-doesnt-exist.js"
              })
            }
          }
        });

        await expect(traceFile({ srcPath: "hi.js" })).to.be.rejectedWith(
          "Encountered resolution error in hi.js for missing-file: "
          + "Error: Cannot find module 'missing-file' from '.'"
        );
      });

      it("throws on nonexistent extra dependency", async () => {
        mock({
          "hi.js": "module.exports = require('./ho');",
          "ho.js": "module.exports = 'ho';"
        });

        await expect(traceFile({
          srcPath: "hi.js",
          extraImports: {
            // Absolute path, so application source file with **full match**
            // Use win32 path.
            [path.resolve("ho.js")]: [
              "extra-is-missing"
            ]
          }
        })).to.be.rejectedWith(
          `Encountered resolution error in ${path.resolve("ho.js")} for extra-is-missing: `
          + `Error: Cannot find module 'extra-is-missing' from '${path.resolve(".")}'`
        );
      });

      it("throws on syntax errors", async () => {
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
    });

    describe("bailOnMissing", () => {
      it("handles nonexistent dependency with bailOnMissing=false", async () => {
        mock({
          "hi.js": "require('doesnt-exist');"
        });

        const srcPath = "hi.js";
        const { dependencies, misses } = await traceFile({
          srcPath,
          bailOnMissing: false
        });

        expect(dependencies).to.eql(fullPaths([]));
        expect(missesMap({ misses })).to.eql(resolveObjKeys({
          [srcPath]: [
            "doesnt-exist"
          ]
        }));
      });

      it("handles nonexistent extra dependency with bailOnMissing=false", async () => {
        mock({
          "hi.js": "module.exports = require('./ho');",
          "ho.js": "module.exports = 'ho';"
        });

        const srcPath = "hi.js";
        const { dependencies, misses } = await traceFile({
          srcPath,
          bailOnMissing: false,
          extraImports: {
            // Absolute path, so application source file with **full match**
            // Use win32 path.
            [path.resolve("ho.js")]: [
              "extra-is-missing"
            ]
          }
        });

        expect(dependencies).to.eql(fullPaths([
          "ho.js"
        ]));
        expect(missesMap({ misses })).to.eql(resolveObjKeys({
          "ho.js": [
            "extra-is-missing"
          ]
        }));
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
        expect(dependencies).to.eql(fullPaths([
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

      it("handles misses in entry point app source", async () => {
        mock({
          "entry.js": `
            require("missing-pkg");
          `
        });

        const { dependencies, misses } = await traceFile({
          srcPath: "entry.js",
          allowMissing: {
            [path.resolve("entry.js")]: [
              "missing-pkg"
            ]
          }
        });
        expect(dependencies).to.eql(fullPaths([]));
        expect(misses).to.eql({});
      });

      it("handles misses in full path entry point app source", async () => {
        mock({
          "entry.js": `
            require("missing-pkg");
          `
        });

        const { dependencies, misses } = await traceFile({
          srcPath: path.resolve("entry.js"),
          allowMissing: {
            [path.resolve("entry.js")]: [
              "missing-pkg"
            ]
          }
        });
        expect(dependencies).to.eql(fullPaths([]));
        expect(misses).to.eql({});
      });

      it("handles misses in nested app source", async () => {
        mock({
          "entry.js": `
            require("./nested");
          `,
          "nested.js": `
            module.exports = require("missing-pkg");
          `
        });

        const { dependencies, misses } = await traceFile({
          srcPath: "entry.js",
          allowMissing: {
            [path.resolve("nested.js")]: [
              "missing-pkg"
            ]
          }
        });
        expect(dependencies).to.eql(fullPaths([
          "nested.js"
        ]));
        expect(misses).to.eql({});
      });

      // Regression test: https://github.com/FormidableLabs/trace-deps/issues/49
      it("handles misses with package relative paths and prefix values", async () => {
        mock({
          "hi.js": `
            require("pkg");
          `,
          node_modules: {
            pkg: {
              "package.json": stringify({
                main: "index.js"
              }),
              "index.js": `
                require("./one");
                require("./nested/two.js");
                require("missing");
              `,
              "one.js": `
                require("missing/path/a");
                require("missing-in-one");
                require("missing-in-one-with-path/path/to/file.js");
              `,
              nested: {
                "two.js": `
                  require("missing/path/b");
                  require("missing-in-two");
                  require("missing-in-two-with-path/path/to/file.js");
              `
              }
            }
          }
        });

        const { dependencies, misses } = await traceFile({
          srcPath: "hi.js",
          allowMissing: {
            pkg: [
              "missing"
            ],
            "pkg/one.js": [
              "missing-in-one",
              "missing-in-one-with-path/path" // partial path
            ],
            "pkg/nested/two.js": [
              "missing-in-two",
              "missing-in-two-with-path/path/to/file.js" // full path
            ]
          }
        });
        expect(dependencies).to.eql(fullPaths([
          "node_modules/pkg/index.js",
          "node_modules/pkg/nested/two.js",
          "node_modules/pkg/one.js",
          "node_modules/pkg/package.json"
        ]));
        expect(misses).to.eql({});
      });
    });

    describe("includeSourceMaps", () => {
      it("includes source map files", async () => {
        mock({
          "hi.js": `
            const one = require("one");
            require("two");
            require(\`three\`);
            require("./ho");

            module.exports = 'hi';
            //# sourceMappingURL=hi.js.map
          `,
          "hi.js.map": "{\"not\":\"real\"}",
          "ho.js": `
            module.exports = 'ho';
            //# sourceMappingURL=/ABS/PATH/ho.js.map
          `,
          node_modules: {
            one: {
              "package.json": stringify({
                main: "index.js"
              }),
              "index.js": `
                module.exports = 'one';

                //# sourceMappingURL=early/map-comment/should-be-ignored

                //# sourceMappingURL=../one/index.not-map-suffix
              `,
              "index.jsbundle": "{\"not\":\"read\"}"
            },
            two: {
              "package.json": stringify({
                main: "index.js"
              }),
              "index.js": `
                module.exports = 'two';

                /*# sourceMappingURL=ignore/block/version.js.map */
              `
            },
            three: {
              "package.json": stringify({
                main: "index.js"
              }),
              "index.js": `
                module.exports = 'three';

                //# sourceMappingURL=https://ignore.com/http/and/https/urls.js.map
              `
            }
          }
        });

        const srcPath = "hi.js";
        const { dependencies, sourceMaps, misses } = await traceFile({
          srcPath,
          includeSourceMaps: true
        });

        expect(sourceMaps).to.eql(fullPaths([
          "/ABS/PATH/ho.js.map",
          "hi.js.map",
          "node_modules/one/index.not-map-suffix"
        ]));

        expect(dependencies).to.eql(fullPaths([
          "ho.js",
          "node_modules/one/index.js",
          "node_modules/one/package.json",
          "node_modules/three/index.js",
          "node_modules/three/package.json",
          "node_modules/two/index.js",
          "node_modules/two/package.json"
        ]));

        expect(missesMap({ misses })).to.eql(resolveObjKeys({}));
      });
    });

    describe("extraImports", () => {
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
            [path.resolve("./lib/middle/ho.js").replace(/\//g, "\\")]: [
              "../extra/file",
              "extra-pkg-app/nested/path"
            ],
            // Use posix path.
            [path.resolve("./lib/middle/how.js")]: [
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
        expect(dependencies).to.eql(fullPaths([
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

    describe("common tracing", () => {
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
        const { dependencies, sourceMaps, misses } = await traceFile({ srcPath });

        expect(sourceMaps).to.be.an("undefined");

        expect(dependencies).to.eql(fullPaths([
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
        expect(dependencies).to.eql(fullPaths([
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
        expect(dependencies).to.eql(fullPaths([
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
        expect(dependencies).to.eql(fullPaths([
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

      it("handles requires with .js, .cjs, and no extensions", async () => {
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
                    main: "index.cjs"
                  }),
                  "index.cjs": `
                    require("./full-path-with-ext.cjs");
                    require("./path-with-no-ext");
                    require("./a-json-file-implied-ext");
                    require("./a-json-file-with-ext.json");
                    module.exports = 'one';
                  `,
                  "full-path-with-ext.cjs": `
                    module.exports = 'full-path-with-ext';
                  `,
                  "path-with-no-ext": `
                    module.exports = 'path-with-no-ext';
                  `,
                  "a-json-file-implied-ext.json": stringify({
                    msg: "implied extension"
                  }),
                  "a-json-file-with-ext.json": stringify({
                    msg: "with extension"
                  })
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
                main: "index.cjs"
              }),
              "index.cjs": `
                module.exports = 'two';
              `
            }
          }
        });

        const { dependencies, misses } = await traceFile({ srcPath: "hi.js" });
        expect(dependencies).to.eql(fullPaths([
          "node_modules/one/index.js",
          "node_modules/one/node_modules/sub-dep-one/a-json-file-implied-ext.json",
          "node_modules/one/node_modules/sub-dep-one/a-json-file-with-ext.json",
          "node_modules/one/node_modules/sub-dep-one/full-path-with-ext.cjs",
          "node_modules/one/node_modules/sub-dep-one/index.cjs",
          "node_modules/one/node_modules/sub-dep-one/package.json",
          "node_modules/one/node_modules/sub-dep-one/path-with-no-ext",
          "node_modules/one/package.json",
          "node_modules/sub-dep-flattened-two/index.cjs",
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
        expect(dependencies).to.eql(fullPaths([
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
        expect(dependencies).to.eql(fullPaths([
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
        expect(dependencies).to.eql(fullPaths([
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
        expect(dependencies).to.eql(fullPaths([
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
        expect(dependencies).to.eql(fullPaths([
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
              // This won't be a permitted missing because only
              // `nested-trycatch-require` is checked.
              "doesnt-exist"
            ]
          }
        })).to.be.rejectedWith(
          /Encountered resolution error in .*nested-trycatch-require.* for doesnt-exist.*/
        );
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
        expect(dependencies).to.eql(fullPaths([
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
        expect(dependencies).to.eql(fullPaths([
          "node_modules/one/index.json",
          "node_modules/one/package.json",
          "node_modules/three/index.js",
          "node_modules/three/package.json",
          "node_modules/two/index.json",
          "node_modules/two/package.json"
        ]));
        expect(misses).to.eql({});
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
        expect(dependencies).to.eql(fullPaths([
          "node_modules/one/index.js",
          "node_modules/one/package.json"
        ]));

        expect(missesMap({ misses })).to.be.eql({});
      });
    });

    describe("modern ESM exports", () => {
      // Scenario is loosely based on
      // https://unpkg.com/browse/es-get-iterator@1.1.2/package.json
      // Notably CJS does _different_ things in legacy vs modern CJS.
      describe("complicated exports", () => {
        const createMock = ({ pkg, pkgFn = (p) => p, srcs } = {}) => mock({
          "require.js": `
            const its = require("complicated");
            const itsPkg = require("complicated/package");
          `,
          "import.mjs": `
            import its from "complicated";
            import itsPkg from "complicated/package";
            import fs from "fs"; // core package
          `,
          "dynamic-import.js": `
            (async () => {
              let its = "Dynamic import unsupported";
              try {
                its = await import("complicated");
              } catch (e) {}
            })();
          `,
          "dynamic-import.mjs": `
            (async () => {
              let its = "Dynamic import unsupported";
              try {
                its = await import("complicated");
              } catch (e) {}
            })();
          `,
          ...srcs,
          node_modules: {
            complicated: {
              "package.json": stringify(pkgFn({
                name: "complicated",
                main: "main.js",
                ...pkg
              })),
              "main.js": "require('subdep/from-main'); module.exports = 'main';",
              "browser.js": "module.exports = 'browser';",
              "development.js": "module.exports = 'development';",
              "production.mjs": "const msg = 'production'; export default msg;",
              "import.mjs": `
                import 'subdep';
                import './local/two.mjs';
                const msg = 'import';
                export default msg;
              `,
              "require.js": `
                require('subdep/from-require');
                require("./local/one");
                module.exports = 'require';
              `,
              "default.js": "require('subdep/from-default'); module.exports = 'default';",
              "fallback.js": "module.exports = 'fallback';",
              // These are _not_ exported, but locally referred to
              local: {
                "one.js": "module.exports = 'local/one';",
                "two.mjs": "const msg = 'two.mjs'; export default msg;"
              },
              sub1: {
                "index.js": "module.exports = 'sub1/index.js';",
                "index.cjs": "module.exports = 'sub1/index.cjs';",
                "index.mjs": "const msg = 'sub1/index.mjs'; export default msg;"
              },
              sub2: {
                "index.cjs": "module.exports = 'sub2/index.cjs';",
                "index.mjs": "const msg = 'sub2/index.mjs'; export default msg;",
                "another.cjs": "module.exports = 'sub2/another.cjs';",
                "another.mjs": "const msg = 'sub2/another.mjs'; export default msg;"
              }
            },
            subdep: {
              "package.json": stringify({
                name: "subdep",
                main: "main.js",
                exports: {
                  ".": {
                    "import": "./import.mjs",
                    "default": "./default.js"
                  },
                  "./from-import": "./from-import.mjs",
                  "./package.json": "./package.json"
                }
              }),
              "main.js": "module.exports = 'main';",
              "import.mjs": "const msg = 'import'; export default msg;",
              "default.js": "module.exports = 'default';",
              "from-main.js": "module.exports = 'from-main';",
              "from-import.mjs": "const msg = 'from import'; export default msg;",
              "from-require.js": "module.exports = 'from-require';",
              "from-default.js": "module.exports = 'from-default';"
            }
          }
        });

        describe("no exports", () => {
          beforeEach(() => {
            createMock();
          });

          [
            ["CJS static", "require.js"],
            ["ESM static", "import.mjs"],
            ["CJS dynamic", "dynamic-import.js"],
            ["ESM dynamic", "dynamic-import.mjs"]
          ].forEach(([name, srcPath]) => {
            it(`handles ${name} imports`, async () => {
              const { dependencies, misses } = await traceFile({ srcPath });

              expect(dependencies).to.eql(fullPaths([
                "node_modules/complicated/main.js",
                "node_modules/complicated/package.json",
                "node_modules/subdep/from-main.js",
                "node_modules/subdep/package.json"
              ]));
              expect(misses).to.eql({});
            });
          });
        });

        // Scenario from: https://github.com/nodejs/help/issues/2733#issuecomment-635975211
        describe("passthrough export", () => {
          beforeEach(() => {
            createMock({
              pkg: {
                exports: {
                  "./": "./"
                }
              }
            });
          });

          [
            ["CJS static", "require.js"],
            ["ESM static", "import.mjs"],
            ["CJS dynamic", "dynamic-import.js"],
            ["ESM dynamic", "dynamic-import.mjs"]
          ].forEach(([name, srcPath]) => {
            it(`handles ${name} imports`, async () => {
              const { dependencies, misses } = await traceFile({ srcPath });

              expect(dependencies).to.eql(fullPaths([
                "node_modules/complicated/main.js",
                "node_modules/complicated/package.json",
                "node_modules/subdep/from-main.js",
                "node_modules/subdep/package.json"
              ]));
              expect(misses).to.eql({});
            });
          });
        });

        describe("no require export", () => {
          beforeEach(() => {
            createMock({
              pkg: {
                exports: {
                  ".": [
                    {
                      browser: "./browser.js",
                      development: "./development.js",
                      production: "./production.mjs",
                      "import": "./import.mjs",
                      "default": "./default.js"
                    },
                    "./fallback.js"
                  ],
                  "./package": "./package.json",
                  "./package.json": "./package.json"
                }
              }
            });
          });

          [
            ["CJS static", "require.js"],
            ["ESM static", "import.mjs"],
            ["CJS dynamic", "dynamic-import.js"],
            ["ESM dynamic", "dynamic-import.mjs"]
          ].forEach(([name, srcPath]) => {
            it(`handles ${name} imports`, async () => {
              const { dependencies, misses } = await traceFile({ srcPath });

              expect(dependencies).to.eql(fullPaths([
                "node_modules/complicated/default.js",
                "node_modules/complicated/development.js",
                "node_modules/complicated/import.mjs",
                "node_modules/complicated/local/two.mjs",
                "node_modules/complicated/main.js",
                "node_modules/complicated/package.json",
                "node_modules/complicated/production.mjs",
                "node_modules/subdep/default.js",
                "node_modules/subdep/from-default.js",
                "node_modules/subdep/from-main.js",
                "node_modules/subdep/import.mjs",
                "node_modules/subdep/main.js",
                "node_modules/subdep/package.json"
              ]));
              expect(misses).to.eql({});
            });
          });
        });

        describe("no import export", () => {
          beforeEach(() => {
            createMock({
              pkg: {
                exports: {
                  ".": [
                    {
                      browser: "./browser.js",
                      development: "./development.js",
                      production: "./production.mjs",
                      require: "./require.js",
                      "default": "./default.js"
                    },
                    "./fallback.js"
                  ],
                  "./package": "./package.json",
                  "./package.json": "./package.json"
                }
              }
            });
          });

          [
            ["CJS static", "require.js"],
            ["ESM static", "import.mjs"],
            ["CJS dynamic", "dynamic-import.js"],
            ["ESM dynamic", "dynamic-import.mjs"]
          ].forEach(([name, srcPath]) => {
            it(`handles ${name} imports`, async () => {
              const { dependencies, misses } = await traceFile({ srcPath });

              expect(dependencies).to.eql(fullPaths([
                "node_modules/complicated/default.js",
                "node_modules/complicated/development.js",
                "node_modules/complicated/local/one.js",
                "node_modules/complicated/main.js",
                "node_modules/complicated/package.json",
                "node_modules/complicated/production.mjs",
                "node_modules/complicated/require.js",
                // Note: All of the import paths are to sub-paths, and **not**
                // the root package, so no defaults in play.
                "node_modules/subdep/from-default.js",
                "node_modules/subdep/from-main.js",
                "node_modules/subdep/from-require.js",
                "node_modules/subdep/package.json"
              ]));
              expect(misses).to.eql({});
            });
          });
        });

        // Notes:
        // - `sub1` is an easy index match _with_ the old CJS `sub1/index.js`
        //   file present, which allows any scenario to resolve.
        // - `sub2` has export matches for _only_ new CJS / ESM and not old
        //   CJS, and thus we need to handle that case.
        describe("subpaths", () => {
          beforeEach(() => {
            createMock({
              pkg: {
                exports: {
                  ".": [
                    {
                      "default": "./default.js"
                    }
                  ],
                  "./package": "./package.json",
                  "./package.json": "./package.json",
                  "./sub1": {
                    require: "./sub1/index.cjs",
                    "import": "./sub1/index.mjs"
                  },
                  "./sub2/*": {
                    require: "./sub2/*.cjs",
                    "import": "./sub2/*.mjs"
                  }
                }
              },
              srcs: {
                "require-subpath.js": `
                  require("complicated/sub1");
                  require("complicated/sub2/another");
                `,
                "import-subpath.mjs": `
                  import "complicated/sub1";
                  import "complicated/sub2/another";
                `,
                "dynamic-import-subpath.js": `
                  (async () => {
                    let sub1 = "Dynamic import unsupported";
                    try {
                      sub1 = await import("complicated/sub1");
                      await import("complicated/sub2/another");
                    } catch (e) {}
                  })();
                `,
                "dynamic-import-subpath.mjs": `
                  (async () => {
                    let sub1 = "Dynamic import unsupported";
                    try {
                      sub1 = await import("complicated/sub1");
                      await import("complicated/sub2/another");
                    } catch (e) {}
                  })();
                `
              }
            });
          });

          [
            ["CJS static", "require-subpath.js"],
            ["ESM static", "import-subpath.mjs"],
            ["CJS dynamic", "dynamic-import-subpath.js"],
            ["ESM dynamic", "dynamic-import-subpath.mjs"]
          ].forEach(([name, srcPath]) => {
            it(`handles ${name} imports`, async () => {
              const { dependencies, misses } = await traceFile({ srcPath });

              expect(dependencies).to.eql(fullPaths([
                "node_modules/complicated/package.json",
                "node_modules/complicated/sub1/index.cjs",
                "node_modules/complicated/sub1/index.js",
                "node_modules/complicated/sub1/index.mjs",
                "node_modules/complicated/sub2/another.cjs",
                "node_modules/complicated/sub2/another.mjs"
              ]));
              expect(misses).to.eql({});
            });
          });
        });

        // Some modern ESM packages lack a `main` field.
        // See, e.g. https://unpkg.com/browse/jose-node-cjs-runtime@3.12.2/package.json
        describe("no main field", () => {
          beforeEach(() => {
            createMock({
              pkg: {
                exports: {
                  ".": [
                    {
                      browser: "./browser.js",
                      development: "./development.js",
                      production: "./production.mjs",
                      require: "./require.js",
                      "import": "./import.mjs",
                      "default": "./default.js"
                    },
                    "./fallback.js"
                  ],
                  "./package": "./package.json",
                  "./package.json": "./package.json"
                }
              },
              pkgFn: (pkg) => {
                delete pkg.main;
                return pkg;
              }
            });
          });

          [
            ["CJS static", "require.js"],
            ["ESM static", "import.mjs"],
            ["CJS dynamic", "dynamic-import.js"],
            ["ESM dynamic", "dynamic-import.mjs"]
          ].forEach(([name, srcPath]) => {
            it(`handles ${name} imports`, async () => {
              const { dependencies, misses } = await traceFile({ srcPath });

              expect(dependencies).to.eql(fullPaths([
                "node_modules/complicated/development.js",
                "node_modules/complicated/import.mjs",
                "node_modules/complicated/local/one.js",
                "node_modules/complicated/local/two.mjs",
                "node_modules/complicated/package.json",
                "node_modules/complicated/production.mjs",
                "node_modules/complicated/require.js",
                "node_modules/subdep/default.js",
                "node_modules/subdep/from-require.js",
                "node_modules/subdep/import.mjs",
                "node_modules/subdep/main.js",
                "node_modules/subdep/package.json"
              ]));
              expect(misses).to.eql({});
            });
          });
        });

        describe("throws on missing specified export source", () => {
          beforeEach(() => {
            createMock({
              pkg: {
                exports: {
                  ".": [
                    {
                      "import": "./doesnt-exist.mjs",
                      "default": "./default.js"
                    }
                  ],
                  "./package": "./package.json",
                  "./package.json": "./package.json"
                }
              }
            });
          });

          [
            ["CJS static", "require.js"],
            ["ESM static", "import.mjs"],
            ["CJS dynamic", "dynamic-import.js"],
            ["ESM dynamic", "dynamic-import.mjs"]
          ].forEach(([name, srcPath]) => {
            it(`throws on ${name} imports`, async () => {
              await expect(traceFile({ srcPath })).to.be.rejectedWith(
                `Encountered resolution error in ${srcPath} for complicated: `
                + "Error: Cannot find export './doesnt-exist.mjs' in module "
                + "'complicated' from '.'"
              );
            });
          });
        });
      });

      // From https://unpkg.com/browse/jose-node-cjs-runtime@3.12.2/package.json
      describe("subpath no main normal package", () => {
        beforeEach(() => {
          mock({
            "require.js": `
              const itsPkg = require("nomain/package");
              const one = require("nomain/sub/one");
              const two = require("nomain/sub/two");
            `,
            "import.mjs": `
              import itsPkg from "nomain/package";
              import one from "nomain/sub/one";
              import two from "nomain/sub/two";
              import fs from "fs"; // core package
            `,
            node_modules: {
              nomain: {
                "package.json": stringify({
                  name: "nomain",
                  exports: {
                    "./sub/one": "./dist/sub/one.js",
                    "./sub/two": [
                      {
                        "import": "./dist/sub/two.mjs"
                      },
                      "./dist/sub/two.js"
                    ]
                  }
                }),
                dist: {
                  sub: {
                    "one.js": "module.exports = 'one';",
                    "two.js": "module.exports = 'two';",
                    "two.mjs": "const msg = 'two'; export default msg;"
                  }
                }
              }
            }
          });
        });

        [
          ["CJS static", "require.js"],
          ["ESM static", "import.mjs"]
        ].forEach(([name, srcPath]) => {
          it(`handles ${name} imports`, async () => {
            const { dependencies, misses } = await traceFile({ srcPath });

            expect(dependencies).to.eql(fullPaths([
              "node_modules/nomain/dist/sub/one.js",
              "node_modules/nomain/dist/sub/two.js",
              "node_modules/nomain/dist/sub/two.mjs",
              "node_modules/nomain/package.json"
            ]));
            expect(misses).to.eql({});
          });
        });
      });

      describe("subpath no main scoped package", () => {
        it("TODO: IMPLEMENT");
      });
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
      expect(dependencies).to.eql(fullPaths([
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
      expect(dependencies).to.eql(fullPaths([
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
      expect(dependencies).to.eql(fullPaths([
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
      expect(dependencies).to.eql(fullPaths([
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

    it("includes source map files", async () => {
      mock({
        "hi.js": `
          const one = require("one");
          require("two");
          require(\`three\`);

          module.exports = 'hi';
          //# sourceMappingURL=hi.js.map
        `,
        "hi.js.map": "{\"not\":\"read\"}",
        "ho.js": `
          module.exports = 'ho';
          //# sourceMappingURL=/ABS/PATH/ho.js.map
        `,
        node_modules: {
          one: {
            "package.json": stringify({
              main: "index.js"
            }),
            "index.js": `
              module.exports = 'one';

              //# sourceMappingURL=early/map-comment/should-be-ignored

              //@ sourceMappingURL=../one/index.not-map-suffix
            `,
            "index.jsbundle": "{\"not\":\"read\"}"
          },
          two: {
            "package.json": stringify({
              main: "index.js"
            }),
            "index.js": `
              module.exports = 'two';

              /*# sourceMappingURL=ignore/block/version.js.map */
            `
          },
          three: {
            "package.json": stringify({
              main: "index.js"
            }),
            "index.js": `
              module.exports = 'three';

              //# sourceMappingURL=https://ignore.com/http/and/https/urls.js.map
            `
          }
        }
      });

      const srcPaths = ["hi.js", "ho.js"];
      const { dependencies, sourceMaps, misses } = await traceFiles({
        srcPaths,
        includeSourceMaps: true
      });

      expect(sourceMaps).to.eql(fullPaths([
        "/ABS/PATH/ho.js.map",
        "hi.js.map",
        "node_modules/one/index.not-map-suffix"
      ]));

      expect(dependencies).to.eql(fullPaths([
        "node_modules/one/index.js",
        "node_modules/one/package.json",
        "node_modules/three/index.js",
        "node_modules/three/package.json",
        "node_modules/two/index.js",
        "node_modules/two/package.json"
      ]));

      expect(missesMap({ misses })).to.eql(resolveObjKeys({}));
    });

    // Regression test: https://github.com/FormidableLabs/trace-deps/issues/42
    it("removes core standard Node.js libraries with allowMissing", async () => {
      mock({
        "hi.js": `
          const fetch = require("node-fetch");
        `,
        node_modules: {
          "node-fetch": {
            "package.json": stringify({
              main: "index.js"
            }),
            "index.js": `
              require("http");

              let convert;
              try {
                convert = require('encoding').convert;
              } catch (e) {}

              module.exports = 'node-fetch';
            `
          }
        }
      });

      await traceFiles({
        srcPaths: ["hi.js"],
        allowMissing: {
          "node-fetch": [
            "encoding"
          ]
        }
      });
    });
  });
});
