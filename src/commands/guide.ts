// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import chalk from "chalk";
import { Command } from "commander";

const definitions = {
  Release:
    "A Release is a collection of changes made to the codebase, denoted by a version number, that is packaged for deployment to our servers.",
  Train: "Trains are releases that are regularly scheduled.",
  Patch:
    "Patches are releases with specific changes, added to the current Train, that were necessary before the next Train Release.",
  Owner:
    "The Owner, or Release Owner, is the engineer responsible for looking after the current Release.",
  Service:
    "A Service is an application in our monorepo codebase that can be run locally, or built and deployed to our servers.",
  Tag: "A tag is a Git function that marks a point in a codebase's history. We create a new tag for each Release.",
  Remote:
    "The Remote is the external Git repository we push Release commits and tags to.",
};

export default (
  opts: Record<string, any>,
  command: InstanceType<typeof Command>
) => {
  console.log(
    Object.keys(definitions)
      .map((d) => `${chalk.white(d)} - ${definitions[d]}`)
      .join("\n")
  );
};
