const { jestConfig } = require("@salesforce/sfdx-lwc-jest/config");

module.exports = {
  ...jestConfig,
  moduleNameMapper: {
    ...(jestConfig.moduleNameMapper || {}),
    "^c/kioskUi$": "<rootDir>/jest-mocks/kioskUi.js"
  },
  modulePathIgnorePatterns: ["<rootDir>/.localdevserver"]
};
