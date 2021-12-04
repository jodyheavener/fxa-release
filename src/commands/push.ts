// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import { Command } from "commander";
import { readFileSync } from "fs";
import { join } from "path";
import { wrapCommand } from "../utils";

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

export default wrapCommand(
  (opts: Record<string, any>, _: InstanceType<typeof Command>) => {
    // options = opts as typeof options;

    // const data = retrieveVersionData();

    // console.log(data);
  }
);
