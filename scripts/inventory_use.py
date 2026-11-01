"""Apply reviewed text patches to recovered bytecode, leaving APK originals immutable."""
from pathlib import Path
from zipfile import ZipFile
import hashlib
import shutil
import struct
import subprocess
import urllib.request
import zlib

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / "build/web-engine-tools"
HASHES = {
    "classes3.dex": "6db710987a94854a30fc4a9e51796d652d0bfc2171c94033abd2193d80d2b132",
    "classes5.dex": "bd48603b3f302a7d39b4fcfe5a239612846b3251c40723ea9793a2ed074da5f5",
}
FACADE = "Lcom/rabpit/backroom/core/GameCoreFacade;"
POLICY = "Lbackrooms/InventoryUsePolicy;"
NARRATIVE = "Lbackrooms/NarrativePolicy;"


def run(main, *args):
    subprocess.run(["java", "-cp", str(TOOLS / "dex-tools-v2.4/lib/*"), main, *map(str, args)], check=True)


def tools():
    TOOLS.mkdir(parents=True, exist_ok=True)
    archive = TOOLS / "dex-tools.zip"
    if not archive.exists():
        urllib.request.urlretrieve("https://github.com/pxb1988/dex2jar/releases/download/v2.4/dex-tools-v2.4.zip", archive)
    if hashlib.sha256(archive.read_bytes()).hexdigest() != "ee7c45eb3c1d2474a6145d8d447e651a736a22d9664b6d3d3be5a5a817dda23a":
        raise ValueError("Unexpected dex2jar tools archive")
    if not (TOOLS / "dex-tools-v2.4/lib/dex-tools-v2.4.jar").exists():
        with ZipFile(archive) as z:
            z.extractall(TOOLS)


def replace_once(text, old, new):
    if text.count(old) != 1:
        raise ValueError("Recovered instruction changed: " + old[:100])
    return text.replace(old, new, 1)


def patch_facade(text):
    # Keep the native narrative labels in sync with the patched 4/50 travel Core.
    messages = [
        ("Thoát thành công 3/3. Cao Minh đã đến một nơi mới, chưa xác định danh tính. Chuỗi thoát mới: 0/3.",
         "Thoát thành công 4/4. Cao Minh đã no-clip sang một nơi mới, chưa xác định danh tính. Chuỗi thoát mới: 0/4."),
        ("/3. Cao Minh vẫn ở địa điểm hiện tại.", "/4. Cao Minh vẫn ở địa điểm hiện tại."),
        ("Lần thử thoát thất bại. Chuỗi trở về 0/3; Cao Minh vẫn ở địa điểm hiện tại.",
         "Lần thử thoát thất bại. Chuỗi trở về 0/4; Cao Minh vẫn ở địa điểm hiện tại."),
        ("Không gian quanh Cao Minh đột ngột lệch khỏi vị trí cũ. Hắn đã sang một nơi khác, chưa xác định danh tính.",
         "Không gian quanh Cao Minh đột ngột lệch khỏi vị trí cũ. Hắn đã no-clip sang một nơi khác, chưa xác định danh tính."),
    ]
    # Baksmali escapes Unicode as \\uXXXX even when the original Java string does not.
    def smali_text(value):
        return "".join(chr(92) + ("u%04x" % ord(char)) if ord(char) > 127 else char for char in value)
    for old, new in messages:
        text = replace_once(text, smali_text(old), smali_text(new))
    for name in ("processRule", "processNamedFollowerRule"):
        signature = f".method public final {name}(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;"
        text = replace_once(text, signature, signature.replace(name, name + "InventoryLegacy"))
        text += f"""
.method public final {name}(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;
  .registers 4
    invoke-static {{ p2 }}, {POLICY}->needsNarration(Ljava/lang/String;)Z
    move-result v0
    if-eqz v0, :legacy
    invoke-static {{ p1 }}, {POLICY}->fallback(Ljava/lang/String;)Ljava/lang/String;
    move-result-object v0
    return-object v0
  :legacy
    invoke-virtual {{ p0, p1, p2 }}, {FACADE}->{name}InventoryLegacy(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;
    move-result-object v0
    return-object v0
.end method
"""
    text += f"""
.method public final inventoryUseCheckpoint()Lcom/rabpit/backroom/core/GameState;
  .registers 2
    iget-object v0, p0, {FACADE}->repository:Lcom/rabpit/backroom/core/SaveRepository;
    invoke-interface {{ v0 }}, Lcom/rabpit/backroom/core/SaveRepository;->load()Lcom/rabpit/backroom/core/GameState;
    move-result-object v0
    return-object v0
.end method

.method public final restoreInventoryUse(Lcom/rabpit/backroom/core/GameState;)V
  .registers 3
    iget-object v0, p0, {FACADE}->repository:Lcom/rabpit/backroom/core/SaveRepository;
    invoke-interface {{ v0, p1 }}, Lcom/rabpit/backroom/core/SaveRepository;->save(Lcom/rabpit/backroom/core/GameState;)V
    const/4 v0, 0
    iput-object v0, p0, {FACADE}->preparedNamedTurn:Lcom/rabpit/backroom/core/GameCoreFacade$PreparedNamedTurn;
    return-void
.end method
"""
    return text


def patch_bridge(text):
    start = text.index(".method private synthetic lambda$submitGameplayAction$2(")
    end = text.index(".end method", start)
    body = text[start:end]
    # Two scratch registers keep the original state while constructing a scoped prompt.
    # The prompt builder uses low register v11; high registers are only used by move/from16.
    body = replace_once(body, ".registers 53", ".registers 55")
    marker = "  :L23\n  .line 1092"
    body = replace_once(body, marker, marker +
        f"\n    invoke-static {{ v11 }}, {NARRATIVE}->promptView(Lorg/json/JSONObject;)Lorg/json/JSONObject;\n"
        "    move-result-object v49\n"
        "    move-object/from16 v50, v11\n"
        "    move-object/from16 v11, v49")
    # Restore the real state before receiving and committing the generated candidate.
    body = replace_once(body, '  .line 1187\n  .local v0, "generated":Lorg/json/JSONObject;',
        '  .line 1187\n  .local v0, "generated":Lorg/json/JSONObject;\n'
        '    move-object/from16 v11, v50')
    call = f"    invoke-virtual {{ v10, v11, v3 }}, {FACADE}->processLevelAction(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;"
    body = replace_once(body, call,
        f"    invoke-static {{ v10, v11, v3 }}, {POLICY}->begin({FACADE}Ljava/lang/String;Ljava/lang/String;)V\n" + call)
    marker = "  .line 1185\n    iget-object v7, v1, Lcom/rabpit/backroom/MainActivity$GameBridge;->this$0:Lcom/rabpit/backroom/MainActivity;"
    body = replace_once(body, marker,
        f"    invoke-static {{ v2 }}, {NARRATIVE}->guidelines(Ljava/lang/String;)Ljava/lang/String;\n"
        "    move-result-object v2\n"
        f"    invoke-static {{ v2 }}, {POLICY}->appendPrompt(Ljava/lang/String;)Ljava/lang/String;\n"
        "    move-result-object v2\n" + marker)
    marker = "  .line 1187\n  .local v0, \"generated\":Lorg/json/JSONObject;"
    body = replace_once(body, marker, marker + f"""
    invoke-static {{ v0 }}, {POLICY}->redirect(Lorg/json/JSONObject;)Ljava/lang/String;
    move-result-object v7
    if-eqz v7, :inventory_use_continue
    iget-object v8, v1, Lcom/rabpit/backroom/MainActivity$GameBridge;->this$0:Lcom/rabpit/backroom/MainActivity;
    const-string v13, "backroomTurn"
    invoke-static {{ v8, v13, v7 }}, Lcom/rabpit/backroom/MainActivity;->\\u002d$$Nest$memit(Lcom/rabpit/backroom/MainActivity;Ljava/lang/String;Ljava/lang/String;)V
    return-void
  :inventory_use_continue
""")
    # Validated narrative state is written before the authoritative Core commit.
    body = replace_once(body, "  .line 1230\n    if-nez v30, :L81",
        f"  .line 1230\n    invoke-static {{ v5, v11, v0, v9 }}, {NARRATIVE}->apply(Lorg/json/JSONObject;Lorg/json/JSONObject;Lorg/json/JSONObject;Lorg/json/JSONObject;)V\n"
        "    if-nez v30, :L81")
    body = replace_once(body, "  .line 1252\n",
        f"  .line 1252\n    invoke-static {{ v5 }}, {NARRATIVE}->afterTravel(Lorg/json/JSONObject;)Lorg/json/JSONObject;\n"
        "    move-result-object v5\n")
    # The named-follower branch already has this guard; match its behavior for local rules.
    marker = '  .local v0, "localState":Lorg/json/JSONObject;'
    body = replace_once(body, marker, marker + """
    const-string v5, "error"
    invoke-virtual { v9, v5 }, Lorg/json/JSONObject;->has(Ljava/lang/String;)Z
    move-result v5
    if-nez v5, :inventory_use_local_error
""")
    marker = "  .line 1059\n    iget-object v5, v1, Lcom/rabpit/backroom/MainActivity$GameBridge;->this$0:Lcom/rabpit/backroom/MainActivity;"
    body = replace_once(body, marker, "  :inventory_use_local_error\n" + marker)
    marker = '  .line 1254\n  .local v0, "e":Ljava/lang/Exception;'
    body = replace_once(body, marker, marker + f"\n    invoke-static {{ }}, {POLICY}->cancel()V")
    # The checkpoint must survive all post-classification checks. Every normal
    # method return ends the transaction; the exception handler cancels first.
    completion = "    invoke-static { }, " + POLICY + "->complete()V\n"
    body = body.replace("    return-void", completion + "    return-void")
    return text[:start] + body + text[end:]


def patch_native_travel(text):
    """Match the original LevelTravelEngine.resolve bytecode, never blind replace."""
    sig = ".method private final resolve("
    start = text.index(sig)
    end = text.index(".end method", start)
    body = text[start:end]
    required = [
        ("const/4 v2, 3", "const/4 v2, 4"),
        ("const/4 v4, 3", "const/4 v4, 4"),
        ("const-wide v20, 4600877379321698714L", "const-wide v20, 4602678819172646912L"),
        ("const/16 v4, 40", "const/16 v4, 50"),
        ("const/16 v4, 60", "const/16 v4, 50"),
    ]
    for old, new in required:
        body = replace_once(body, old, new)
    return text[:start] + body + text[end:]


def patched_dex(name, source=None):
    tools()
    original = ROOT / "apk-original" / name
    if hashlib.sha256(original.read_bytes()).hexdigest() != HASHES[name]:
        raise ValueError("Recovered DEX changed: " + name)
    source = original if source is None else source
    work = TOOLS / (name + "-inventory")
    if work.exists():
        shutil.rmtree(work)
    run("com.googlecode.d2j.smali.BaksmaliCmd", "-o", work, source)
    relative, patcher = (("com/rabpit/backroom/core/GameCoreFacade.smali", patch_facade)
                         if name == "classes3.dex" else
                         ("com/rabpit/backroom/MainActivity$GameBridge.smali", patch_bridge))
    path = work / relative
    path.write_text(patcher(path.read_text()), encoding="utf-8")
    if name == "classes3.dex":
        travel = work / "com/rabpit/backroom/core/LevelTravelEngine.smali"
        travel.write_text(patch_native_travel(travel.read_text(encoding="utf-8")), encoding="utf-8")
    output = TOOLS / (name + "-inventory.dex")
    output.unlink(missing_ok=True)
    run("com.googlecode.d2j.smali.SmaliCmd", "-o", output, work)
    if not output.read_bytes().startswith(b"dex\n"):
        raise ValueError("Patched DEX was not assembled: " + name)
    # dex2jar's assembler defaults to DEX 035; the recovered interfaces need their original version.
    data = bytearray(output.read_bytes())
    data[:8] = original.read_bytes()[:8]
    data[12:32] = hashlib.sha1(data[32:]).digest()
    struct.pack_into("<I", data, 8, zlib.adler32(data[12:]) & 0xffffffff)
    output.write_bytes(data)
    return output


def helper_dex(core_dex):
    tools()
    jar = TOOLS / "inventory-core.jar"
    run("com.googlecode.dex2jar.tools.Dex2jarCmd", core_dex, "-o", jar, "--force")
    dependencies = []
    for name, url, digest in [
        ("json.jar", "org/json/json/20240303/json-20240303.jar", "3cf6cd6892e32e2b4c1c39e0f52f5248a2f5b37646fdfbb79a66b46b618414ed"),
        ("kotlin.jar", "org/jetbrains/kotlin/kotlin-stdlib/2.3.0/kotlin-stdlib-2.3.0.jar", "887587c91713250ad52fe14ad9166d042c33835049890e9437f355ffc5a195b1")]:
        path = TOOLS / name
        if not path.exists():
            urllib.request.urlretrieve("https://repo.maven.apache.org/maven2/" + url, path)
        if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            raise ValueError("Unexpected existing runtime dependency: " + name)
        dependencies.append(str(path))
    classes = TOOLS / "inventory-policy-classes"
    classes.mkdir(exist_ok=True)
    subprocess.run(["java", "com.sun.tools.javac.Main", "-source", "8", "-target", "8", "-encoding", "UTF-8",
                    "-cp", ":".join([str(jar), *dependencies]), "-d", str(classes),
                    str(ROOT / "engine/src/main/java/backrooms/InventoryUsePolicy.java"),
                    str(ROOT / "engine/src/main/java/backrooms/NarrativePolicy.java")], check=True)
    output = TOOLS / "inventory-policy.dex"
    policy_jar = TOOLS / "inventory-policy.jar"
    with ZipFile(policy_jar, "w") as archive:
        for path in classes.rglob("*.class"):
            archive.write(path, path.relative_to(classes).as_posix())
    output.unlink(missing_ok=True)
    run("com.android.dx.command.Main", "--dex", "--output=" + str(output), policy_jar)
    if not output.read_bytes().startswith(b"dex\n"):
        raise ValueError("Inventory policy DEX was not compiled")
    return output
