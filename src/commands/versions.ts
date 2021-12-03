// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import { Command } from "commander";

export default (
  options: Record<string, any>,
  command: InstanceType<typeof Command>
) => {
  const { verbose, service, remote } = options as {
    verbose: boolean;
    service: string;
    remote: boolean;
  };
  console.log(verbose, service, remote);
};
