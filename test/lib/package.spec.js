"use strict";

const { normalize } = require("path");

const { getPackages, getLastPackage } = require("../../lib/package");

describe("lib/package", () => {
  describe("getPackages", () => {
    it("handles empty input", () => {
      expect(getPackages()).to.eql([]);
      expect(getPackages(null)).to.eql([]);
    });

    it("handles no modules", () => {
      expect(getPackages(normalize(""))).to.eql([]);
      expect(getPackages(normalize("src"))).to.eql([]);
      expect(getPackages(normalize("path/to/node_modules"))).to.eql([]);
      expect(getPackages(normalize("path/to/node_modules/@scope"))).to.eql([]);
    });

    it("handles single modules", () => {
      expect(getPackages(normalize("node_modules/bar"))).to.eql(["bar"]);
      expect(getPackages(normalize("path/to/node_modules/@scope/foo"))).to.eql(["@scope/foo"]);
    });

    it("handles nested modules", () => {
      expect(getPackages(normalize("node_modules/bar/node_modules/@scope/nested-bar")))
        .to.eql(["bar", "@scope/nested-bar"]);
      expect(getPackages(normalize(
        "path/to/node_modules/@scope/foo/node_modules/three/node_modules/four/node_modules"
      )))
        .to.eql(["@scope/foo", "three", "four"]);
    });
  });

  describe("getLastPackage", () => {
    it("handles empty input", () => {
      expect(getLastPackage()).to.eql(null);
      expect(getLastPackage(null)).to.eql(null);
    });

    it("handles no modules", () => {
      expect(getLastPackage(normalize(""))).to.eql(null);
      expect(getLastPackage(normalize("src"))).to.eql(null);
      expect(getLastPackage(normalize("path/to/node_modules"))).to.eql(null);
      expect(getLastPackage(normalize("path/to/node_modules/@scope"))).to.eql(null);
    });


    it("handles single modules", () => {
      expect(getLastPackage(normalize("node_modules/bar"))).to.eql("bar");
      expect(getLastPackage(normalize("path/to/node_modules/@scope/foo"))).to.eql("@scope/foo");
    });

    it("handles nested modules", () => {
      expect(getLastPackage(normalize("node_modules/bar/node_modules/@scope/nested-bar")))
        .to.eql("@scope/nested-bar");
      expect(getLastPackage(normalize(
        "path/to/node_modules/@scope/foo/node_modules/three/node_modules/four/node_modules"
      )))
        .to.eql("four");
    });
  });
});
