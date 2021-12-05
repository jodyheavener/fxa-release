// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import chalk from 'chalk';
import fetch from 'node-fetch';
import terminalLink from 'terminal-link';
import { repoUrl } from '../constants';
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

type ServiceInfo = {
  restricted?: boolean;
  package: string;
  development: string;
  production: string;
  staging: string;
};

type ServiceData = { version: string; commit: string };

export const serviceInfo: Record<string, ServiceInfo> = {
  content: {
    package: 'fxa-content-server',
    development: 'http://localhost:3030/ver.json',
    production: 'https://accounts.firefox.com/ver.json',
    staging: 'https://accounts.stage.mozaws.net/ver.json',
  },
  auth: {
    package: 'fxa-auth-server',
    development: 'http://localhost:9000/__version__',
    production: 'https://api.accounts.firefox.com/__version__',
    staging: 'https://api-accounts.stage.mozaws.net/__version__',
  },
  payments: {
    package: 'fxa-payments-server',
    development: 'http://localhost:3031/__version__',
    production: '',
    staging: '',
  },
  profile: {
    package: 'fxa-profile-server',
    development: 'http://localhost:1111/__version__',
    production: 'https://profile.accounts.firefox.com/__version__',
    staging: 'https://profile.stage.mozaws.net/__version__',
  },
  oauth: {
    package: 'fxa-auth-server',
    development: '',
    production: 'https://oauth.accounts.firefox.com/__version__',
    staging: 'https://oauth.stage.mozaws.net/__version__',
  },
  'gql-api': {
    package: 'fxa-graphql-api',
    development: 'http://localhost:8290/__version__',
    production: 'https://graphql.accounts.firefox.com/__version__',
    staging: 'https://fxa-graphql-api.stage.mozaws.net/__version__',
  },
  'admin-panel': {
    package: 'fxa-admin-panel',
    restricted: true,
    development: 'http://localhost:8091/__version__',
    production: 'https://fxa-admin-panel.prod.mozaws.net/__version__',
    staging: '',
  },
  'admin-server': {
    package: 'fxa-admin-server',
    restricted: true,
    development: 'http://localhost:8095/__version__',
    production: 'https://fxa-admin-panel.prod.mozaws.net/__version__',
    staging: '',
  },
  '123done': {
    package: '123done',
    development: 'http://localhost:8080/__version__',
    production: '',
    staging: '',
  },
};

const formatDetails = (
  { package: pckg }: ServiceInfo,
  { version, commit }: ServiceData
) => {
  const { train, patch } = parseVersion(version);
  const tag = `v${version}`;
  return unpad(`- Train: ${train}
    - Patch: ${patch}
    - Commit: ${terminalLink(
      shortCommit(commit),
      `${repoUrl}/commit/${commit}`
    )}
    - Tag: ${terminalLink(tag, `${repoUrl}/releases/tag/${tag}`)}
    - Package: ${terminalLink(
      pckg,
      `${repoUrl}/tree/${tag}/packages/${pckg}`
    )}`);
};

export default wrapCommand(async (opts: Record<string, any>) => {
  const { exclude, environment, verbose } = opts as Options;
  let { services } = opts as Options;
  setValue('verbose', verbose);

  if (!Array.isArray(services)) {
    services = Object.keys(serviceInfo);
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

    const service = serviceInfo[name];
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
    let data: ServiceData;

    try {
      if (verbose) {
        console.log(`Fetching ${url}`);
      }

      const response = await fetch(url);
      const json = (await response.json()) as ServiceData;
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

    console.log(formatDetails(service, data));
  }
});
