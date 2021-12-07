// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import chalk from 'chalk';
import { execSync } from 'child_process';
import { Command } from 'commander';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { prompt } from 'inquirer';
import logUpdate from 'log-update';
import { join } from 'path';
import prependFile from 'prepend-file';
import terminalLink from 'terminal-link';
import {
  deployBug,
  deployDocUrl,
  envVarPrefix,
  gitDefaults,
  qaIssuesUrlBase,
  releasesPath,
  repoUrl,
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

export const setValue = (key: keyof typeof globals, value: any) =>
  Object.assign(globals, { [key]: value });

export const getValue = (key: keyof typeof globals) =>
  globals[key] as typeof globals[typeof key];

// Content modifiers

export const shortCommit = (commit: string) => commit.slice(0, 7);

export const unpad = (value: string) => value.replace(/^\s*/gm, '');

export const capitalize = (str: string) =>
  str.charAt(0).toUpperCase() + str.slice(1);

export const commaSeparatedList = (value: string) => value.split(',');

export const parseVersion = (value: string) => {
  const [major, train, patch] = value.replace('v', '').split('.').map(Number);
  assert(
    [major, train, patch].every((part) => part != null),
    `Could not parse Release version from value "${value}".`
  );
  return { major, train, patch };
};

export const visibleLink = (url: string) => chalk.cyan(terminalLink(url, url));

export const createEnvVar = (name: string) =>
  `${envVarPrefix}_${name}`.toUpperCase();

// Assertions

export const assert = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

export function assertPresence(
  values: string | string[],
  message: string
): void {
  if (!Array.isArray(values)) {
    values = [values];
  }
  assert(
    values.every((part) => part != null && part !== ''),
    message
  );
}

export function assertAbsence(
  values: string | string[],
  message: string
): void {
  if (!Array.isArray(values)) {
    values = [values];
  }
  assert(
    values.every((part) => part == null || part === ''),
    message
  );
}

// Interface

export const logInfo = (message: string) => console.log(chalk.italic(message));

export const logDryMessage = (
  message: string,
  type: 'info' | 'warning' | 'error' = 'info'
) => {
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

export const logWarning = (message: string) => {
  setValue('hasWarnings', true);
  console.log(`${chalk.yellow('Warning!')} ${message}`);
};

export const logError = (message: string, err?: any) => {
  setValue('hasErrors', true);
  console.log(`${chalk.red('Bonk!')} ${message}`);
  err && console.trace(err);
  completeCommand();
  console.error('\u0007');
  process.exit(1);
};

export const loadingIndicator = (message: string) => {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let index = 0;

  const interval = setInterval(() => {
    const frame = frames[(index = ++index % frames.length)];
    logUpdate(`${frame} ${message}`);
  }, 80);

  return () => {
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
  async (opts: Record<string, any>, program: InstanceType<typeof Command>) => {
    for (const key in opts) {
      if (key in globals) {
        setValue(key as any, opts[key]);
      }
    }

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

const validateCommand = (remote?: string) => {
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

const completeCommand = () => {
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

export const ensureReleasesPath = () => {
  if (!existsSync(releasesPath)) {
    mkdirSync(releasesPath);
  }
};

export const createReleaseFilePath = (id: string) => {
  ensureReleasesPath();
  return join(releasesPath, id + '.json');
};

// Release operations

export const execute = (
  command: string,
  description: string,
  drySkip = false
) => {
  const skip = drySkip && getValue('dry');
  const prefix = skip ? chalk.yellow('skipped:') : chalk.green('executed:');

  logDryMessage(description);

  if (getValue('verbose')) {
    if (!getValue('dry')) {
      logInfo(description);
    }

    console.log(`↪ ${prefix} ${command}`);
  }

  try {
    return skip
      ? null
      : execSync(command, { cwd: process.cwd() }).toString().trim();
  } catch (error) {
    return null;
  }
};

const retrieveDeployBugURL = () => {
  if (existsSync(deployBug.file)) {
    return readFileSync(deployBug.file, 'utf8').trim();
  }
  return null;
};

const createQaIssuesUrl = (area: 'fxa' | 'subplat') => {
  const twoWeeksAgo = new Date(new Date().getTime() - 12096e5);
  return (
    qaIssuesUrlBase[area] + encodeURIComponent(twoWeeksAgo.toLocaleDateString())
  );
};

export type ReleaseType = 'train' | 'patch';

export type ReleaseData = {
  type: ReleaseType;
  branch: string;
  train: string;
  tag: string;
  modifiedPackages: string[];
};

export const confirmPush = async (
  { train, type, branch, tag, modifiedPackages }: ReleaseData,
  save: boolean,
  id?: string
) => {
  const remote = getValue('remote');
  const command = `git push ${remote} ${branch}:${branch} && git push ${remote} ${tag}`;

  if (getValue('dry')) {
    logDryMessage('Asking for confirmation to push changes.');

    if (getValue('verbose')) {
      console.log(`↪ ${chalk.magenta('proposed:')} ${command}`);
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
    return console.log(
      `${chalk.yellow(
        '\nYour changes have not been pushed.'
      )} Your stored Release will be saved until ${chalk.white(
        new Date(+id + 12096e5).toLocaleString()
      )}.`
    );
  }

  execute(
    command,
    `Pushing Release commits and tag to remote ${remote}.`,
    true
  );

  unlinkSync(createReleaseFilePath(id));

  console.log(
    `${chalk.green(
      '\nRelease pushed successfully!'
    )} Now you you must open pull a request to merge the changes back to ${getValue(
      'defaultBranch'
    )}:\n\n➤ ${visibleLink(
      `${repoUrl}/compare/${branch}?expand=1`
    )}\n\nAsk for review on the pull request from ${chalk.white(
      '@fxa-devs'
    )}.\n`
  );

  const deployDocContent = [
    `## ${tag} is [tagged](${repoUrl}/releases/tag/${tag})`,
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
        .map((p) => `* ${repoUrl}/blob/${tag}/packages/${p}/CHANGELOG.md`)
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

export const createPackagePath = (directory: string) => {
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
) => {
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
) => {
  const changelogPath = join(packagePath, 'CHANGELOG.md');
  if (existsSync(changelogPath)) {
    prependFile.sync(changelogPath, `## ${next}\n\n${message}\n\n`);
  }
};
