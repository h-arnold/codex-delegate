# Publishing to npm (public registry)

This project can be published to the public npm registry at `https://registry.npmjs.org/`.

Key points:

- Package name is scoped to the user: `@h-arnold/codex-delegate`.
- The package is built by `npm run build` (TypeScript -> `dist/`).
- The package `main` and `types` fields point to `dist/codex-delegate.js` and `dist/codex-delegate.d.ts` respectively.
- The `bin` entry installs an executable `codex-delegate` that runs the CLI.
- Publishing is automated by a GitHub Actions workflow that triggers when a release is published.

Publishing locally (npm registry)

- Use a token that can publish scoped packages (enable 2FA bypass for automation or use a granular token configured for publish).
- Set up npm auth for the public registry:

  //registry.npmjs.org/:\_authToken=PERSONAL_ACCESS_TOKEN

- Then run:

  npm run build
  npm publish --registry=https://registry.npmjs.org/ --access public

Using the package

For installation and usage steps, see the
[“Install from npm” section in the README](../README.md#install-from-npm).

---

# Publishing to GitHub Packages (npm)

This project is also configured to publish to the GitHub npm registry at `https://npm.pkg.github.com/`.

Publishing locally

- If you need to publish from your machine, use a personal access token (with `repo` and `write:packages` scopes) and set up npm auth for GitHub Packages. For manual publishing, set the auth token in `~/.npmrc` as follows:

  //npm.pkg.github.com/:\_authToken=PERSONAL_ACCESS_TOKEN

- Then run:

  npm run build
  npm publish --registry=https://npm.pkg.github.com/

Using the package

For installation and usage steps, see the
[“Install from GitHub Packages” section in the README](../README.md#install-from-github-packages).

CI publishing (recommended)

- The included workflow (`.github/workflows/publish.yml`) publishes to the public npm registry on release and requires an `NPM_TOKEN` repository secret with publish permissions.
- Use a token configured to publish scoped packages (including 2FA bypass for automation, if required by your npm settings).

Notes

- Make sure the repository has releases (manually or via GitHub API) to trigger the publish workflow.
- If you prefer publishing on `push` to a branch or on `workflow_dispatch`, the workflow can be adjusted.

Release checklist

- Update release notes in `docs/release-notes.md`.
- Bump the package version (`npm version <version> --no-git-tag-version`).
- Run checks: `npm run test`, `npm run lint`, and `npm run lint:md`.
- Build locally (`npm run build`) if you want to validate the dist output.
- Commit changes and create a release on GitHub to trigger publishing.
