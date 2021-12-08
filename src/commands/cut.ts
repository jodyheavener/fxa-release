// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import chalk from 'chalk';
import { writeFileSync } from 'fs';
import { packages, repoUrls } from '../constants';
import {
  assertAbsence,
  assertPresence,
  bumpChangelog,
  bumpVersions,
  capitalize,
  commitTypes,
  confirmPush,
  createAuthorsFilePath,
  createEnvVar,
  createPackagePath,
  execute,
  ignoreStdErrUnless,
  logDryMessage,
  logError,
  parseCommits,
  parseVersion,
  ReleaseType,
  unpad,
  validateGitGpg,
  wrapCommand,
} from '../utils';

type Options = {
  type: ReleaseType;
  force: boolean;
  remote: string;
  defaultBranch: string;
  dry: boolean;
  verbose: boolean;
};

type ReleaseVersion = {
  major: number;
  train: number;
  patch: number;
  version: string;
  tag: string;
};

let options: Options;

const getTrainVersions = (
  tag: string
): { current: ReleaseVersion; next: ReleaseVersion } => {
  const { major, train, patch } = parseVersion(tag);

  let nextVersion = `${major}.${train + 1}.0`;
  const next = {
    major,
    train: train + 1,
    patch: 0,
    version: nextVersion,
    tag: `v${nextVersion}`,
  };

  if (options.type === 'patch') {
    nextVersion = `${major}.${train}.${patch + 1}`;
    next.train = train;
    next.patch = patch + 1;
  }

  next.version = nextVersion;
  next.tag = `v${nextVersion}`;

  return {
    current: {
      major,
      train,
      patch,
      version: `${major}.${train}.${patch}`,
      tag: `v${major}.${train}.${patch}`,
    },
    next,
  };
};

const getTrainBranch = (
  type: 'local' | 'remote',
  train: number
): {
  name: string;
  exists: boolean;
} => {
  const localName = `train-${train}`;
  const exists = (lookup: string, value: string): boolean =>
    lookup.replace(/\*| /g, '').split('\n').includes(value);
  if (type === 'local') {
    return {
      name: localName,
      exists: exists(
        execute(
          'git branch --no-color',
          `Inspecting local branches to see if ${localName} branch exists.`
        ),
        localName
      ),
    };
  } else {
    const remoteName = `${options.remote}/train-${train}`;
    return {
      name: remoteName,
      exists: exists(
        execute(
          'git branch --no-color -r',
          `Inspecting remote branches to see if ${remoteName} branch exists.`
        ),
        remoteName
      ),
    };
  }
};

const updateAuthors = (): void => {
  logDryMessage('Updating AUTHORS file with contributors.');
  const result = execute('git shortlog -s', 'Retrieving commit authors.');
  const authors = [...result.matchAll(/^\s+\d\s+(.+)$/gm)].map(
    (result) => result[1]
  );

  if (!options.dry) {
    const authorsFilePath = createAuthorsFilePath();
    writeFileSync(
      authorsFilePath,
      authors.sort((a, b) => a.length - b.length).join('\n')
    );
  }
};

const bump = (
  directory: string,
  currentVersion: ReleaseVersion,
  nextVersion: ReleaseVersion
): string | null => {
  const packagePath = createPackagePath(directory);

  const commits = parseCommits(
    execute(
      `git log ${currentVersion.tag}..HEAD --no-color --pretty=oneline --abbrev-commit -- "packages/${directory}"`,
      `Retrieving commits since ${currentVersion.tag} for ${directory}`
    )
  );

  const summaries: Partial<Record<keyof typeof commitTypes, string>> = {};

  Object.entries(commitTypes).forEach(([type, title]) => {
    const typeCommits = commits.filter((commit) => commit.type === type);
    if (typeCommits.length) {
      const items = typeCommits
        .map(
          (commit) =>
            `\n- ${commit.area ? `${commit.area}: ` : ''}${commit.message} ([${
              commit.hash
            }](${repoUrls.public}/commit/${commit.hash}))`
        )
        .join('');
      summaries[type] = `### ${title}\n${items}`;
    }
  });

  const hasChanges = Object.values(summaries).length > 0;
  let message = 'No changes.';
  if (hasChanges) {
    message = Object.values(summaries).join('\n\n');
  }

  if (packagePath && !options.dry) {
    bumpChangelog(
      packagePath,
      currentVersion.version,
      nextVersion.version,
      message
    );
    bumpVersions(packagePath, currentVersion.version, nextVersion.version);
  }

  return hasChanges ? directory : null;
};

export default wrapCommand(async (opts: Record<string, any>) => {
  options = opts as Options;

  if (process.env[createEnvVar('require_force')] && !options.force) {
    console.log(
      `The env var FXAR_REQUIRE_FORCE is set, requiring this command to be run with the ${chalk.white(
        '--force'
      )} flag`
    );
    process.exit(1);
  }

  validateGitGpg();

  console.log(
    chalk.white(
      `Cutting a new ${chalk.blue(capitalize(options.type))} Release...`
    )
  );

  const currentBranch = execute(
    'git rev-parse --abbrev-ref HEAD',
    'Retrieving the current branch.'
  );
  let lastTag: string;

  if (options.type === 'train') {
    // When starting a train the last tag is the last recently created train tag.
    lastTag = execute(
      'git tag -l --sort=version:refname',
      'The Release type is "train"; retrieving the last Train Tag.'
    )
      .split('\n')
      .filter((t) => t.startsWith('v'))
      .pop();
  } else if (options.type === 'patch') {
    // When we're on a train branch for a patch the current tag is last tag.
    lastTag = execute(
      'git describe --tags --first-parent --abbrev=0',
      'The Release type is "patch"; retrieving the last Patch Tag in the current Release.'
    );

    if (currentBranch === options.defaultBranch) {
      logError(
        `You are trying to release a Patch on the default ${options.defaultBranch} branch. Please switch to a Train branch.`
      );
    }
  }

  if (!lastTag) {
    logError(
      `Could not determine the last Tag. Are you on the correct branch?.`
    );
  }

  // Generate the bumped version string.
  const { current: currentVersion, next: nextVersion } =
    getTrainVersions(lastTag);
  const localTrainBranch = getTrainBranch('local', nextVersion.train);

  try {
    if (currentBranch === options.defaultBranch) {
      assertAbsence(
        execute(
          `git log ${options.remote}/${options.defaultBranch}..HEAD`,
          'Ensuring the default branch is up to date with the remote.'
        ),
        `The default branch (${currentBranch}) has unpushed commits. Please push your commits before Releasing.`
      );
    }

    assertAbsence(
      execute(
        'git status --porcelain',
        'Ensuring the current branch is clean.'
      ),
      `The current branch (${currentBranch}) is not clean. Please commit or stash your changes before Releasing.`
    );

    assertPresence(
      execute(
        `git log ${lastTag}..HEAD --pretty=oneline --abbrev-commit`,
        'Ensure there are new commits on the current branch since the last tagging.'
      ),
      `The current branch (${currentBranch}) has no new commits since the last release tag (${lastTag}).`
    );
  } catch (error) {
    logError(error.message);
  }

  // If current branch is train branch, pull from remote.
  if (currentBranch === localTrainBranch.name) {
    execute(
      `git pull ${options.remote} ${localTrainBranch.name}`,
      `The current branch is the train branch; pulling latest from it.`,
      { drySkip: true }
    );
  }
  // Otherwise checkout existing train branch or create a fresh one from the default branch.
  else {
    if (localTrainBranch.exists) {
      logDryMessage(
        "We are not on a train branch, but we found it locally so we'll switch to it and attempt to pull in the latest changes from the remote."
      );
      execute(
        `git checkout ${localTrainBranch.name}`,
        `Checking out the ${localTrainBranch.name} branch.`,
        { drySkip: true }
      );
      execute(
        `git pull ${options.remote} ${localTrainBranch.name}`,
        `Pulling the latest ${localTrainBranch.name} branch changes from ${options.remote} remote.`,
        { drySkip: true }
      );
    } else {
      logDryMessage(
        "We're not on a train branch; checking to see if one exists on the remote."
      );
      execute(
        `git fetch ${options.remote} ${localTrainBranch.name}`,
        `Attempting to fetch the ${localTrainBranch.name} branch from ${options.remote} remote.`,
        { onStedError: ignoreStdErrUnless("couldn't find remote") }
      );

      const remoteTrainBranch = getTrainBranch('remote', nextVersion.train);
      if (remoteTrainBranch.exists) {
        execute(
          `git checkout --track -b ${localTrainBranch.name} ${remoteTrainBranch.name}`,
          `Remote train branch found; checking it out and attaching it to the remote.`,
          { drySkip: true }
        );
      } else {
        logDryMessage(
          `${localTrainBranch.name} branch not found on local or remote; creating one from ${options.defaultBranch} branch.`
        );
        execute(
          `git checkout ${options.defaultBranch}`,
          `Checking out the ${options.defaultBranch} branch.`,
          { drySkip: true }
        );
        execute(
          `git pull ${options.remote} ${options.defaultBranch}`,
          `Pulling the latest ${options.defaultBranch} branch changes from ${options.remote} remote.`,
          { drySkip: true }
        );
        execute(
          `git checkout -b ${localTrainBranch.name}`,
          `Creating new ${localTrainBranch.name} branch off ${options.defaultBranch} branch.`,
          { drySkip: true }
        );
      }
    }
  }

  logDryMessage('Bumping versions and generating changelogs for each package.');
  const modifiedPackages = Object.values(packages)
    .map((directory) => bump(directory, currentVersion, nextVersion))
    .filter((c) => c != null);

  // TODO: this is not working
  updateAuthors();

  execute(
    `git commit -a -m "Release ${nextVersion.version}"`,
    'Committing release changelog and version bump changes.',
    { drySkip: true }
  );
  execute(
    `git tag -a "${nextVersion.tag}" -m "${capitalize(options.type)} release ${
      nextVersion.version
    }"`,
    `Tagging the code as ${nextVersion.tag}.`,
    { drySkip: true }
  );

  if (!options.dry) {
    console.log(
      `\n${unpad(
        `\n${chalk.green(
          'Tagged!'
        )} A Release commit has been created, and everything has been Tagged locally, but it hasn't been pushed. Before proceeding you should check that the changes appear to be sane. At the very least you should eyeball the diffs and git log, and if you're feeling particularly vigilant you may want to run some of the tests and linters too.`
      )}\n`
    );

    console.log(`- Branch: ${chalk.white(localTrainBranch.name)}`);
    console.log(`- Tag: ${chalk.white(nextVersion.tag)}`);
  }

  await confirmPush(
    {
      train: String(nextVersion.train),
      patch: String(nextVersion.patch),
      type: options.type,
      branch: localTrainBranch.name,
      tag: nextVersion.tag,
      modifiedPackages,
    },
    true
  );
});
