# Game data extractor

Generates `public/data/*.json` and `public/sprites/**/*.png` from a local Stardew Valley install.
The outputs are committed so the site works without the game; rerun after each game patch.

## Requirements
- Stardew Valley 1.6+ installed (Steam default path is assumed).
- .NET 8 SDK (`dotnet --list-sdks`), used by the C# dumper.
- Node 22+.

## Usage
```bash
npm run extract
npm run extract -- --game "D:/Games/Stardew Valley"
npm run extract -- --skip-dump   # reuse tools/extract/.cache/raw
```

## How it works
1. `dumper/` (C#) loads every asset under `Data`, `Strings`, `Characters/schedules` and
   `Characters/Dialogue` with the game's own `ContentManager` and `StardewValley.GameData`
   types, and writes them as JSON to `.cache/raw` (git-ignored). This handles the 1.6
   reflective data formats that JavaScript XNB readers cannot decode.
2. `index.mjs` builds compact, localized datasets (`lib/items.mjs`, `lib/npcs.mjs`, ...) and
   converts the referenced textures to PNG with [xnb.js](https://github.com/lybell-art/xnb-js).

Names use `[en, pt]` arrays; text tokens like `[LocalizedText Strings\Objects:Weeds_Name]` are
resolved from the game's own translation files.

To add a dataset, write a `build*` function in `lib/` and register it in `index.mjs`.
