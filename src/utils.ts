// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import chalk from 'chalk';
import { spawnSync } from 'child_process';
import { Command } from 'commander';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { prompt } from 'inquirer';
import logUpdate from 'log-update';
import { join } from 'path';
import terminalLink from 'terminal-link';
import {
  deployBug,
  deployDocUrl,
  envVarPrefix,
  gitDefaults,
  qaIssuesUrlBase,
  releasesPath,
  repoUrls,
  twoWeeks,
  twoWeeksAgo,
} from './constants';

// Global values

const globals = {
  remote: gitDefaults.remote,
  defaultBranch: gitDefaults.branch,
  dry: false,
  verbose: false,
  hasErrors: false,
  hasWarnings: false,
};

export const setValue = (key: keyof typeof globals, value: any): object =>
  Object.assign(globals, { [key]: value });

export const getValue = (key: keyof typeof globals): string | boolean =>
  globals[key] as typeof globals[typeof key];

// Content modifiers

export const shortCommit = (commit: string): string => commit.slice(0, 7);

export const unpad = (value: string): string => value.replace(/^\s*/gm, '');

export const capitalize = (str: string): string =>
  str.charAt(0).toUpperCase() + str.slice(1);

export const commaSeparatedList = (value: string): string[] => value.split(',');

export const stringInsert = (
  existing: string,
  value: string,
  index: number
): string =>
  index > 0
    ? existing.substring(0, index) +
      value +
      existing.substring(index, existing.length)
    : value + existing;

export const parseVersion = (
  value: string
): {
  major: number;
  train: number;
  patch: number;
} => {
  const [major, train, patch] = value.replace('v', '').split('.').map(Number);
  assert(
    [major, train, patch].every((part) => part != null),
    `Could not parse Release version from value "${value}".`
  );
  return { major, train, patch };
};

export const visibleLink = (url: string): string =>
  chalk.cyan(terminalLink(url, url));

export const createEnvVar = (name: string): string =>
  `${envVarPrefix}_${name}`.toUpperCase();

// Assertions

export const assert = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

export const assertPresence = (
  values: string | string[],
  message: string
): void => {
  if (!Array.isArray(values)) {
    values = [values];
  }
  assert(
    values.every((part) => part != null && part !== ''),
    message
  );
};

export const assertAbsence = (
  values: string | string[],
  message: string
): void => {
  if (!Array.isArray(values)) {
    values = [values];
  }
  assert(
    values.every((part) => part == null || part === ''),
    message
  );
};

// Interface

export const logInfo = (message: string): void =>
  console.log(chalk.italic(message));

export const logDryMessage = (
  message: string,
  type: 'info' | 'warning' | 'error' = 'info'
): void => {
  if (!getValue('dry')) {
    return;
  }

  let prefix = '';

  if (type === 'warning') {
    prefix = chalk.yellow('Warning: ');
  } else if (type === 'error') {
    prefix = chalk.red('Error: ');
  }

  console.log(`- ${prefix}${message}`);
};

export const logWarning = (message: string): void => {
  setValue('hasWarnings', true);
  console.log(`${chalk.yellow('Warning!')} ${message}`);
};

export const logError = (message: string, err?: any): void => {
  setValue('hasErrors', true);
  console.log(`${chalk.red('Bonk!')} ${message}`);
  err && console.trace(err);
  completeCommand();
  console.error('\u0007');
  process.exit(1);
};

export const loadingIndicator = (message: string): (() => void) => {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let index = 0;

  const interval = setInterval(() => {
    const frame = frames[(index = ++index % frames.length)];
    logUpdate(`${frame} ${message}`);
  }, 80);

  return (): void => {
    logUpdate.clear();
    clearInterval(interval);
  };
};

// Command execution

export const wrapCommand =
  (
    fn: (
      opts: Record<string, any>,
      program: InstanceType<typeof Command>
    ) => void | Promise<void>
  ) =>
  async (
    opts: Record<string, any>,
    program: InstanceType<typeof Command>
  ): Promise<void> => {
    for (const key in opts) {
      if (key in globals) {
        setValue(key as any, opts[key]);
      }
    }

    removeOldReleases();

    if (getValue('dry')) {
      console.log(
        chalk.white('⚠  Dry run enabled. Critical commands will be skipped.\n')
      );
    }

    validateCommand(opts.remote);

    try {
      await fn(opts, program);
    } catch (err) {
      logError('The command encountered an error and needed to abort', err);
    }

    completeCommand();
  };

const validateCommand = (remote?: string): void => {
  const pckg = JSON.parse(
    readFileSync(join(process.cwd(), 'package.json'), 'utf8')
  );
  if (pckg.name !== 'fxa') {
    logError('This CLI needs to be run in an FxA codebase.');
  }

  if (
    remote &&
    execute(
      `git ls-remote ${remote}`,
      `Checking the existence of the specified remote (${remote})`
    ) === ''
  ) {
    logError(`Could not find the ${remote} Git remote.`);
  }
};

const removeOldReleases = (): void => {
  const twoWeeksAgoTimestamp = twoWeeksAgo.getTime();
  const releasesToRemove = retrieveAvailableReleases().filter(
    (releaseTimestamp) => twoWeeksAgoTimestamp > +releaseTimestamp
  );
  if (getValue('verbose')) {
    console.log(
      `Removing ${
        releasesToRemove.length
      } stored Releases that are older than two weeks: ${releasesToRemove.join(
        ', '
      )}`
    );
  }
  releasesToRemove.forEach((release) => {
    unlinkSync(join(releasesPath, `${release}.json`));
  });
};

export const validateGitGpg = (): void => {
  if (
    execute('git config --get commit.gpgsign', 'Checking for GPG signing') !==
    'true'
  ) {
    logError('GPG signing is not enabled for commits.');
  }
};

const completeCommand = (): void => {
  if (getValue('dry')) {
    if (getValue('hasErrors')) {
      console.log(
        `\n${chalk.red(
          'This command would not have completed successfully.'
        )} Please correct the errors above and try again before removing the --dry flag.`
      );
    } else {
      console.log(
        `\n${chalk.green(
          'Dry run complete!'
        )} If everything above looks good, re-run the command without the ${chalk.white(
          '--dry'
        )} flag to perform it for real.`
      );
    }
    return;
  }

  if (getValue('hasErrors')) {
    console.log(
      chalk.red('\nThere were errors during the execution of this command.')
    );

    if (!getValue('verbose')) {
      console.log(
        `Re-run this command with the ${chalk.white(
          '--verbose'
        )} flag for more details`
      );
    }
  } else if (getValue('hasWarnings')) {
    console.log(chalk.yellow('\nCompleted with warnings.'));
  } else {
    console.log(chalk.green('\nCompleted successfully.'));
  }
};

// File system

export const ensureReleasesPath = (): void => {
  if (!existsSync(releasesPath)) {
    mkdirSync(releasesPath);
  }
};

export const createReleaseFilePath = (id: string): string => {
  ensureReleasesPath();
  return join(releasesPath, id + '.json');
};

// Release operations

export const execute = (
  command: string,
  description: string,
  options: {
    drySkip?: boolean;
    onStedError?: ((input: string) => void) | false;
  } = {}
): string | null => {
  const skip = (options.drySkip || false) && getValue('dry');
  const prefix = skip ? chalk.yellow('skipped:') : chalk.green('executed:');

  logDryMessage(description);

  if (getValue('verbose')) {
    if (!getValue('dry')) {
      logInfo(description);
    }

    console.log(`↪ ${prefix} ${command}`);
  }

  if (skip) {
    return null;
  }

  const [base, ...args] = command.split(' ');
  const result = spawnSync(base, args, { cwd: process.cwd() });

  if (result.error) {
    logError(`Command failed: ${command}`, result.error);
  }

  const stderr = result.stderr.toString();
  if (stderr.length > 0) {
    if (options.onStedError) {
      options.onStedError(stderr);
    } else if (options.onStedError !== false) {
      logError(`Command failed: ${command}`, stderr);
    }
  }

  return result.stdout.toString().trim();
};

export const ignoreStdErrUnless = (value: string) => {
  return (input: string): void => {
    if (!input.includes(value)) {
      logError(`Command failed: ${input}`);
    }
  };
};

export const retrieveAvailableReleases = (): string[] => {
  ensureReleasesPath();
  const files = readdirSync(releasesPath);
  return files.map((f) => f.split('.')[0]);
};

const retrieveDeployBugURL = (): string => {
  if (existsSync(deployBug.file)) {
    return readFileSync(deployBug.file, 'utf8').trim();
  }
  return null;
};

const createQaIssuesUrl = (area: 'fxa' | 'subplat'): string =>
  qaIssuesUrlBase[area] + encodeURIComponent(twoWeeksAgo.toLocaleDateString());

export const createAuthorsFilePath = (): string => {
  const authorsFilePath = join(process.cwd(), 'AUTHORS');

  if (!existsSync(authorsFilePath)) {
    throw new Error(`Could not find AUTHORS file: ${authorsFilePath}`);
  }

  return authorsFilePath;
};

export type ReleaseType = 'train' | 'patch';

export type ReleaseData = {
  type: ReleaseType;
  branch: string;
  train: string;
  patch: string;
  tag: string;
  modifiedPackages: string[];
};

export const confirmPush = async (
  { train, patch, type, branch, tag, modifiedPackages }: ReleaseData,
  save: boolean,
  id?: string
): Promise<void> => {
  const remote = getValue('remote');
  const pushCommitCommand = `git push ${remote} ${branch}:${branch}`;
  const pushTagCommand = `git push ${remote} ${tag}`;
  const combinedCommand = `${pushCommitCommand} && ${pushTagCommand}`;

  if (getValue('dry')) {
    logDryMessage('Asking for confirmation to push changes.');

    if (getValue('verbose')) {
      console.log(`↪ ${chalk.magenta('proposed:')} ${combinedCommand}`);
    }

    return;
  }

  let deployBugUrl = retrieveDeployBugURL();
  if (deployBugUrl) {
    deployBugUrl = deployBugUrl.replace('TRAIN_NUMBER', train);
  }

  if (save) {
    id = new Date().getTime().toString();
    writeFileSync(
      createReleaseFilePath(id),
      JSON.stringify(
        {
          train,
          patch,
          type,
          branch,
          tag,
          modifiedPackages,
        },
        null,
        2
      )
    );
  }

  console.log(
    `\n${chalk.yellow(
      'Important:'
    )} You are about to push the commits on branch ${chalk.white(
      branch
    )} and the tag ${chalk.white(tag)} to remote ${chalk.white(
      remote
    )}. This may trigger CI jobs. If you would like to manually push changes at a later time, run the following when you are ready:\n\n${chalk.white(
      `fxa-release push --id ${id}`
    )}\n`
  );
  const { confirm } = (await prompt({
    type: 'input',
    name: 'confirm',
    message:
      "Type 'push' to confirm. Any other response will abort and save your Release for later.",
  })) as { confirm: string };

  if (confirm !== 'push') {
    // Store the release for 2 weeks
    console.log(
      `${chalk.yellow(
        '\nYour changes have not been pushed.'
      )} Your stored Release will be saved until ${chalk.white(
        new Date(+id + twoWeeks).toLocaleString()
      )}.`
    );
    return;
  }

  execute(
    pushCommitCommand,
    `Pushing Release commit and tag to remote ${remote}.`,
    { drySkip: true }
  );
  execute(pushTagCommand, `Pushing Release tag to remote ${remote}.`, {
    drySkip: true,
  });

  unlinkSync(createReleaseFilePath(id));

  const taggingUrl = `${repoUrls.public}/releases/tag/${tag}`;

  console.log(
    `${chalk.green(
      '\nRelease pushed successfully!'
    )} Now you you must open pull a request to merge the changes back to ${getValue(
      'defaultBranch'
    )}:\n\n➤ ${visibleLink(
      `${repoUrls.public}/compare/${branch}?expand=1&title=${encodeURIComponent(
        `Release ${train}.${patch}`
      )}&body=${encodeURIComponent(
        `Train ${train}.${patch} has been [tagged](${taggingUrl}).`
      )}`
    )}\n\nAsk for review on the pull request from ${chalk.white(
      '@fxa-devs'
    )}.\n`
  );

  const deployDocContent = [
    `## ${tag} is [tagged](${repoUrls.public}/releases/tag/${tag})`,
  ];

  if (type === 'train') {
    const deployRequestUrl = deployBugUrl
      ? `Here's the URL to create one in Bugzilla: ${visibleLink(deployBugUrl)}`
      : `Open this file and use its URL to create one in Bugzilla (be sure to update the title for Train ${train} before opening): ${visibleLink(
          deployBug.url
        )}`;

    console.log(
      `If there's no deploy bug for Train ${train} yet, you should create one. ${deployRequestUrl}\n`
    );
    console.log(
      `Copy any notes for Train ${train} from the deploy doc: ${visibleLink(
        deployDocUrl
      )}\n`
    );
    console.log('Then copy and paste the rest of this output into the bug:');

    deployDocContent.push(
      `### Deploy doc notes\n\n[Replace with any notes for Train ${train}]`,
      `### QA requests\n\n* Marked **needs:qa** (FxA): ${createQaIssuesUrl(
        'fxa'
      )}\n* Marked **qa+** (SubPlat): ${createQaIssuesUrl('subplat')}`
    );
  } else if (type === 'patch') {
    console.log(
      `Don't forget to leave a comment in the deploy bug for Train ${train}, copying the following output into it:`
    );
  }

  if (modifiedPackages.length > 0) {
    deployDocContent.push(
      `### Pertinent changelogs\n\n${modifiedPackages
        .map(
          (p) => `* ${repoUrls.public}/blob/${tag}/packages/${p}/CHANGELOG.md`
        )
        .join('\n')}`
    );
  }

  console.log(chalk.white.italic(`\n${deployDocContent.join('\n\n')}`));
};

export const commitTypes = {
  feat: 'New features',
  fix: 'Bug fixes',
  docs: 'Documentation changes',
  style: 'Code formatting',
  perf: 'Performance improvements',
  refactor: 'Code refactoring',
  revert: 'Reverted changes',
  test: 'Test changes',
  chore: 'Build tool or dependency changes',
  other: 'Other changes',
};

export const ignoredCommitTypes = ['Merge', 'Release'];

export type PackageCommit = {
  original: string;
  hash: string;
  message: string;
  type: keyof typeof commitTypes;
  area?: string;
};

export const parseCommits = (input: string): PackageCommit[] => {
  let commits = [];

  if (input.trim().length) {
    commits = input
      .split('\n')
      .map((original: string) => {
        const [hash, rest] = original.split(/ (.+)/);
        const parts = rest.match(/^(.+)\((.+)\):(.+)$/);
        const commit = {
          original,
          hash,
        };

        if (parts) {
          const type = parts[1];

          if (ignoredCommitTypes.includes(type)) {
            return null;
          }

          if (type in commitTypes) {
            Object.assign(commit, {
              message: parts[3].trim(),
              type: parts[1],
              area: parts[2],
            });
          } else {
            Object.assign(commit, {
              type: 'other',
              message: rest,
            });
          }
        } else {
          Object.assign(commit, {
            type: 'other',
            message: rest,
          });
        }

        return commit as PackageCommit;
      })
      .filter((c) => c != null);
  }

  return commits;
};

export const createPackagePath = (directory: string): string => {
  const packagesPath = join(process.cwd(), 'packages');

  if (!existsSync(packagesPath)) {
    throw new Error(`Could not find packages directory: ${packagesPath}`);
  }

  const packagePath = join(packagesPath, directory);
  if (!existsSync(packagePath)) {
    logWarning(`Could not find package directory for ${directory}`);
    return null;
  }

  return packagePath;
};

const versionedFiles = ['package.json', 'Cargo.toml', 'Cargo.lock'];

export const bumpVersions = (
  packagePath: string,
  current: string,
  next: string
): void => {
  for (const file of versionedFiles) {
    const filePath = join(packagePath, file);
    if (existsSync(filePath)) {
      let content = readFileSync(filePath, 'utf8');
      content = content.replace(current, next);
      writeFileSync(filePath, content, 'utf8');
    }
  }
};

export const bumpChangelog = (
  packagePath: string,
  current: string,
  next: string,
  message: string
): void => {
  const changelogTitle = '# Change history';
  const changelogPath = join(packagePath, 'CHANGELOG.md');
  if (existsSync(changelogPath)) {
    let content = readFileSync(changelogPath, 'utf8');
    if (content.includes(changelogTitle)) {
      content = stringInsert(
        content,
        `\n\n## ${next}\n\n${message}`,
        content.indexOf(changelogTitle) + changelogTitle.length
      );
    } else {
      content = `## ${next}\n\n${message}\n\n${content}`;
    }
    writeFileSync(changelogPath, content, 'utf8');
  }
};
