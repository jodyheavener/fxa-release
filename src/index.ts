// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import { program, Option, Command } from "commander";
import pckg from "../package.json";
import { cut, push, status, guide } from "./commands";
import { serviceInfo } from "./commands/status";
import { gitDefaults } from "./constants";
import { commaSeparatedList } from "./utils";

program.version(pckg.version).description(pckg.description);

const options = {
  verbose: new Option(
    "--verbose",
    "output detailed information for the current command",
  ).default(false),
  remote: new Option(
    "-r, --remote <name>",
    "the name of the git remote to use"
  ).default(gitDefaults.remote),
  defaultBranch: new Option(
    "-b, --default-branch <name>",
    "the name of the default git branch"
  ).default(gitDefaults.branch),
};

const addCommand = (
  name: string,
  description: string,
  additionalOptions: Option[],
  action: (
    options: Record<string, any>,
    command: InstanceType<typeof Command>
  ) => Promise<void>
) => {
  const cutCommand = new Command(name);
  cutCommand.description(description);
  cutCommand.action(action);
  [options.verbose, ...additionalOptions].forEach((option) => {
    cutCommand.addOption(option);
  });
  program.addCommand(cutCommand);
};

addCommand(
  "cut",
  "Cut a new release",
  [
    options.remote,
    options.defaultBranch,
    new Option("-t, --type <type>", "the release build type")
      .choices(["train", "patch"])
      .default("train"),
    new Option(
      "-d, --dry",
      "perform a dry run, where no changes are made"
    ).default(false),
  ],
  cut
);

addCommand(
  "push",
  "Push changes from a release in progress",
  [
    options.remote,
    options.defaultBranch,
    new Option("-rs, --release <version>", "the version to continue releasing"),
  ],
  push
);

addCommand(
  "status",
  "Retrieve the statuses of FxA services",
  [
    new Option(
      "-e, --environment <name>",
      "the environment to retrieve version data from"
    )
      .choices(["production", "staging", "development"])
      .default("production"),
    new Option(
      "-s, --services [name]",
      "comma-separated list of services to retrieve version data for (defaults to all)"
    )
      .choices(Object.keys(serviceInfo))
      .argParser(commaSeparatedList),
    new Option(
      "-x, --exclude [name]",
      "comma-separated list of services to exclude from retrieval"
    ).argParser(commaSeparatedList),
  ],
  status
);

addCommand("guide", "Display helpful release information", [], guide);

program.parse();
