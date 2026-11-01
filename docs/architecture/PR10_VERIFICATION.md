# PR #10: design trace and verification

The sole design authority is the supplied `ARCHITECTURE_AUDIT.md`, preserved byte for byte here (SHA-256 `66401a89bb05d82a8a65693a517c4bc744835c53bad04bee2885ccdc5dab22db`). The supplied implementation gate report is preserved as historical evidence, not rewritten into an approval. No framework, database, dependency, alternate engine, or provider configuration was introduced.

## Reproduced defects

Against PR product baseline `02fc63c5e785cc9b56eec2f26cf7917fbe4e861e`, the web probes reproduced: rejection of recalled absent canon actors without optional IDs; acceptance of an invented reunion in prose, with and without actor metadata; rollback after UI delivery had already changed the UI turn; and an old model response restoring an earlier run over a new game.

The complete packaged native gameplay lambda also reproduced the reunion, callback and stale-run defects in Android 15. Its first characterization run is `41315892079`, commit `4bc176f8828678299e6e2179bd53dda7e8fcd857`. That workflow deliberately ran in probe mode and reported failures. Its green process status was not acceptance of those invariants. The final workflow requires zero native failures and successful web gate assertions.

The initial native missing-preview probe used EXECUTE and a nonphysical listening action, both of which Core excludes from Entity encounters. It was corrected to use an actual EXPLORE plan and physical exploration action at an eligible destination, and requires the specific `entity_preview_missing` error. It was not used as evidence of a product rollback defect. The canon-failure fixture was similarly corrected to the established `Cao Minh cạn ma nguyên.` regression input. Mobile layout checks wait for the actual HUD module before reading sidebar styles; the bridge's earlier playable marker does not mean UI initialization is complete.

## Design mapping

| Design requirement | Implementation and evidence |
| --- | --- |
| C4: one transaction owner | Existing `InventoryUsePolicy` stages facade repository reads/writes. Android writes the accepted Core snapshot once before UI delivery. Web persists the final staged snapshot before committing its infallible MemorySave. Intermediate facade calls do not write browser storage. |
| C1.9: failures and stale responses | Pre-commit failures discard staged state. New Game/load/clear invalidate the pending transaction. Begin validates run, revision and turn. Callback failure after commit reports `turn_committed_ui_sync_failed` and preserves the committed turn. |
| Gate report: actor metadata versus prose | Exact canon names come from existing Core character definitions. Optional absent-actor emotion updates are ignored even without `id`; unknown IDs and identity substitutions are rejected. Reply, Entity preview and summary are checked separately for unsupported canon presence. |
| C2: additive, bounded metadata | `narrativeSchema:1` versions the existing flags namespace without changing saveVersion 3. One active scene, six actors, up to twelve completed temporary encounters, bounded observations and a 32 KiB UTF-8 namespace limit are enforced. A full encounter budget rejects opening another temporary encounter instead of evicting a completed one. |
| C2/C3: closed encounters and scopes | Completed temporary encounters have a separate current-visit archive. Later ambient observations cannot evict it. Visit identity uses Core run and arrival event. Missing arrival authority does not authorize old memory. Travel/load reconciliation updates both Core flags and saved UI, including its embedded snapshot. Temporary identity markers also expire with the visit. |
| C1.10: journal versus GM memory | The readable log remains intact. Context builders receive a current-visit projection before canon/fallback/grounding builders. Native provider-bound requests are checked with a temporary marker across travel; old journal text must remain readable while that marker disappears from GM context and active flags. |
| C1.1-4: Core authority and Non-ID items | GM generic flags cannot create unscoped NPC memory, quests, registry records or Core effects. Existing Core flags are retained. Inventory-only registered items remain enforced. Non-ID items update checked narrative data; player, inventory and Party projections remain Core-owned. Emotions are directional; absent characters cannot provide new offscreen relationship updates. |
| C1.7-8: saves and travel | Legacy v3 saves without narrative metadata remain loadable and gain additive metadata after a valid turn. Native and web check exact 0.5 boundaries, four consecutive successes and nonzero-Level save/load. No new probability or destination policy was introduced. |

## Reproduce

Run the repository's normal build, followed by `test_engine.cjs`, `test_inventory_use.cjs`, `test_narrative.cjs` and `test_narrative_gate.cjs`. The Inventory QA workflow also runs existing browser, combat, UI and packaging suites. Its live-model suite exercises a fictional lamp, its recall, a Core-approved couple encounter, narrative-only Hồi Hoàn Đan rescue, and the follow-up conversation. It exports `live-narrative-review.json` for manual prose review.

`narrative_native_discovery.py` verifies original DEX hashes and exports the full original gameplay lambda, complete storage/finish methods, source hashes and checked-out commit. `native_gameplay_fixture.py` starts from the packaged fixture APK and replaces only provider transport, dice input and UI delivery for deterministic failure injection. It re-disassembles the result and proves the packaged gameplay lambda is unchanged. No fixture APK is used as a release package.

On Android 15, `NativeGameplaySmoke` executes that lambda with the original native SharedPreferencesSaveRepository and controlled SharedPreferences responses. It covers successful commit, one durable write, transport/malformed JSON/canon/preview/actor failures, callback failure, stale run, double submit, failed persistence, travel, save/load and actual provider-bound scope filtering. Its failed-commit fixture also updates SharedPreferences memory before returning false; the transaction restores the checkpoint in that case. Disk failure is injected at the API boundary, not by a physical storage fault.

## Limits

The supplied diagnostic contains HTTP 200 and the exception, but not the originating JSON. It cannot identify the exact actor or response that caused that historical failure.

These tests establish the listed state invariants and concrete prose regressions. Vietnamese reference/presence checks are deterministic language checks, not a proof that every possible model sentence is semantically correct. Live samples are reviewed separately. No physical Moto device or multi-hour real-provider session was tested.

Existing legacy flags with no provenance are preserved to avoid destroying saves. They cannot automatically be classified as old temporary-NPC data versus legitimate canon. New GM responses cannot create additional unscoped flags. Existing readable history and Core receipts are not pruned.

Final build status belongs to the checks for the current PR head, not to the historical audit or characterization run. No merge, release or deployment is performed by this verification workflow.
