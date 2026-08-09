# DraftGap (personal fork)

This is a personal, unofficial fork of [vigovlugt/draftgap](https://github.com/vigovlugt/draftgap). It is maintained for my own use, follows the upstream project when useful, and is not an official DraftGap release. No public distribution or support is promised.

DraftGap is a League of Legends draft analyzer built with SolidJS and Tauri. The desktop app can synchronize with champion select through the local League Client and rank available picks using statistical matchup and team-composition data.

## Changes in this fork

- Select the statistics tier: Gold, Gold+, Platinum, Platinum+, Emerald, Emerald+, Diamond, or Diamond+.
- Download daily per-tier datasets, with validated local caching and a local-build fallback.
- Show direct matchup win rate beside overall win rate while preserving overall-win-rate sorting.
- Recommend bans using allied picks and champion hovers during champion select.
- Handle current League Classic data and missing-role data more reliably.

## Development

Install [Bun 1.3.6](https://bun.sh/), Rust, and the [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/), then run:

```sh
bun install --frozen-lockfile
bun dev
```

Useful checks:

```sh
bun typecheck
bun run --filter @draftgap/frontend lint
bun run --filter @draftgap/frontend build
cargo test --manifest-path apps/frontend/src-tauri/Cargo.toml
```

Run the desktop application with:

```sh
bun run --filter @draftgap/frontend tauri-dev
```

## Data

Champion metadata and assets come from [Riot Data Dragon](https://developer.riotgames.com/docs/lol#data-dragon). Statistical datasets are derived from [Lolalytics](https://lolalytics.com/) and are generated separately for each supported tier. These sources are not affiliated with this fork, and statistical recommendations are not guarantees of game outcomes.

## License and attribution

The project is distributed under the [MIT License](LICENSE). The original copyright and license notice are retained, and the upstream DraftGap project is credited above.

## Riot Games disclaimer

DraftGap isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games and all associated properties are trademarks or registered trademarks of Riot Games, Inc.
