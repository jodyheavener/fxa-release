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

export function assertPresence(values: string, message: string): void;
export function assertPresence(values: any[], message: string): void;
export function assertPresence(values: any, message: string): void {
  if (!Array.isArray(values)) {
    values = [values];
  }
  assert(
    values.every((part) => part != null && part !== ""),
    message
  );
};

export function assertAbsense(values: string, message: string): void;
export function assertAbsense(values: any[], message: string): void;
export function assertAbsense(values: any, message: string): void {
  if (!Array.isArray(values)) {
    values = [values];
  }
  assert(
    values.every((part) => part == null || part === ""),
    message
  );
};

// Interface

export const logInfo = (message: string) => console.log(chalk.italic(message));

export const logDryMessage = (
  message: string,
  type: "info" | "warning" | "error" = "info"
) => {
  if (!getValue("dry")) {
    return;
  }

  let prefix = "";

  if (type === "warning") {
    prefix = chalk.yellow("Warning: ");
  } else if (type === "error") {
    prefix = chalk.red("Error: ");
  }

  console.log(`- ${prefix}${message}`);
};

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

    if (getValue("dry")) {
      console.log(
        chalk.white("⚠  Dry run enabled. Critical commands will be skipped.\n")
      );
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
  if (getValue("dry")) {
    if (getValue("hasErrors")) {
      console.log(
        `\n${chalk.red(
          "This command would have failed"
        )}. Please correct the errors above and try again.`
      );
    } else {
      console.log(
        `\n${chalk.green(
          "Dry run complete!"
        )} If everything above looks good, re-run the command without the ${chalk.white(
          "--dry"
        )} flag to perform it for real.`
      );
    }
    return;
  }

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
  } else {
    console.log(chalk.green("\nCompleted successfully."));
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

export const execute = (
  command: string,
  description: string,
  drySkip: boolean = false
) => {
  const skip = drySkip && getValue("dry");
  const prefix = skip ? chalk.yellow("skipped:") : chalk.green("executed:");

  logDryMessage(description);

  if (getValue("verbose")) {
    if (!getValue("dry")) {
      logInfo(description);
    }

    console.log(`↪ ${prefix} ${command}`);
  }

  try {
    return skip
      ? null
      : execSync(command, { cwd: process.cwd() }).toString().trim();
  } catch (error) {
    return null;
  }
};

export type ReleaseData = {
  branch: string;
  tag: string;
};

export const confirmPush = async (
  { branch, tag }: ReleaseData,
  save: boolean,
  id?: string
) => {
  const remote = getValue("remote");
  const command = `git push ${remote} ${branch}:${branch} && git push ${remote} ${tag}`;

  if (getValue("dry")) {
    logDryMessage("Asking for confirmation to push changes.");

    if (getValue("verbose")) {
      console.log(`↪ ${chalk.magenta("proposed:")} ${command}`);
    }

    return;
  }

  console.log(
    `\n${chalk.yellow(
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
      )} When you are ready to push you can run the following:\n${chalk.white(
        `fxa-release push --id ${id}`
      )}`
    );
  }

  execute(
    command,
    `Pushing Release commits and tag to remote ${remote}.`,
    true
  );

  // TODO: Finished output
};
