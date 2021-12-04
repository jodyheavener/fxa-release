// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import { Command } from "commander";
import { readFileSync } from "fs";
import { join } from "path";
import { setValue, validateExecution } from "../utils";

let options: {
  service?: string;
  environment: "production" | "staging" | "development";
  verbose: boolean;
};

const servers = {
  content: {
    production: "https://accounts.firefox.com/ver.json",
    staging: "https://accounts.stage.mozaws.net/ver.json",
    development: "https://accounts-dev.firefox.com/ver.json",
    requiresAuth: false,
  },
};

export default (
  opts: Record<string, any>,
  command: InstanceType<typeof Command>
) => {
  options = opts as typeof options;
  console.log(options);
};
