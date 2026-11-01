"""Build a disposable native test APK; never modify the release package.

Only provider transport, dice input and UI delivery are replaced. The packaged
GameBridge lambda, all context builders, validators and persistence stay intact.
"""
from pathlib import Path
from zipfile import ZipFile
import hashlib
import json
import shutil
import struct
import subprocess
import zlib
import inventory_use as patch


def method(text, signature):
    start = text.index(signature)
    end = text.index(".end method", start) + len(".end method")
    return text[start:end]


def build():
    source = patch.ROOT / "build/Backrooms-1.0.0.2-debug-unsigned.apk"
    work = patch.TOOLS / "native-gameplay-fixture"
    if work.exists():
        shutil.rmtree(work)
    with ZipFile(source) as apk:
        original = apk.read("classes5.dex")
    dex = patch.TOOLS / "native-gameplay-input.dex"
    dex.write_bytes(original)
    patch.run("com.googlecode.d2j.smali.BaksmaliCmd", "-o", work, dex)
    activity = work / "com/rabpit/backroom/MainActivity.smali"
    text = activity.read_text()
    signatures = {
        ".method private generateTextForTurn(Ljava/lang/String;I)Ljava/lang/String;":
            "  .registers 4\n    invoke-static { p1 }, LNativeGameplaySmoke;->generate(Ljava/lang/String;)Ljava/lang/String;\n    move-result-object v0\n    return-object v0\n",
        ".method private emit(Ljava/lang/String;Ljava/lang/String;)V":
            "  .registers 3\n    invoke-static { p1, p2 }, LNativeGameplaySmoke;->emit(Ljava/lang/String;Ljava/lang/String;)V\n    return-void\n",
        ".method private makeGameplayRolls(Lorg/json/JSONObject;Ljava/lang/String;Z)Lorg/json/JSONObject;":
            "  .registers 5\n    invoke-static { p1, p3 }, LNativeGameplaySmoke;->rolls(Lorg/json/JSONObject;Z)Lorg/json/JSONObject;\n    move-result-object v0\n    return-object v0\n",
    }
    preserved = []
    for signature, body in signatures.items():
        old = method(text, signature)
        preserved.append(hashlib.sha256(old.encode()).hexdigest())
        text = patch.replace_once(text, old, signature + "\n" + body + ".end method")
    activity.write_text(text)
    bridge = work / "com/rabpit/backroom/MainActivity$GameBridge.smali"
    gameplay = method(bridge.read_text(), ".method private synthetic lambda$submitGameplayAction$2(")
    output = patch.TOOLS / "native-gameplay-fixture.dex"
    patch.run("com.googlecode.d2j.smali.SmaliCmd", "-o", output, work)
    data = bytearray(output.read_bytes())
    data[:8] = original[:8]
    data[12:32] = hashlib.sha1(data[32:]).digest()
    struct.pack_into("<I", data, 8, zlib.adler32(data[12:]) & 0xffffffff)
    output.write_bytes(data)
    # Re-disassemble and prove the gameplay method itself was not replaced.
    checked = patch.TOOLS / "native-gameplay-roundtrip"
    if checked.exists():
        shutil.rmtree(checked)
    patch.run("com.googlecode.d2j.smali.BaksmaliCmd", "-o", checked, output)
    roundtrip = method((checked / bridge.relative_to(work)).read_text(),
                       ".method private synthetic lambda$submitGameplayAction$2(")
    assert gameplay == roundtrip, "Test fixture changed the native gameplay pipeline"
    target = patch.ROOT / "build/native-gameplay-fixture.apk"
    with ZipFile(source) as original_apk, ZipFile(target, "w") as fixture:
        for entry in original_apk.infolist():
            fixture.writestr(entry, output.read_bytes() if entry.filename == "classes5.dex"
                             else original_apk.read(entry.filename))
        initial = subprocess.check_output(["node", "-e", "const fs=require('fs'),vm=require('vm'); const h=fs.readFileSync('web/index.html','utf8'); process.stdout.write(JSON.stringify(vm.runInNewContext(h.slice(h.indexOf('const prologue'),h.indexOf('const byId'))+'; initial')));"], cwd=patch.ROOT)
        fixture.writestr("assets/qa-initial.json", initial)
    evidence = {
        "sourceApkSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "sourceClasses5Sha256": hashlib.sha256(original).hexdigest(),
        "unchangedGameplayMethodSha256": hashlib.sha256(gameplay.encode()).hexdigest(),
        "replacedBoundaryMethods": list(signatures),
        "boundaryMethodHashes": preserved,
        "limits": "Controlled provider/dice/UI boundaries; not a physical-device UI test.",
    }
    (patch.ROOT / "build/native-gameplay-provenance.json").write_text(json.dumps(evidence, indent=2))
    print("Disposable native pipeline fixture:", target)


if __name__ == "__main__":
    build()
