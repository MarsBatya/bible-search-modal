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

jq --tab --arg new_version "$NEW_VERSION" '.version = $new_version' manifest.json > manifest.tmp
printf '%s' "$(cat manifest.tmp)" > manifest.json
rm manifest.tmp

# Check if jq update was successful
if [ $? -ne 0 ]; then
    echo "Error: Failed to update version in manifest.json"
    return 1
fi

echo "Version updated in manifest.json"

# Stage the manifest.json file
git add manifest.json

# Check if git add was successful
if [ $? -ne 0 ]; then
    echo "Error: Failed to stage manifest.json"
    return 1
fi

# Commit the version change
git commit -m "bump version to $NEW_VERSION"

# Check if commit was successful
if [ $? -ne 0 ]; then
    echo "Error: Failed to commit version change"
    return 1
fi

# Commit the version change
git push origin master

# Check if commit was successful
if [ $? -ne 0 ]; then
    echo "Error: Failed to push version change"
    return 1
fi

echo "Pushed version change to origin"

# Create annotated tag
echo "Creating git tag for version: $NEW_VERSION"
git tag -a "$NEW_VERSION" -m "$NEW_VERSION"

if [ $? -ne 0 ]; then
    echo "Error: Failed to create git tag"
    return 1
fi

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