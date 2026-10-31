# Legacy Canon archive

This folder preserves the original world/scene Canon files from the
pre-KeyCanon content system. No content was rewritten or shortened.

| Archive file | Records | Status |
| --- | ---: | --- |
| `knowledge/knowledge_db.json` | 114 | Original mixed game rules, lore, characters, entities and Level 0-6 facts |
| `knowledge/level_0_canon_cards.json` | 109 | Original Level 0, Sub-level, Area, Zone and Sub-zone scene cards |
| `knowledge/level_1plus_canon_cards.json` | 38 | Original Level 1-13 and related scene cards |

## Active scene Canon

`web/knowledge/KeyCanon.json` is the preferred scene-description input for
Canon Runtime 2. It contains all 140 location records.

The recovered CR2 implementation also uses historical record IDs and
knowledge rules. To avoid breaking the compiled game core, the Pages build
and the engine test host supply archived text under the **original virtual
asset keys**, `knowledge/knowledge_db.json`,
`knowledge/level_0_canon_cards.json`, and
`knowledge/level_1plus_canon_cards.json`.
The legacy files remain *technical compatibility inputs*, not the preferred
source for new authored scene descriptions.

`web/knowledge/level_travel_policy.json`, both visual registries, and
`web/canon/*.md` are **not** superseded by KeyCanon. They remain active.
The extracted `apk-original` files are also preserved without modification.

## Restore or reuse

To inspect or restore the archived Canon, take the originals from this
directory. To reinstate them as editable source files, copy the chosen JSON
from `Legacy/knowledge/` into `web/knowledge/` and remove its compatibility
alias in `scripts/build_pages.py` and `scripts/test_engine.cjs`.
To intentionally use legacy scene descriptions instead of KeyCanon in
Game Master narration, adjust the precedence in `CoreBridge.java`;
restoring the files alone does not switch storytelling precedence.

The archive is verified on every Pages CI run by
`node scripts/test_legacy_canon.cjs`.
