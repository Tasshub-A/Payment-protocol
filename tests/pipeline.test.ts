import { execSync } from "child_process";

describe("Testing Pipeline", () => {
  it("Runs all software-tool tests in sequence", () => {
    const testFiles = [
      // SOL purchase
      "sol-purchase/unit.test.ts",

      // SPL purchase
      "spl-purchase/unit.test.ts",
    ];

    for (const testFile of testFiles) {
      console.log(`Running ${testFile}...`);
      execSync(
        `yarn ts-mocha -p ./tsconfig.json -t 1000000 tests/cases/${testFile}`,
        {
          stdio: "inherit",
        }
      );
    }
  });
});
