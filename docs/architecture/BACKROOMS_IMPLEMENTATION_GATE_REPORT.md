# BACKROOMS | Design-compliance implementation gate

Status: **BLOCKED at Step 0**. This document records a read-only investigation. It is **not** an implementation, an approval to merge, or a release.

## Authority and provenance

- Required design: user-supplied `ARCHITECTURE_AUDIT.md` (SHA-256 `66401a89bb05d82a8a65693a517c4bc744835c53bad04bee2885ccdc5dab22db`).
- Evidence package: user-supplied `backrooms-architecture-audit-evidence.zip`; its `SHA256SUMS.txt` verified successfully against extracted files.
- Historical source used by the package: commit `77ef6c3a1b17ca3353ad72429c25863c2c666f73`, artifact `13078289052`. The package does **not** represent the present `main` branch.
- Prior observed repository code paths: `pages/bridge.js`, `engine/src/main/java/backrooms/{CoreBridge,NarratorLogic,NarrativePolicy,InventoryUsePolicy}.java`, `scripts/{inventory_use,debug_release,prepare_web_engine}.py`, and the related CI workflows. They must be checked again against the precise target SHA before further product changes.

## Evidence reproduced in this investigation

- All 12 provided Core probes executed without harness errors on the historical baseline (Node 22). This does **not** mean all 12 product invariants passed.
- P05: rejected narration left an extra `medical:bandage` and Core receipt/metadata despite unchanged UI turn. Result: FAIL_CONFIRMED **for the historical baseline**.
- P02 and P12: stale or derived NPC memory can leak into a subsequent level's prompt. Result: FAIL for the historical baseline.
- P06: historical prompt prohibited some player-created Non-ID item effects. Result: PROMPT_CONFLICT_CONFIRMED for the historical baseline.
- P01, P03, P04, P08, P11: their specific baseline checks held. No conclusion about current production follows automatically.
- The new user diagnostic indicates Gemini HTTP 200 followed by `narrative_canon_actor_not_present`. It does not include the originating model's JSON, so the exact actor cannot be established.

## Required Step 0 gate before a production change

All items below must be evidenced against **one pinned, up-to-date repository SHA and its built APK**.

1. Retrieve the exact original DEX and compare hashes to the repository's pinned hashes.
2. Disassemble and inspect the **entire native** `MainActivity$GameBridge.lambda$submitGameplayAction$2`, including exception table, early returns, prompt construction, state restoration, and save callbacks.
3. Inspect native `SaveRepository` implementations, `GameCoreFacade.finishLevelTurn`, the prompt builders, and their call sites; establish exactly when authoritative Core is saved versus when the UI is notified.
4. Verify that scoped narrative context is applied **before every** native context/canon builder, not merely appended as a prompt instruction afterward.
5. Verify a single transaction owner for web and native; stage data until final acceptance, rollback all staged effects on failure, and distinguish callback/render failures after commit.
6. Compare real web and Android runtime behavior for the 4-streak / 50-50 travel rule, Level 0 start, save/load, and locally handled / combat paths.
7. Run failure injection for invalid canon, malformed JSON, missing entity preview, invalid actor metadata, stale responses, double submits, and persistence failure. Compare UI state **and exact Core snapshot**; no ghost item, receipt, loot roll, NPC memory, or streak increment may survive a rejected turn.
8. Record log evidence with a reproducible test command and resulting commit. CI green alone does not satisfy this gate.

## Design-preserving next implementation steps (ONLY AFTER Gate 0)

1. Repair transaction boundaries in `InventoryUsePolicy`, `CoreBridge`, browser bridge, and verified native smali hooks. Preserve all existing public interfaces and old saves.
2. Reconcile bounded narrative metadata in existing Core `flags` without creating a new database or letting the AI replace Core-owned data.
3. Scope temporary encounters to Core-authoritative visit identifiers, preventing both direct and derived memory leaks after exit or return to the same node.
4. Permit legitimate One-Time NPC narration, directional emotion, tragedy, and narrative-only Non-ID items without creating Core inventory, party, stats, combat, loot, or travel outcomes.
5. Verify web/APK parity and compile/sign/run the actual Android package; perform adversarial and real-model evaluation separately.
6. Provide save rollback/recovery evidence before activation. Do not merge or deploy before all applicable acceptance criteria pass.

## Immediate architectural finding concerning the open absent-actor patch

The targeted change `if (!canonId.isEmpty() && !present(before, canonId)) continue;` in PR #10 avoids one known exception, but on its own does not establish that the narrative text is canon-safe. Preserve Core presence/Party restrictions while validating narration and optional actor metadata as separate data classes. Specifically test a prose response that describes an actual reunion despite a failed Core encounter roll; passing metadata-only tests is insufficient.

## Blocker and operational limits

During this turn, the live GitHub connector returned `TimeoutError` and the container could not resolve `github.com` via Git. GitHub web retrieval was also unavailable for this repository. The native DEX and current source tree were not available locally. No current-source compilation, native disassembly, Android runtime test, CI dispatch, Git commit, pull request update, merge, release, or Pages deployment was performed in this turn.

**Verdict:** NOT READY TO IMPLEMENT / MERGE / DEPLOY UNDER THE USER'S 100%-CONFORMANCE RULE. The safest design-compliant action is to leave production and existing pull requests unchanged until the Step 0 evidence can be completed.
