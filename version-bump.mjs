// Run by `npm version` through the "version" script: npm has already written the new version
// into package.json and package-lock.json, and this copies it into the two files Obsidian reads.
// package.json is the one place the version is set; manifest.json and versions.json derive from it
import { readFileSync, writeFileSync } from "node:fs";

const version = process.env.npm_package_version;
if (!version) {
  throw new Error("version-bump.mjs runs under `npm version`, which sets npm_package_version");
}

// Rewrite a JSON file the way prettier and .editorconfig keep it: two-space indent, final newline
function update(path, change) {
  const data = JSON.parse(readFileSync(path, "utf8"));
  change(data);
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

let minAppVersion;
update("manifest.json", (manifest) => {
  manifest.version = version;
  minAppVersion = manifest.minAppVersion;
});

// versions.json maps each plugin version to the oldest Obsidian it runs on; an entry that is
// already there is history and stays as it was
update("versions.json", (versions) => {
  versions[version] ??= minAppVersion;
});
