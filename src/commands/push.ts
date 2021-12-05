// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import chalk from "chalk";
import { Command } from "commander";
import { existsSync, readdirSync, readFileSync } from "fs";
import { releasesPath } from "../constants";
import {
  assertNotNull,
  confirmPush,
  createReleaseFilePath,
  ensureReleasesPath,
  loadingIndicator,
  logError,
  ReleaseData,
  wrapCommand,
} from "../utils";

let options: {
  id: string;
  remote: string;
  defaultBranch: string;
  verbose: boolean;
};

const retrieveReleaseData = () => {
  const path = createReleaseFilePath(options.id);

  if (options.verbose) {
    console.log(`Fetching ${path}`);
  }

  if (!existsSync(path)) {
    throw new Error(`Could not find saved Release file for ${options.id}`);
  }

  return JSON.parse(readFileSync(path, "utf8"));
};

const retrieveAvailableReleases = () => {
  ensureReleasesPath();
  const files = readdirSync(releasesPath)
  return files.map(f => f.split('.')[0]);
}

export default wrapCommand(
  async (opts: Record<string, any>, _: InstanceType<typeof Command>) => {
    options = opts as typeof options;

    if (!options.id) {
      console.log("The option '--id <value>' is required for this command");
      // console.log(retrieveAvailableReleases());
      process.exit(1);
    }

    console.log(
      chalk.white(
        `Resuming push for in-progress Release ${chalk.blue(options.id)}...`
      )
    );

    const doneLoading = loadingIndicator("Fetching Release details...");
    let data: ReleaseData;

    try {
      const response = retrieveReleaseData() as ReleaseData;
      const { branch, tag } = response;

      if (options.verbose) {
        console.log(response);
      }

      assertNotNull(
        [branch, tag],
        "Required data not found in saved Release file"
      );
      data = { branch, tag };
    } catch (err) {
      logError("There was a problem fetching the Release data", true, err);
    } finally {
      doneLoading();
    }

    await confirmPush(data, false, options.id);
  }
);
