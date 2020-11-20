#!/usr/bin/env node

"use strict";

const pkg = require("../package.json");
const { traceFile } = require("../index");

const DEFAULT_OUTPUT = "text";
const JSON_INDENT = 2;

const USAGE = `
Usage: ${pkg.name} <action> [options]

Actions: (<action>)
  trace                     Trace dependencies and misses for a file

Options:
  --input, -i       (trace) Starting file to trace        [string]
  --output, -o      (trace) Output format (text, json)    [string] [default: text]
  --source-maps, -s (trace) Include source maps output    [boolean]
  --help, -h                Show help                     [boolean]
  --version, -v             Show version number           [boolean]

Examples:
  ${pkg.name} trace --input ./path/to/file.js     Trace a source file
`.trim();

// ============================================================================
// Helpers
// ============================================================================
const log = (...args) => console.log(...args); // eslint-disable-line no-console
const error = (...args) => console.error(...args); // eslint-disable-line no-console

const jsonReport = (data) => JSON.stringify(data, null, JSON_INDENT);

const missGroups = (objs) => objs.reduce((memo, obj) => {
  memo[obj.type] = [].concat(memo[obj.type] || []).concat(obj);
  return memo;
}, {});
const textMiss = ({ dep, src }) => `    - "${dep || src}"`;
const textReport = ({ dependencies, sourceMaps, misses }) => `
## Dependencies
${dependencies.map((d) => `- ${d}`).join("\n")}
${!sourceMaps ? "" : `
## Source Maps
${sourceMaps.map((s) => `- ${s}`).join("\n")}
`}
## Misses
${Object.entries(misses)
    .map(([k, objs]) => `- ${k}\n${Object.entries(missGroups(objs))
      .map(([type, vals]) => `  - ${type} (${vals.length})\n${vals.map(textMiss).join("\n")}`)
      .join("\n")
    }`)
    .join("\n")
}
`;

// ============================================================================
// Actions
// ============================================================================
const help = async () => { log(USAGE); };
const version = async () => { log(pkg.version); };
const trace = async ({ input, output, includeSourceMaps }) => {
  if (!input) {
    throw new Error("Must specify --input file to trace");
  }

  const data = await traceFile({
    srcPath: input,
    bailOnMissing: false,
    includeSourceMaps
  });

  const report = output === "text" ? textReport : jsonReport;
  log(report(data));
};

// ============================================================================
// Configuration
// ============================================================================
// Get action or help / version name
const getAction = (args) => {
  // Return actions in priority order.
  if (args.includes("--help") || args.includes("-h")) { return help; }
  if (args.includes("--version") || args.includes("-v")) { return version; }
  if (args.includes("trace")) { return trace; }

  // Default.
  return help;
};

// Get options for actions.
const getOptions = (args) => ({
  input: args.find((_, i) => ["--input", "-i"].includes(args[i - 1])) || null,
  output: args.find((_, i) => ["--output", "-o"].includes(args[i - 1])) || DEFAULT_OUTPUT,
  includeSourceMaps: args.includes("--source-maps") || args.includes("-s")
});

// ============================================================================
// Script
// ============================================================================
const cli = async ({ args = [] } = {}) => {
  const opts = getOptions(args);
  const action = getAction(args);

  await action(opts);
};

if (require.main === module) {
  cli({
    args: process.argv.slice(2) // eslint-disable-line no-magic-numbers
  }).catch((err) => {
    error(err);
    process.exit(1); // eslint-disable-line no-process-exit
  });
}

module.exports = {
  cli
};
