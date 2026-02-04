# Publishing to GitHub Packages (npm)

This project is configured to publish to the GitHub npm registry at `https://npm.pkg.github.com/`.

Key points:

- Package name is scoped to the user: `@h-arnold/codex-delegate`.
- The package is built by `npm run build` (TypeScript -> `dist/`).
- The package `main` and `types` fields point to `dist/codex-delegate.js` and `dist/codex-delegate.d.ts` respectively.
- The `bin` entry installs an executable `codex-delegate` that runs the CLI.
- Publishing is automated by a GitHub Actions workflow that triggers when a release is published.

Publishing locally

- If you need to publish from your machine, use a personal access token (with `repo` and `write:packages` scopes) and set up npm auth for GitHub Packages. For manual publishing, set the auth token in `~/.npmrc` as follows:

  //npm.pkg.github.com/:\_authToken=PERSONAL_ACCESS_TOKEN

- Then run:

  npm run build
  npm publish --registry=https://npm.pkg.github.com/

Using the package

- Configure npm to install from GitHub Packages for the `@h-arnold` scope:

  ```bash
  npm config set @h-arnold:registry https://npm.pkg.github.com/
  npm config set //npm.pkg.github.com/:_authToken=PERSONAL_ACCESS_TOKEN
  ```

- Install the CLI globally:

  ```bash
  npm install -g @h-arnold/codex-delegate
  ```

- Run the CLI to confirm it is available:

  ```bash
  codex-delegate --help
  ```

CI publishing (recommended)

- The included workflow (`.github/workflows/publish.yml`) uses `actions/setup-node` and the GitHub-provided `GITHUB_TOKEN` to publish when a release is published.
- No extra secrets are required for publishing from GitHub Actions; publishing happens automatically on release.

Notes

- Make sure the repository has releases (manually or via GitHub API) to trigger the publish workflow.
- If you prefer publishing on `push` to a branch or on `workflow_dispatch`, the workflow can be adjusted.
