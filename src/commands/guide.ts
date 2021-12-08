// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import chalk from 'chalk';
import { ecosystemDocsUrl, repoUrls } from '../constants';
import { visibleLink, wrapCommand } from '../utils';

const definitions = {
  Release:
    'A Release is a collection of changes made to the codebase, denoted by a version number, that is packaged for deployment to our servers.',
  Train: 'Trains are releases that are regularly scheduled.',
  Patch:
    'Patches are releases with specific changes, added to the current Train, that were necessary before the next Train Release.',
  Owner:
    'The Owner, or Release Owner, is the engineer responsible for looking after the current Release.',
  Service:
    'A Service is an application in our monorepo codebase that can be run locally, or built and deployed to our servers.',
  Tag: "A tag is a Git function that marks a point in a codebase's history. We create a new tag for each Release.",
  Remote:
    'The Remote is the external Git repository we push Release commits and tags to.',
};

export default wrapCommand(() => {
  console.log(chalk.white('About\n'));
  console.log(
    'The Firefox Accounts team, or FxA, regularly releases new versions of all the Services in its monorepo. We use Git tags to mark each Release. This CLI is designed to aid in the release process, and as the Owner you can use it to prepare, create, and push new Releases.\n'
  );
  console.log(
    `The main Firefox Accounts repository can be found at: ${visibleLink(
      repoUrls.public
    )}`
  );
  console.log(
    `\nMore detailed information about the release process can be found in our Ecosystem Platform documentation: ${visibleLink(
      ecosystemDocsUrl
    )}`
  );

  console.log(chalk.white('\nGlossary\n'));
  console.log(
    Object.keys(definitions)
      .map((d) => `${chalk.blue(d)} - ${chalk.italic(definitions[d])}`)
      .join('\n')
  );
});
