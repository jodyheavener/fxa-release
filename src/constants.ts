// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import { join } from 'path';

export const gitDefaults = {
  remote: 'origin',
  branch: 'main',
};

export const repoUrl = 'https://github.com/mozilla/fxa';

export const envVarPrefix = 'FXAR';

export const releasesPath = join(__dirname, 'releases');
