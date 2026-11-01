"""Inspect the recovered native bridge without changing any game source or bytecode."""
from pathlib import Path
import re
import shutil
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
    travel_start=travel.find(".method public final resolve(")
    if travel_start<0: raise RuntimeError("LevelTravelEngine.resolve declaration missing")
    travel_end=travel.find(".end method",travel_start)
    extract=travel[travel_start:travel_end+len(".end method")]
    (ROOT/"build"/"native-travel-smali.txt").write_text(extract,encoding="utf-8")
    print("Travel method line count:",len(extract.splitlines()))
    print("Method line count:", len(lines))
    for i, line in enumerate(lines):
        if any(x in line for x in ("->prompt(", "->generate(", "->processValidatedCandidate(", "->finishLevelTurn(", "->emit(", "->save(", "catch", "itemUse", "return-void")):
            print(f"{i+1}: {line.strip()}")

if __name__ == "__main__":
    main()
