"use strict";

const { expect, use } = require("chai");
const chaiAsPromised = require("chai-as-promised");

use(chaiAsPromised);

global.expect = expect;
