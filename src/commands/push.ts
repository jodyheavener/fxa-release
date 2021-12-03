// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import { Command } from "commander";
import { readFileSync } from "fs";
import { join } from "path";
import { setValue, validateExecution } from "../utils";

let options: {
  version: string;
  remote: string;
  defaultBranch: string;
  verbose: boolean;
};

const retrieveVersionData = () => {
  const path = join(__dirname, "releases", `${options.version}.json`);
  return JSON.parse(readFileSync(path, "utf8"));
};

export default (
  opts: Record<string, any>,
  command: InstanceType<typeof Command>
) => {
  setValue("remote", opts.remote);
  setValue("verbose", opts.verbose);
  options = opts as typeof options;

  validateExecution(options.remote);
  const data = retrieveVersionData();

  console.log(data);
};
