# Community plugin submission checklist

Follow this after the code in this folder is ready.

## 0. Repository setup

1. Create a **public** GitHub repo (recommended name: `relation-weaver`).
2. Upload **this entire folder** as the repository root (not nested under another project folder).
3. Confirm the default branch contains:
   - `main.js`
   - `manifest.json`
   - `styles.css`
   - `README.md`
   - `LICENSE`
   - `versions.json`
4. Update `authorUrl` in `manifest.json` if your GitHub username/org differs from `guilier`.
5. Update the manual-install release URL in `README.md` to match your real repo.

## 1. Pre-submit fixes already applied in 3.0.2

- Removed `!important` from CSS (use higher-specificity selectors instead).
- Replaced `grid-template-columns` with `grid-template` shorthand to avoid the false-positive **multicolumn** browser-feature warning.
- Removed custom `::-webkit-scrollbar` rules to avoid **css-scrollbar** warnings.
- Renamed placeholder class `MyPlugin` → `RelationWeaverPlugin`.
- Cleaned `manifest.json` description and set `minAppVersion` to `1.4.5`.

## 2. Create a GitHub Release

Obsidian installs from **release assets**, not only from the repo tree.

1. Ensure `manifest.json` → `version` is `3.0.2` (or bump both `manifest.json` and `versions.json` together).
2. Create a GitHub Release whose **tag** exactly matches that version, e.g. `3.0.2`.
3. Attach these binaries to the release:
   - `main.js`
   - `manifest.json`
   - `styles.css`

Example with GitHub CLI (run inside this folder):

```bash
gh release create 3.0.2 main.js manifest.json styles.css --title "3.0.2" --notes "Community review CSS fixes and packaging."
```

## 3. Submit to the Obsidian community directory

1. Sign in at [community.obsidian.md](https://community.obsidian.md).
2. Link your GitHub account.
3. Add / claim the plugin pointing at this repository.
4. Resolve any automated review warnings shown on the listing.
5. If you need another pass: bump version → commit → new GitHub release with assets → publish again.

Official docs:

- [Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin)
- [Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)

## 4. Likely follow-up review notes (optional hardening)

These may still appear as warnings depending on the scanner revision:

- Prefer `createEl` / textContent over `innerHTML` when inserting user-derived text.
- Prefer `activeDocument` (or Obsidian element helpers) over bare `document` for pop-out window safety.
- Prefer `normalizePath()` for user-entered vault paths.
- Prefer `Vault.process` over `Vault.modify` for background Markdown edits.
- Reduce noisy `console.log` in production paths.

Address them if the directory flags them; they are not required for this packaging pass.

## 5. Local smoke test before submitting

1. Copy `main.js`, `manifest.json`, `styles.css` into a vault `.obsidian/plugins/relation-weaver/`.
2. Enable the plugin.
3. Open the character view, load sample data, open a character modal, and toggle relation history sync.
4. Confirm light/dark themes still look acceptable.
