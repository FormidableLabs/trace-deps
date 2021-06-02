"use strict";

const { normalize } = require("path");

const {
  getPackages,
  getLastPackage,
  getLastPackageSegment,
  getLastPackageRoot,
  getDependencyParts
} = require("../../lib/package");

const IS_WIN = process.platform.startsWith("win");

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

  describe("getLastPackageSegment", () => {
    it("handles empty input", () => {
      expect(getLastPackageSegment()).to.eql(null);
      expect(getLastPackageSegment(null)).to.eql(null);
    });

    it("handles no modules", () => {
      expect(getLastPackageSegment(normalize(""))).to.eql(null);
      expect(getLastPackageSegment(normalize("src"))).to.eql(null);
      expect(getLastPackageSegment(normalize("src/nested/path.js"))).to.eql(null);
      expect(getLastPackageSegment(normalize("path/to/node_modules"))).to.eql(null);
      expect(getLastPackageSegment(normalize("path/to/node_modules/@scope"))).to.eql(null);
    });

    it("handles single modules", () => {
      expect(getLastPackageSegment(normalize("node_modules/bar"))).to.eql("bar");
      expect(getLastPackageSegment(normalize("node_modules/bar/src/foo.js")))
        .to.eql(normalize("bar/src/foo.js"));
      expect(getLastPackageSegment(normalize("path/to/node_modules/@scope/foo")))
        .to.eql(normalize("@scope/foo"));
      expect(getLastPackageSegment(normalize("path/to/node_modules/@scope/foo/index.js")))
        .to.eql(normalize("@scope/foo/index.js"));
    });

    it("handles nested modules", () => {
      expect(getLastPackageSegment(normalize("node_modules/bar/node_modules/@scope/nested-bar")))
        .to.eql(normalize("@scope/nested-bar"));
      expect(getLastPackageSegment(
        normalize("node_modules/bar/node_modules/@scope/nested-bar/path/to/nested.js")
      )).to.eql(normalize("@scope/nested-bar/path/to/nested.js"));
    });
  });

  describe("getLastPackageRoot", () => {
    it("handles empty input", () => {
      expect(getLastPackageRoot()).to.eql(null);
      expect(getLastPackageRoot(null)).to.eql(null);
    });

    it("handles no modules", () => {
      expect(getLastPackageRoot(normalize(""))).to.eql(null);
      expect(getLastPackageRoot(normalize("src"))).to.eql(null);
      expect(getLastPackageRoot(normalize("src/nested/path.js"))).to.eql(null);
      expect(getLastPackageRoot(normalize("path/to/node_modules"))).to.eql(null);
      expect(getLastPackageRoot(normalize("path/to/node_modules/@scope"))).to.eql(null);
    });

    it("handles single modules", () => {
      expect(getLastPackageRoot(normalize("node_modules/bar")))
        .to.eql(normalize("node_modules/bar"));
      expect(getLastPackageRoot(normalize("node_modules/bar/src/foo.js")))
        .to.eql(normalize("node_modules/bar"));
      expect(getLastPackageRoot(normalize("path/to/node_modules/@scope/foo")))
        .to.eql(normalize("path/to/node_modules/@scope/foo"));
      expect(getLastPackageRoot(normalize("path/to/node_modules/@scope/foo/index.js")))
        .to.eql(normalize("path/to/node_modules/@scope/foo"));
    });

    it("handles nested modules", () => {
      expect(getLastPackageRoot(normalize("node_modules/bar/node_modules/@scope/nested-bar")))
        .to.eql(normalize("node_modules/bar/node_modules/@scope/nested-bar"));
      expect(getLastPackageRoot(
        normalize("node_modules/bar/node_modules/@scope/nested-bar/path/to/nested.js")
      )).to.eql(normalize("node_modules/bar/node_modules/@scope/nested-bar"));
    });
  });

  describe("getDependencyParts", () => {
    it("handles empty input", () => {
      expect(getDependencyParts()).to.eql(null);
      expect(getDependencyParts(null)).to.eql(null);
    });

    it("handles no modules", () => {
      expect(getDependencyParts("")).to.eql(null);
      expect(getDependencyParts("@scope-only")).to.eql(null);
      expect(getDependencyParts("@scope-only/")).to.eql(null);
      expect(getDependencyParts("./src")).to.eql(null);
      expect(getDependencyParts(".\\src")).to.eql(null);
      expect(getDependencyParts("./src/nested/path.js")).to.eql(null);
      expect(getDependencyParts(".\\src\\nested\\path.js")).to.eql(null);
      expect(getDependencyParts("/abs-path")).to.eql(null);
      expect(getDependencyParts("/abs-path/to/src/file.js")).to.eql(null);

      if (IS_WIN) {
        expect(getDependencyParts("d:\\abs-path")).to.eql(null);
        expect(getDependencyParts("d:\\abs-path\\to\\src/\\ile.js")).to.eql(null);
      }
    });


    it("handles unscoped modules", () => {
      expect(getDependencyParts("bar")).to.eql({
        name: "bar",
        parts: []
      });
      expect(getDependencyParts("bar/")).to.eql({
        name: "bar",
        parts: []
      });
      expect(getDependencyParts("bar\\")).to.eql({
        name: "bar",
        parts: []
      });
      expect(getDependencyParts("bar/one")).to.eql({
        name: "bar",
        parts: ["one"]
      });
      expect(getDependencyParts("bar\\one")).to.eql({
        name: "bar",
        parts: ["one"]
      });
      expect(getDependencyParts("bar/not-here/../one")).to.eql({
        name: "bar",
        parts: ["not-here", "..", "one"]
      });
      expect(getDependencyParts("bar\\not-here\\..\\one")).to.eql({
        name: "bar",
        parts: ["not-here", "..", "one"]
      });
      expect(getDependencyParts("bar/one/two/three.js")).to.eql({
        name: "bar",
        parts: ["one", "two", "three.js"]
      });
      expect(getDependencyParts("bar\\one\\two\\three.js")).to.eql({
        name: "bar",
        parts: ["one", "two", "three.js"]
      });
    });

    it("handles scoped modules", () => {
      expect(getDependencyParts("@scope/pkg")).to.eql({
        name: "@scope/pkg",
        parts: []
      });
      expect(getDependencyParts("@scope/pkg/")).to.eql({
        name: "@scope/pkg",
        parts: []
      });
      expect(getDependencyParts("@scope\\pkg\\")).to.eql({
        name: "@scope/pkg",
        parts: []
      });
      expect(getDependencyParts("@scope/pkg/one")).to.eql({
        name: "@scope/pkg",
        parts: ["one"]
      });
      expect(getDependencyParts("@scope\\pkg\\one")).to.eql({
        name: "@scope/pkg",
        parts: ["one"]
      });
      expect(getDependencyParts("@scope/pkg/not-here/../one")).to.eql({
        name: "@scope/pkg",
        parts: ["not-here", "..", "one"]
      });
      expect(getDependencyParts("@scope\\pkg\\not-here\\..\\one")).to.eql({
        name: "@scope/pkg",
        parts: ["not-here", "..", "one"]
      });
      expect(getDependencyParts("@scope/pkg/one/two/three.js")).to.eql({
        name: "@scope/pkg",
        parts: ["one", "two", "three.js"]
      });
      expect(getDependencyParts("@scope\\pkg\\one\\two\\three.js")).to.eql({
        name: "@scope/pkg",
        parts: ["one", "two", "three.js"]
      });
    });
  });
});
