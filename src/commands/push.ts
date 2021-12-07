// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import chalk from 'chalk';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { releasesPath } from '../constants';
import {
  assertPresence,
  capitalize,
  confirmPush,
  createReleaseFilePath,
  ensureReleasesPath,
  loadingIndicator,
  logError,
  ReleaseData,
  wrapCommand,
} from '../utils';

type Options = {
  id: string;
  remote: string;
  defaultBranch: string;
  verbose: boolean;
};

let options: Options;

const retrieveReleaseData = () => {
  const path = createReleaseFilePath(options.id);

  if (options.verbose) {
    console.log(`Fetching ${path}`);
  }

  if (!existsSync(path)) {
    throw new Error(`Could not find saved Release file for ${options.id}`);
  }

  return JSON.parse(readFileSync(path, 'utf8'));
};

const retrieveAvailableReleases = () => {
  ensureReleasesPath();
  const files = readdirSync(releasesPath);
  return files.map((f) => chalk.white(f.split('.')[0]));
};

export default wrapCommand(async (opts: Record<string, any>) => {
  options = opts as Options;

  if (!options.id) {
    console.log(
      `The option ${chalk.white(`--id <value>`)} is required for this command`
    );
    console.log(
      'The following releases are available on your system:',
      retrieveAvailableReleases().join(', ')
    );
    process.exit(1);
  }

  const doneLoading = loadingIndicator('Fetching Release details...');
  let data: ReleaseData;

  try {
    const response = retrieveReleaseData() as ReleaseData;
    const { train, type, branch, tag, modifiedPackages } = response;

    if (options.verbose) {
      console.log(response);
    }

    assertPresence(
      [train, type, branch, tag],
      'Required data not found in saved Release file'
    );
    data = { train, type, branch, tag, modifiedPackages };
  } catch (err) {
    logError('There was a problem fetching the Release data', err);
  } finally {
    doneLoading();
  }

  console.log(
    chalk.white(
      `Resuming push for in-progress ${chalk.blue(
        `${data.tag} ${capitalize(data.type)} Release`
      )} (${options.id})...`
    )
  );

  await confirmPush(data, false, options.id);
});
