// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import { join } from 'path';

export const gitDefaults = {
  remote: 'origin',
  branch: 'main',
};

export const repoUrl = 'https://github.com/mozilla/fxa';
export const privateRepoUrl = 'https://github.com/mozilla/fxa-private';

export const envVarPrefix = 'FXAR';

export const releasesPath = join(__dirname, 'releases');

export const deployBug = {
  file: join(process.cwd(), '_scripts', 'create-deploy-bug.url'),
  url: `${privateRepoUrl}/_scripts/create-deploy-bug.url`,
};

export const qaIssuesUrlBase = {
  fxa: 'https://github.com/mozilla/fxa/issues?q=is%3Aissue+is%3Aclosed+label%3Aneeds%3Aqa+updated%3A%3E',
  subplat:
    'https://github.com/mozilla/fxa/issues?q=is%3Aissue+is%3Aclosed+label%3Aqa%2B+updated%3A%3E',
};

export const deployDocUrl =
  'https://docs.google.com/document/d/1lc5T1ZvQZlhXY6j1l_VMeQT9rs1mN7yYIcHbRPR2IbQ';

export type ServiceSet = {
  restricted?: boolean;
  development: string;
  production: string;
  staging: string;
};

export const packages = {
  content: 'fxa-content-server',
  auth: 'fxa-auth-server',
  'auth-db': 'fxa-auth-db-mysql',
  customs: 'fxa-customs-server',
  emails: 'fxa-email-service',
  'email-event-proxy': 'fxa-email-event-proxy',
  'event-broker': 'fxa-event-broker',
  geodb: 'fxa-geodb',
  'gql-api': 'fxa-graphql-api',
  payments: 'fxa-payments-server',
  profile: 'fxa-profile-server',
  react: 'fxa-react',
  settings: 'fxa-settings',
  shared: 'fxa-shared',
  'support-panel': 'fxa-support-panel',
  'admin-panel': 'fxa-admin-panel',
  'admin-server': 'fxa-admin-server',
};

export const serviceSets: Record<string, ServiceSet> = {
  content: {
    development: 'http://localhost:3030/ver.json',
    production: 'https://accounts.firefox.com/ver.json',
    staging: 'https://accounts.stage.mozaws.net/ver.json',
  },
  auth: {
    development: 'http://localhost:9000/__version__',
    production: 'https://api.accounts.firefox.com/__version__',
    staging: 'https://api-accounts.stage.mozaws.net/__version__',
  },
  payments: {
    development: 'http://localhost:3031/__version__',
    production: '',
    staging: '',
  },
  profile: {
    development: 'http://localhost:1111/__version__',
    production: 'https://profile.accounts.firefox.com/__version__',
    staging: 'https://profile.stage.mozaws.net/__version__',
  },
  oauth: {
    development: '',
    production: 'https://oauth.accounts.firefox.com/__version__',
    staging: 'https://oauth.stage.mozaws.net/__version__',
  },
  'gql-api': {
    development: 'http://localhost:8290/__version__',
    production: 'https://graphql.accounts.firefox.com/__version__',
    staging: 'https://fxa-graphql-api.stage.mozaws.net/__version__',
  },
  'admin-panel': {
    restricted: true,
    development: 'http://localhost:8091/__version__',
    production: 'https://fxa-admin-panel.prod.mozaws.net/__version__',
    staging: '',
  },
  'admin-server': {
    restricted: true,
    development: 'http://localhost:8095/__version__',
    production: 'https://fxa-admin-panel.prod.mozaws.net/__version__',
    staging: '',
  },
  '123done': {
    development: 'http://localhost:8080/__version__',
    production: '',
    staging: '',
  },
};
