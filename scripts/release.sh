#!/bin/bash

# Read current version from manifest.json using jq
CURRENT_VERSION=$(jq -r '.version' manifest.json)

# Check if jq command was successful and version was found
if [ $? -ne 0 ] || [ "$CURRENT_VERSION" = "null" ] || [ -z "$CURRENT_VERSION" ]; then
    echo "Error: Could not read current version from manifest.json"
    return 1
fi

echo "Current version: $CURRENT_VERSION"
read -p "Enter new version: " NEW_VERSION

# Validate that user entered something
if [ -z "$NEW_VERSION" ]; then
    echo "Error: No version entered"
    return 1
fi

echo "Updating version from $CURRENT_VERSION to $NEW_VERSION"

# `npm version` bumps package.json (and package-lock.json), then runs the
# "version" lifecycle script from package.json - version-bump.mjs, which
# updates manifest.json and versions.json to match - and stages all of them.
# It also commits and creates an annotated tag itself, so package.json,
# manifest.json and versions.json land in the same commit instead of drifting
# apart (.npmrc sets tag-version-prefix="" so the tag comes out as
# "$NEW_VERSION", not "v$NEW_VERSION", matching this repo's existing tags).
npm version "$NEW_VERSION" -m "bump version to %s"

# Check if npm version was successful
if [ $? -ne 0 ]; then
    echo "Error: Failed to bump version"
    return 1
fi

echo "Version bumped, committed, and tagged"

echo "Pushing commits and tag to origin..."
git push origin master --follow-tags

if [ $? -ne 0 ]; then
    echo "Error: Failed to push to origin"
    return 1
fi

REMOTE_URL=$(git remote get-url origin)
REPO_PATH=$(echo "$REMOTE_URL" | sed 's|git@github.com:||;s|https://github.com/||;s|\.git$||')

echo "Successfully updated version to $NEW_VERSION, committed changes, and pushed tag!"
echo "You can wait a bit and go to https://github.com/$REPO_PATH/releases and publish the latest draft."
