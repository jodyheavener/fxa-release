// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import chalk from 'chalk';
import fetch from 'node-fetch';
import terminalLink from 'terminal-link';
import { packages, repoUrl, serviceSets } from '../constants';
import {
  assertPresence,
  loadingIndicator,
  logError,
  logInfo,
  parseVersion,
  setValue,
  shortCommit,
  unpad,
  visibleLink,
  wrapCommand,
} from '../utils';

type Options = {
  services?: string[];
  exclude?: string[];
  environment: 'production' | 'staging' | 'development';
  verbose: boolean;
};

type ServiceVersionData = { version: string; commit: string };

const formatDetails = (
  service: string,
  { version, commit }: ServiceVersionData
) => {
  const pckg = packages[service] as string | undefined;
  const { train, patch } = parseVersion(version);
  const tag = `v${version}`;
  return unpad(`- Train: ${train}
    - Patch: ${patch}
    - Commit: ${terminalLink(
      shortCommit(commit),
      `${repoUrl}/commit/${commit}`
    )}
    - Tag: ${terminalLink(tag, `${repoUrl}/releases/tag/${tag}`)}
    ${
      pckg
        ? `- Package: ${terminalLink(
            pckg,
            `${repoUrl}/tree/${tag}/packages/${pckg}`
          )}`
        : ''
    }`).trim();
};

export default wrapCommand(async (opts: Record<string, any>) => {
  const { exclude, environment, verbose } = opts as Options;
  let { services } = opts as Options;
  setValue('verbose', verbose);

  if (!Array.isArray(services)) {
    services = Object.keys(serviceSets);
  }

  if (Array.isArray(exclude)) {
    for (const name of exclude) {
      if (services.includes(name)) {
        services = services.filter((s) => s !== name);
      }
    }
  }

  console.log(
    chalk.white(
      `Retrieving the release statuses of ${chalk.blue(
        services.length
      )} services in ${chalk.blue(environment)}...`
    )
  );

  for (const name of services) {
    console.log(chalk.white(`\n➤ ${name}`));

    const service = serviceSets[name];
    const url = service[environment];
    const restricted = service.restricted || false;

    try {
      assertPresence(
        url,
        'A URL for the service in this environment is not available; skipping'
      );
    } catch (error) {
      logInfo(error.message);
      continue;
    }

    if (restricted && environment !== 'development') {
      logInfo(
        `The service in this environment is restricted and its details cannot be accessed through the CLI. Please access it directly from your browser with the correct permissions:`
      );
      console.log(visibleLink(url));
      continue;
    }

    const doneLoading = loadingIndicator('Fetching details...');
    let data: ServiceVersionData;

    try {
      if (verbose) {
        console.log(`Fetching ${url}`);
      }

      const response = await fetch(url);
      const json = (await response.json()) as ServiceVersionData;
      const { version, commit } = json;

      if (verbose) {
        console.log(json);
      }

      assertPresence(
        [version, commit],
        'Could not locate version and commit values for service endpoint'
      );
      data = { version, commit };
    } catch (err) {
      logError("There was a problem fetching this service's details", err);
      continue;
    } finally {
      doneLoading();
    }

    console.log(formatDetails(name, data));
  }
});
