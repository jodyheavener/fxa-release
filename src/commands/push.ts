// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import chalk from 'chalk';
import { existsSync, readFileSync } from 'fs';
import {
  assertPresence,
  capitalize,
  confirmPush,
  createReleaseFilePath,
  loadingIndicator,
  logError,
  ReleaseData,
  retrieveAvailableReleases,
  validateGitGpg,
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

export default wrapCommand(async (opts: Record<string, any>) => {
  options = opts as Options;

  if (!options.id) {
    console.log(
      `The option ${chalk.white(`--id <value>`)} is required for this command.`
    );
    const availableReleases = retrieveAvailableReleases();
    if (availableReleases.length > 0) {
      console.log(
        'The following Releases are available on your system:',
        availableReleases.map((r) => chalk.white(r)).join(', ')
      );
    } else {
      console.log(
        `You have no saved Releases. Cut a new one with:\n\n${chalk.white(
          'fxa-release cut'
        )}`
      );
    }
    process.exit(1);
  }

  validateGitGpg();

  const doneLoading = loadingIndicator('Fetching Release details...');
  let data: ReleaseData;

  try {
    const response = retrieveReleaseData() as ReleaseData;
    const { train, patch, type, branch, tag, modifiedPackages } = response;

    if (options.verbose) {
      console.log(response);
    }

    assertPresence(
      [train, patch, type, branch, tag],
      'Required data not found in saved Release file'
    );
    data = { train, patch, type, branch, tag, modifiedPackages };
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
