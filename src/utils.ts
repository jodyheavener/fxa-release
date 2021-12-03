// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import chalk from "chalk";
import { prompt } from "inquirer";
import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import constants from "./constants";

const globals = {
  command: "",
  remote: constants.remote,
  dry: false,
  verbose: false,
  hasErrors: false,
};

export const setValue = (key: keyof typeof globals, value: any) => {
  Object.assign(globals, { [key]: value });
};
export const getValue = (key: keyof typeof globals) => {
  return globals[key] as typeof globals[typeof key];
};

export const validateExecution = (remote?: string) => {
  const pckg = JSON.parse(
    readFileSync(join(process.cwd(), "package.json"), "utf8")
  );
  if (pckg.name !== "fxa") {
    error("This CLI needs to be run in an FxA codebase.", true);
  }

  if (
    remote &&
    execute(
      `git ls-remote ${remote}`,
      `Checking the existence of the specified remote (${remote})`
    ) === ""
  ) {
    error(`Could not find the ${remote} Git remote.`, true);
  }
};

export const capitalize = (str: string) =>
  str.charAt(0).toUpperCase() + str.slice(1);

export const execute = (
  command: string,
  description: string,
  drySkip: boolean = false
) => {
  const skip = drySkip && globals.dry;
  const prefix = skip ? chalk.yellow("skipped:") : chalk.green("executed:");
  logInfo(description, `${prefix} ${command}`);

  try {
    return skip
      ? null
      : execSync(command, { cwd: process.cwd() }).toString().trim();
  } catch (error) {
    return null;
  }
};

export const assert = (condition: boolean, message: string) => {
  if (!condition) {
    error(message, true);
  }
};

export const logInfo = (message: string, command?: string) => {
  if (globals.dry || globals.verbose) {
    console.log(message);

    if (globals.verbose && command) {
      console.log("↪", command);
    }
  }
};

export const logError = (message: string) => {
  setValue("hasErrors", true);
  if (globals.dry) {
    console.log(chalk.red("Error:"), message);
  }
};

export const error = (message: string, fatal: boolean = false, err?: any) => {
  if (fatal || !globals.dry) {
    console.error(`\u0007💥 ${chalk.red("Command aborted:")} ${message}\n`);
    if (err) {
      console.trace(err);
    }
    process.exit(1);
  }

  logError(message);
};

export const confirmPush = async ({
  branch, tag, remote, version, save = true
}: {
  branch: string,
  tag: string,
  save?: boolean,
  version?: string,
  remote?: string
}) => {
  remote = remote || (getValue("remote") as string);
  const dry = getValue("dry") || false;
  const command = `git push ${remote} ${branch} && git push ${remote} ${tag}`;

  if (dry) {
    return logInfo(
      "Asking for confirmation to push changes.",
      `${chalk.blue("conditional:")} ${command}`
    );
  }

  console.log(
    `⚠️ Proceeding will push the current release changes to ${remote}/${branch}`
  );
  const { confirm } = (await prompt({
    type: "input",
    name: "confirm",
    message: "Please type 'push' to confirm. Any other response will abort.",
  })) as { confirm: string };

  if (confirm !== "push") {
    if (save) {
      version = new Date().getTime().toString();
      writeFileSync(
        join(__dirname, "releases", `${version}.json`),
        JSON.stringify({
          version,
          branch,
          tag,
          remote,
        })
      );
    }

    return console.log(
      chalk.yellow("\nYour changes have not been pushed."),
      "When you are reading to push you should run the following:\n",
      chalk.white(`yarn release push --version ${version}`)
    );
  }

  execute(
    command,
    `Pushing release commit and tag to ${remote}/${branch}.`,
    true
  );

  // TODO: print post-push message
};
