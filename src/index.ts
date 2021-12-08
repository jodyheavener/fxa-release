#!/usr/bin/env node

// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import { Command, Option, program } from 'commander';
import pckg from '../package.json';
import { cut, guide, push, status } from './commands';
import { gitDefaults, serviceSets } from './constants';
import { commaSeparatedList, createEnvVar } from './utils';

program.version(pckg.version).description(pckg.description);

const options = {
  verbose: new Option(
    '--verbose',
    'output detailed information for the current command'
  ).default(false),
  remote: new Option('-r, --remote <name>', 'the name of the git remote to use')
    .default(gitDefaults.remote)
    .env(createEnvVar('remote')),
  defaultBranch: new Option(
    '-b, --default-branch <name>',
    'the name of the default git branch'
  )
    .default(gitDefaults.branch)
    .env(createEnvVar('default_branch')),
  dryRun: new Option(
    '-d, --dry',
    'perform a dry run, where no changes are made'
  ).default(false),
};

const addCommand = (
  name: string,
  description: string,
  additionalOptions: Option[],
  action: (
    options: Record<string, any>,
    command: InstanceType<typeof Command>
  ) => Promise<void>
) => {
  const command = new Command(name);
  command.description(description);
  command.action(action);
  [options.verbose, ...additionalOptions].forEach((option) => {
    command.addOption(option);
  });

  program.addCommand(command);
  return program;
};

addCommand(
  'cut',
  'Cut a new release',
  [
    new Option('-t, --type <type>', 'the Release build type')
      .choices(['train', 'patch'])
      .default('train')
      .env(createEnvVar('release_type')),
    options.remote,
    options.defaultBranch,
    options.dryRun,
    new Option(
      '-f, --force',
      'set the env var FXAR_REQUIRE_FORCE=1 to require this flag when cutting a new Release'
    ).default(false),
  ],
  cut
);

addCommand(
  'push',
  'Push changes from a Release in progress',
  [
    new Option('--id <value>', 'the ID of the in-progress Release to push'),
    options.dryRun,
    options.remote,
    options.defaultBranch,
  ],
  push
);

addCommand(
  'status',
  'Retrieve the statuses of FxA services',
  [
    new Option(
      '-e, --environment <name>',
      'the environment to retrieve version data from'
    )
      .choices(['production', 'staging', 'development'])
      .default('production')
      .env(createEnvVar('environment')),
    new Option(
      '-s, --services [name]',
      'comma-separated list of Services to retrieve version data for (defaults to all)'
    )
      .choices(Object.keys(serviceSets))
      .argParser(commaSeparatedList)
      .env(createEnvVar('services_include')),
    new Option(
      '-x, --exclude [name]',
      'comma-separated list of Services to exclude from retrieval'
    )
      .argParser(commaSeparatedList)
      .env(createEnvVar('services_exclude')),
  ],
  status
);

addCommand('guide', 'Display helpful Release information', [], guide);

program.parse();
