// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import chalk from "chalk";
import { prompt } from "inquirer";
import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { gitDefaults } from "./constants";
import logUpdate from "log-update";
import { Command } from "commander";
import terminalLink from "terminal-link";

// Global values

const globals = {
  remote: gitDefaults.remote,
  dry: false,
  verbose: false,
  hasErrors: false,
  hasWarnings: false,
};

export const setValue = (key: keyof typeof globals, value: any) =>
  Object.assign(globals, { [key]: value });

export const getValue = (key: keyof typeof globals) =>
  globals[key] as typeof globals[typeof key];

// Content modifiers

export const shortCommit = (commit: string) => commit.slice(0, 7);

export const unpad = (value: string) => value.replace(/^\s*/gm, "");

export const capitalize = (str: string) =>
  str.charAt(0).toUpperCase() + str.slice(1);

export const commaSeparatedList = (value: string) => value.split(",");

export const parseVersion = (value: string) => {
  const [major, train, patch] = value.replace("v", "").split(".").map(Number);
  assert(
    [major, train, patch].every((part) => part != null),
    `Could not parse Release version from value "${value}".`
  );
  return { major, train, patch };
};

export const visibleLink = (url: string) => chalk.cyan(terminalLink(url, url));

// Assertions

export const assert = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

export const assertNotNull = (values: any[], message: string) =>
  assert(
    values.every((part) => part != null),
    message
  );

// Interface

export const logInfo = (message: string) => console.log(chalk.italic(message));

export const logWarning = (message: string) => {
  setValue("hasWarnings", true);
  console.log(`${chalk.yellow("Warning!")} ${message}`);
};

export const logError = (
  message: string,
  fatal: boolean = false,
  err?: any
) => {
  setValue("hasErrors", true);
  console.log(`${chalk.red("Bonk!")} ${message}`);
  err && console.trace(err);

  if (fatal) {
    console.error("\u0007");
    process.exit(1);
  }
};

export const loadingIndicator = (message: string) => {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let index = 0;

  const interval = setInterval(() => {
    const frame = frames[(index = ++index % frames.length)];
    logUpdate(`${frame} ${message}`);
  }, 80);

  return () => {
    logUpdate.clear();
    clearInterval(interval);
  };
};

// Lifecycle

export const wrapCommand =
  (
    fn: (
      opts: Record<string, any>,
      command: InstanceType<typeof Command>
    ) => void | Promise<void>
  ) =>
  async (opts: Record<string, any>, command: InstanceType<typeof Command>) => {
    for (const key in opts) {
      if (key in globals) {
        setValue(key as any, opts[key]);
      }
    }
    validateCommand(opts.remote);
    await fn(opts, command);
    completeCommand();
  };

const validateCommand = (remote?: string) => {
  const pckg = JSON.parse(
    readFileSync(join(process.cwd(), "package.json"), "utf8")
  );
  if (pckg.name !== "fxa") {
    logError("This CLI needs to be run in an FxA codebase.", true);
  }

  if (
    remote &&
    execute(
      `git ls-remote ${remote}`,
      `Checking the existence of the specified remote (${remote})`
    ) === ""
  ) {
    logError(`Could not find the ${remote} Git remote.`, true);
  }
};

const completeCommand = () => {
  if (getValue("hasErrors")) {
    console.log(
      chalk.red("\nThere were errors during the execution of this command.")
    );

    if (!getValue("verbose")) {
      console.log(
        `Re-run this command with the ${chalk.white(
          "--verbose"
        )} flag for more details`
      );
    }
  } else if (getValue("hasWarnings")) {
    console.log(chalk.yellow("\nCompleted with warnings."));
  }
};

//// NEEDS SORTING =============

export const execute = (
  command: string,
  description: string,
  drySkip: boolean = false
) => {
  const skip = drySkip && globals.dry;
  const prefix = skip ? chalk.yellow("skipped:") : chalk.green("executed:");
  logInfo2(description, `${prefix} ${command}`);

  try {
    return skip
      ? null
      : execSync(command, { cwd: process.cwd() }).toString().trim();
  } catch (error) {
    return null;
  }
};

export const logInfo2 = (message: string, command?: string) => {
  if (globals.dry || globals.verbose) {
    console.log(message);

    if (globals.verbose && command) {
      console.log("↪", command);
    }
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
  branch,
  tag,
  remote,
  version,
  save = true,
}: {
  branch: string;
  tag: string;
  save?: boolean;
  version?: string;
  remote?: string;
}) => {
  remote = remote || (getValue("remote") as string);
  const dry = getValue("dry") || false;
  const command = `git push ${remote} ${branch} && git push ${remote} ${tag}`;

  if (dry) {
    return logInfo2(
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
