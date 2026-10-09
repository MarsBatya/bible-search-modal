#!/usr/bin/env bash

release_main() {

set -euo pipefail

error() {
	echo "Error: $*" >&2
	exit 1
}

command -v jq >/dev/null 2>&1 || error "jq is required to read version files"
command -v node >/dev/null 2>&1 || error "Node.js is required to validate versions"

CURRENT_VERSION=$(jq -er '.version | strings' manifest.json) || error "Could not read version from manifest.json"
PACKAGE_VERSION=$(jq -er '.version | strings' package.json) || error "Could not read version from package.json"

[[ "$CURRENT_VERSION" == "$PACKAGE_VERSION" ]] || error "Version mismatch: manifest.json is $CURRENT_VERSION but package.json is $PACKAGE_VERSION"

# This release script handles stable x.y.z versions. Compare with BigInt in
# Node so version components cannot overflow the shell's integer type.
NEXT_VERSION=$(node -e '
const current = process.argv[1];
const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(current);
if (!match) {
  console.error(`Error: Current version is not a stable x.y.z version: ${current}`);
  process.exit(1);
}
console.log(`${match[1]}.${match[2]}.${BigInt(match[3]) + 1n}`);
' "$CURRENT_VERSION") || exit 1

echo "Current version: $CURRENT_VERSION"

if [[ -n "$(git status --porcelain)" ]]; then
	error "Working tree is not clean; commit or stash changes before releasing"
fi

BRANCH=$(git branch --show-current)
[[ -n "$BRANCH" ]] || error "Could not determine the current branch (are you in detached HEAD state?)"

read -r -p "New version (press Enter for $NEXT_VERSION): " NEW_VERSION || error "Could not read a version from the terminal"
NEW_VERSION=${NEW_VERSION:-$NEXT_VERSION}

node -e '
const current = process.argv[1];
const next = process.argv[2];
const parse = (version) => {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version);
  return match && match.slice(1).map(BigInt);
};
const oldParts = parse(current);
const newParts = parse(next);
if (!newParts) {
  console.error(`Error: Version must be stable x.y.z SemVer: ${next}`);
  process.exit(1);
}
const newer = newParts.some((part, index) => {
  for (let i = 0; i < index; i++) {
    if (newParts[i] !== oldParts[i]) return false;
  }
  return part > oldParts[index];
});
if (!newer) {
  console.error(`Error: New version must be greater than ${current}: ${next}`);
  process.exit(1);
}
' "$CURRENT_VERSION" "$NEW_VERSION" || exit 1

echo "Updating version from $CURRENT_VERSION to $NEW_VERSION"

# npm's version lifecycle updates manifest.json and versions.json, then npm
# commits and tags all version changes.
npm version "$NEW_VERSION" -m "bump version to %s" || error "Failed to bump version"

echo "Version bumped, committed, and tagged"
echo "Pushing commits and tag to origin..."
git push origin "$BRANCH" --follow-tags || error "Failed to push to origin"

REMOTE_URL=$(git remote get-url origin)
REPO_PATH=$(echo "$REMOTE_URL" | sed -E 's|^git@github.com:||; s|^https://github.com/||; s|\.git$||')

echo "Successfully updated version to $NEW_VERSION, committed changes, and pushed tag!"
if [[ "$REPO_PATH" != "$REMOTE_URL" ]]; then
	echo "You can wait a bit and go to https://github.com/$REPO_PATH/releases and publish the latest draft."
fi
}

# Run in a subshell so sourcing this script cannot change the caller's shell
# options or variables. Failures return a status to the caller without exiting
# the shell that sourced it.
if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then
	(release_main)
	return $?
else
	release_main
	exit $?
fi
