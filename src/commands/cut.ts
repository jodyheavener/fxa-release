// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import chalk from "chalk";
import { Command } from "commander";
import {
  assert,
  capitalize,
  error,
  execute,
  getValue,
  setValue,
  logInfo,
  validateExecution,
  confirmPush,
} from "../utils";

let options: {
  type: "train" | "patch";
  remote: string;
  defaultBranch: string;
  dry: boolean;
  verbose: boolean;
};

const getTrainVersions = (tag: string) => {
  const [major, train, patch] = tag.replace("v", "").split(".").map(Number);
  assert(
    [major, train, patch].every((part) => part != null),
    `Could not parse train versions using tag "${tag}". Are you on the right branch?`
  );
  let nextVersion = `${major}.${train + 1}.0`;
  const next = {
    major,
    train: train + 1,
    patch: 0,
    version: nextVersion,
    tag: `v${nextVersion}`,
  };
  if (options.type === "patch") {
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

const getTrainBranch = (type: "local" | "remote", train: number) => {
  const localName = `train-${train}`;
  const exists = (lookup: string, value: string) =>
    lookup.replace(/\*| /g, "").split("\n").includes(value);
  if (type === "local") {
    return {
      name: localName,
      exists: exists(
        execute(
          "git branch --no-color",
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
          "git branch --no-color -r",
          `Inspecting remote branches to see if ${remoteName} branch exists.`
        ),
        remoteName
      ),
    };
  }
};

const complete = () => {
  if (options.dry) {
    if (getValue("hasErrors")) {
      console.log(
        `\n${chalk.red(
          "💥 The release would have failed"
        )}. Please correct the errors above and try again.`
      );
    } else {
      console.log(
        "\nDry run complete! If everything above looks good, re-run the command without the --dry flag to actually release."
      );
    }
  }

  process.exit();
};

export default async (
  opts: Record<string, any>,
  command: InstanceType<typeof Command>
) => {
  try {
    setValue("dry", opts.dry);
    setValue("verbose", opts.verbose);
    setValue("remote", opts.remote);
    options = opts as typeof options;

    validateExecution(options.remote);

    if (options.dry) {
      console.log(
        chalk.white(
          "ℹ️  Dry run enabled. Critical commands will be skipped.",
          "\n"
        )
      );
    }

    const currentBranch = execute(
      "git rev-parse --abbrev-ref HEAD",
      "Retrieving the current branch."
    );
    let lastTag: string;

    if (options.type === "train") {
      // When starting a train the last tag is the last recently created train tag.
      lastTag = execute(
        "git tag -l --sort=version:refname",
        'The release type is "train"; retrieving the last train tag.'
      )
        .split("\n")
        .filter((t) => t.startsWith("v"))
        .pop();
    } else if (options.type === "patch") {
      // When we're on a train branch for a patch the current tag is last tag.
      lastTag = execute(
        "git describe --tags --first-parent --abbrev=0",
        'The release type is "patch"; retrieving the last patch tag in the current release.'
      );

      if (currentBranch === options.defaultBranch) {
        error(
          `You are trying to release a patch on the default ${options.defaultBranch} branch. Please switch to a train branch.`
        );
      }
    }

    // Generate the bumped version string.
    const { current: currentVersion, next: nextVersion } =
      getTrainVersions(lastTag);
    const localTrainBranch = getTrainBranch("local", nextVersion.train);

    if (
      execute(
        "git status --porcelain",
        "Ensuring the current branch is clean."
      ) !== ""
    ) {
      error(
        `The current branch (${currentBranch}) is not clean. Please commit or stash your changes before releasing.`
      );
    }

    if (
      execute(
        `git log ${lastTag}..HEAD --pretty=oneline --abbrev-commit`,
        "Ensure there are new commits on the current branch since the last tagging."
      ) === ""
    ) {
      error(
        `The current branch (${currentBranch}) has no new commits since the last release tag (${lastTag}).`
      );
    }

    // If current branch is train branch, pull from remote.
    if (currentBranch === localTrainBranch.name) {
      execute(
        `git pull ${options.remote} ${localTrainBranch.name}`,
        `The current branch is the train branch; pulling latest from it.`,
        true
      );
    }
    // Otherwise checkout existing train branch or create a fresh one from the default branch.
    else {
      if (localTrainBranch.exists) {
        logInfo(
          "We are not on a train branch, but we found it locally so we'll switch to it and attempt to pull in the latest changes from the remote."
        );
        execute(
          `git checkout ${localTrainBranch.name}`,
          `Checking out the ${localTrainBranch.name} branch.`,
          true
        );
        execute(
          `git pull ${options.remote} ${localTrainBranch.name}`,
          `Pulling the latest ${localTrainBranch.name} branch changes from ${options.remote} remote.`,
          true
        );
      } else {
        logInfo(
          "We're not on a train branch; checking to see if one exists on the remote."
        );
        execute(
          `git fetch ${options.remote} ${localTrainBranch.name} > /dev/null 2>&1`,
          `Attempting to fetch the ${localTrainBranch.name} branch from ${options.remote} remote.`
        );

        const remoteTrainBranch = getTrainBranch("remote", nextVersion.train);
        if (remoteTrainBranch.exists) {
          execute(
            `git checkout --track -b ${localTrainBranch.name} ${remoteTrainBranch.name}`,
            `Remote train branch found; checking it out and attaching it to the remote.`,
            true
          );
        } else {
          logInfo(
            `${localTrainBranch.name} branch not found on local or remote; creating one from ${options.defaultBranch} branch.`
          );
          execute(
            `git checkout ${options.defaultBranch}`,
            `Checking out the ${options.defaultBranch} branch.`,
            true
          );
          execute(
            `git pull ${options.remote} ${options.defaultBranch}`,
            `Pulling the latest ${options.defaultBranch} branch changes from ${options.remote} remote.`,
            true
          );
          execute(
            `git checkout -b ${localTrainBranch.name}`,
            `Creating new ${localTrainBranch.name} branch off ${options.defaultBranch} branch.`,
            true
          );
        }
      }
    }

    // TODO: define targets, bump each

    execute("npm run authors", "Updating the authors file.", true);
    execute(
      `git commit -a -m "Release ${nextVersion.version}"`,
      "Committing release changelog and version bump changes.",
      true
    );
    execute(
      `git tag -a "${nextVersion.tag}" -m "${capitalize(
        options.type
      )} release ${nextVersion.version}"`,
      `Tagging the code as ${nextVersion.tag}.`,
      true
    );

    // TODO: if deploy script file available, inspect it and replace train number with current train number

    if (!options.dry) {
      console.log(`
        ${chalk.green(
          "✅ Success!"
        )} A release commit has been created, and everything has been tagged locally, but it hasn't been pushed.
        \nBefore proceeding you should check that the changes appear to be sane. At the very least you should eyeball the diffs and git log, and if you're feeling particularly vigilant you may want to run some of the tests and linters too.
      `);
    }

    await confirmPush({
      branch: localTrainBranch.name,
      tag: nextVersion.tag
    });

    complete();
  } catch (err) {
    error("An error occurred with the CLI. Please file an issue.", true, err);
  }
};
