# No Quarter

A tabletop RPG system for [Foundry VTT](https://foundryvtt.com), built on d100 success chances (Regular/Greater/Extreme), stats and abilities for characters, and a single-stat stat block for monsters.

Compatible with Foundry VTT v14.

## Installation

In Foundry, open **Game Systems**, choose **Install System**, and paste this into the **Manifest URL** box:

```
https://github.com/tashio-kalderi/no-quarter/releases/latest/download/system.json
```

## Development

The stylesheet is compiled from `src/scss`. After changing any `.scss` file, run:

```
npm install
npm run build
```

## Releasing

Commit the changes, then publish a GitHub release tagged with the new version (for example `v0.2`). The release workflow in `.github/workflows/release.yml` sets the version and download link in `system.json`, and attaches `system.json` and `no-quarter.zip` to the release.
