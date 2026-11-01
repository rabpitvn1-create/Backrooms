"""Inspect the recovered native bridge without changing any game source or bytecode."""
from pathlib import Path
import re
import shutil
import hashlib
import json
import subprocess
import inventory_use

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "build" / "native-inspect.txt"

def method(text, name):
    start = text.find(".method private synthetic " + name)
    if start == -1:
        raise RuntimeError("Missing native method: " + name)
    end = text.find(".end method", start)
    if end == -1:
        raise RuntimeError("Unterminated method: " + name)
    return text[start:end + len(".end method")]

def main():
    for name,digest in inventory_use.HASHES.items():
        if hashlib.sha256((ROOT/"apk-original"/name).read_bytes()).hexdigest()!=digest:
            raise RuntimeError("Native inspection input hash mismatch: "+name)
    inventory_use.tools()
    output = inventory_use.TOOLS / "narrative-original-classes5"
    if output.exists():
        shutil.rmtree(output)
    inventory_use.run("com.googlecode.d2j.smali.BaksmaliCmd", "-o", output, ROOT / "apk-original/classes5.dex")
    bridge = (output / "com/rabpit/backroom/MainActivity$GameBridge.smali").read_text(encoding="utf-8")
    method_name = "lambda$submitGameplayAction$2("
    gameplay = method(bridge, method_name)
    lines = gameplay.splitlines()
    parts = [
        "METHOD " + method_name + " FULL UNPATCHED SMALI",
        "\n".join(f"{i+1:04d} {line}" for i, line in enumerate(lines)),
        "\nCALLS AND LABELS",
        "\n".join(f"{i+1:04d} {line}" for i,line in enumerate(lines) if
                  line.strip().startswith((".line", ".catch", ":", "return-", "throw ", "invoke-", "move-result", "goto", "if-"))),
    ]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n\n".join(parts) + "\n", encoding="utf-8")
    print("Native inspection written to", OUT)
    travel_out=inventory_use.TOOLS / "narrative-original-classes3"
    if travel_out.exists():
        shutil.rmtree(travel_out)
    inventory_use.run("com.googlecode.d2j.smali.BaksmaliCmd", "-o", travel_out, ROOT / "apk-original/classes3.dex")
    travel=(travel_out/"com/rabpit/backroom/core/LevelTravelEngine.smali").read_text(encoding="utf-8")
    travel_start=travel.find(" resolve(")
    if travel_start>=0: travel_start=travel.rfind(".method ",0,travel_start)
    if travel_start<0: raise RuntimeError("LevelTravelEngine.resolve declaration missing")
    travel_end=travel.find(".end method",travel_start)
    extract=travel[travel_start:travel_end+len(".end method")]
    (ROOT/"build"/"native-travel-smali.txt").write_text(extract,encoding="utf-8")
    facade=(travel_out/"com/rabpit/backroom/core/GameCoreFacade.smali").read_text(encoding="utf-8")
    storage=[]
    for name in ("SaveRepository", "SharedPreferencesSaveRepository"):
        storage.append((travel_out/"com/rabpit/backroom/core"/(name+".smali")).read_text(encoding="utf-8"))
    for name in ("loadOrInitialize", "initializeLevelGame", "resumeLevelGame", "commitNamedFollowerTurn", "finishLevelTurn", "processValidatedCandidate"):
        signature=next(line for line in facade.splitlines() if line.startswith(".method ") and " "+name+"(" in line)
        start=facade.index(signature);end=facade.index(".end method",start)+len(".end method")
        storage.append(facade[start:end])
    (ROOT/"build/native-storage-inspect.txt").write_text("\n\n".join(storage),encoding="utf-8")
    provenance={"sourceCommit":subprocess.check_output(["git","rev-parse","HEAD"],cwd=ROOT,text=True).strip(),
                "originalDexHashes":inventory_use.HASHES,"inspectedGameplaySha256":hashlib.sha256(gameplay.encode()).hexdigest(),
                "sourceHashes":{}}
    for relative in ("engine/src/main/java/backrooms/InventoryUsePolicy.java", "engine/src/main/java/backrooms/NarrativePolicy.java", "pages/bridge.js", "scripts/inventory_use.py"):
        provenance["sourceHashes"][relative]=hashlib.sha256((ROOT/relative).read_bytes()).hexdigest()
    (ROOT/"build/native-inspection-provenance.json").write_text(json.dumps(provenance,indent=2),encoding="utf-8")
    labels=[line for line in facade.splitlines() if "3/3" in line or "0/3" in line or "Chuỗi" in line or "địa điểm hiện tại" in line]
    (ROOT/"build"/"native-travel-labels.txt").write_text("\\n".join(labels)+"\\n",encoding="utf-8")
    print("Travel method line count:",len(extract.splitlines()))
    print("Method line count:", len(lines))
    for i, line in enumerate(lines):
        if any(x in line for x in ("->prompt(", "->generate(", "->processValidatedCandidate(", "->finishLevelTurn(", "->emit(", "->save(", "catch", "itemUse", "return-void")):
            print(f"{i+1}: {line.strip()}")

if __name__ == "__main__":
    main()
