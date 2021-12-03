// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import { program, Option, Command } from "commander";
import pckg from "../package.json";
import { cut, push, versions } from "./commands";
import constants from "./constants";

program.version(pckg.version).description(pckg.description);

const options = {
  global: [
    new Option("--verbose", "output all operations to the console").default(
      false
    ),
  ],
  git: [
    new Option(
      "-r, --remote <name>",
      "the name of the git remote to use"
    ).default(constants.remote),
    new Option(
      "-b, --default-branch <name>",
      "the name of the default git branch"
    ).default(constants.defaultBranch),
  ],
};

const addCommand = (
  name: string,
  description: string,
  additionalOptions: Option[],
  action: (
    options: Record<string, any>,
    command: InstanceType<typeof Command>
  ) => void
) => {
  const cutCommand = new Command(name);
  cutCommand.description(description);
  cutCommand.action(action);
  [...options.global, ...additionalOptions].forEach((option) => {
    cutCommand.addOption(option);
  });
  program.addCommand(cutCommand);
};

addCommand(
  "cut",
  "Cut a new release",
  [
    ...options.git,
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
    ...options.git,
    new Option(
      "-rs, --release <version>",
      "the version to continue releasing"
    ),
  ],
  push
);

addCommand(
  "versions",
  "Retrieve release versions",
  [
    new Option("-s, --service [name]", "the name of an FxA service to look up"),
    new Option(
      "-r, --remote",
      "retrieve version data from deployed services"
    ).default(false),
  ],
  versions
);

program.parse();
