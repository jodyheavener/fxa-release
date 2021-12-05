// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import chalk from "chalk";
import { prompt } from "inquirer";
import { execSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { envVarPrefix, gitDefaults, releasesPath } from "./constants";
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

export const createEnvVar = (name: string) =>
  `${envVarPrefix}_${name}`.toUpperCase();

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
    completeCommand();
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

// Command execution

export const wrapCommand =
  (
    fn: (
      opts: Record<string, any>,
      program: InstanceType<typeof Command>
    ) => void | Promise<void>
  ) =>
  async (opts: Record<string, any>, program: InstanceType<typeof Command>) => {
    for (const key in opts) {
      if (key in globals) {
        setValue(key as any, opts[key]);
      }
    }
    validateCommand(opts.remote);
    try {
      await fn(opts, program);
    } catch (err) {
      logError("The command failed in a big way", true, err);
    }
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

// File system

export const ensureReleasesPath = () => {
  if (!existsSync(releasesPath)) {
    mkdirSync(releasesPath);
  }
};

export const createReleaseFilePath = (id: string) => {
  ensureReleasesPath();
  return join(releasesPath, id + ".json");
};

// Release operations

export type ReleaseData = {
  branch: string;
  tag: string;
};

export const getCurrentBranch = () =>
  execute("git rev-parse --abbrev-ref HEAD", "Retrieving the current branch.");

export const confirmPush = async (
  { branch, tag }: ReleaseData,
  save: boolean,
  id?: string
) => {
  const remote = getValue("remote");
  // const dry = getValue("dry") || false;
  const command = `git push ${remote} ${branch}:${branch} && git push ${remote} ${tag}`;

  // if (dry) {
  //   return logInfo2(
  //     "Asking for confirmation to push changes.",
  //     `${chalk.blue("conditional:")} ${command}`
  //   );
  // }

  console.log(
    `${chalk.yellow(
      "Important:"
    )} You are about to push the commits on branch ${chalk.white(
      branch
    )} and the tag ${chalk.white(tag)} to remote ${chalk.white(
      remote
    )}. This may trigger CI jobs.`
  );
  const { confirm } = (await prompt({
    type: "input",
    name: "confirm",
    message: "Type 'push' to confirm. Any other response will abort.",
  })) as { confirm: string };

  if (confirm !== "push") {
    if (save) {
      id = new Date().getTime().toString();
      writeFileSync(
        createReleaseFilePath(id),
        JSON.stringify(
          {
            branch,
            tag,
          },
          null,
          2
        )
      );
    }

    return console.log(
      `${chalk.yellow(
        "\nYour changes have not been pushed."
      )} When you are ready to push you can run the following:\n${chalk.white.bold(
        `fxa-release push --id ${id}`
      )}`
    );
  }

  execute(
    command,
    `Pushing Release commits and tag to remote ${remote}.`,
    true
  );
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
