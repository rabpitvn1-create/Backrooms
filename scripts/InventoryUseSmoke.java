import dalvik.system.DexClassLoader;
import java.lang.reflect.*;
import org.json.JSONObject;

/** Exercise the patched Core and shared item-use policy from the actual packaged APK. */
public final class InventoryUseSmoke {
  static void check(boolean condition, String message) {
    if (!condition) throw new AssertionError(message);
  }

  static boolean NarrativePolicyMarker(JSONObject result) {
    return result.optString("itemUseNotice").equals("Vui lòng vào kho đồ và nhấn sử dụng vật phẩm.");
  }

  public static void main(String[] args) throws Exception {
    ClassLoader loader = new DexClassLoader(args[0], "/data/local/tmp", null, InventoryUseSmoke.class.getClassLoader());
    Class<?> stateType = loader.loadClass("com.rabpit.backroom.core.GameState");
    Object companion = stateType.getField("Companion").get(null);
    final Object[] saved = { companion.getClass().getMethod("initial").invoke(companion) };
    Class<?> repositoryType = loader.loadClass("com.rabpit.backroom.core.SaveRepository");
    Object repository = Proxy.newProxyInstance(loader, new Class<?>[] { repositoryType }, (proxy, method, values) -> {
      switch (method.getName()) {
        case "load": return saved[0];
        case "save": case "saveFresh": saved[0] = values[0]; return null;
        case "exists": return true;
        case "clear": return null;
        default: throw new AssertionError(method.getName());
      }
    });
    Class<?> loggerType = loader.loadClass("com.rabpit.backroom.core.GamePipelineLogger");
    Object logger = loader.loadClass("com.rabpit.backroom.core.NoOpGamePipelineLogger").getField("INSTANCE").get(null);
    Class<?> facadeType = loader.loadClass("com.rabpit.backroom.core.GameCoreFacade");
    Object facade = facadeType.getConstructor(repositoryType, loggerType).newInstance(repository, logger);
    Class<?> policy = loader.loadClass("backrooms.InventoryUsePolicy");
    Method begin = policy.getMethod("begin", facadeType, String.class, String.class);
    Method redirect = policy.getMethod("redirect", JSONObject.class);
    Method processRule = facadeType.getMethod("processRule", String.class, String.class);
    Object original = saved[0];
    String raw = "{\"turn\":1,\"log\":[],\"inventory\":[],\"player\":{\"hp\":23},\"levelTravel\":{\"exitStreak\":3}}";
    for (String action : new String[] { "Dùng thần niệm", "Dùng ý niệm", "Quét thần thức quanh phòng", "Dùng ý niệm điều khiển ma kiếm", "Dùng thần niệm rồi uống Almond Water" }) {
      JSONObject result = new JSONObject((String)processRule.invoke(facade, raw, action));
      check(!result.getBoolean("handled"), "Text use must reach GM: " + action);
      check(saved[0] == original, "Text rules changed Core state");
    }
    begin.invoke(null, facade, raw, "Sử dụng Almond Water");
    String prompt = (String)policy.getMethod("appendPrompt", String.class).invoke(null, "GM");
    check(prompt.contains("almond-water"), "Item directory is missing");
    saved[0] = companion.getClass().getMethod("initial").invoke(companion);
    JSONObject generated = new JSONObject("{\"itemUseRequest\":{\"itemId\":\"almond-water\"},\"player\":{\"hp\":999999}}");
    JSONObject result = new JSONObject((String)redirect.invoke(null, generated));
    check(saved[0] == original, "Blocked use did not restore the exact Core state");
    check(result.getInt("turn") == 1, "Redirect consumed a turn");
    check(result.getJSONObject("player").getInt("hp") == 23, "GM applied an item effect");
    check(result.getJSONObject("levelTravel").getInt("exitStreak") == 3, "Redirect changed exit streak");
    check(result.getString("itemUseNotice").equals("Vui lòng vào kho đồ và nhấn sử dụng vật phẩm."), "Wrong Inventory notice");
    begin.invoke(null, facade, raw, "Dùng thần niệm");
    check(redirect.invoke(null, new JSONObject("{\"itemUseRequest\":null}")) == null, "Ability narration was blocked");
    policy.getMethod("complete").invoke(null);
    begin.invoke(null, facade, raw, "Sử dụng Almond Water");
    JSONObject misclassified = new JSONObject((String)redirect.invoke(null,
        new JSONObject("{\"itemUseRequest\":null,\"reply\":\"Cao Minh uống Almond Water.\"}")));
    check(NarrativePolicyMarker(misclassified), "Native inventory bypass was not stopped");
    begin.invoke(null, facade, raw, "Sử dụng Almond Water");
    try {
      redirect.invoke(null, new JSONObject("{\"itemUseRequest\":{\"itemId\":\"fake\"}}"));
      throw new AssertionError("Fabricated ID accepted");
    } catch (InvocationTargetException error) {
      check(error.getCause().getMessage().equals("item_use_id_invalid"), "Unexpected validation error");
    }
    check(saved[0] == original, "Invalid ID changed Core state");
    Class<?> narrative = loader.loadClass("backrooms.NarrativePolicy");
    Method view = narrative.getMethod("promptView", JSONObject.class);
    String sceneState = "{\"turn\":1,\"log\":[],\"levelTravel\":{\"runId\":\"test-run\",\"nodeId\":\"LEVEL.NODE.0\"},\"flags\":{\"storyContinuity\":{\"levelTravelEvents\":[{\"kind\":\"new_game\",\"nodeId\":\"LEVEL.NODE.0\",\"turnId\":\"NEW_GAME\"}]}}}";
    JSONObject beforeNarrative = new JSONObject(sceneState);
    JSONObject afterNarrative = new JSONObject(sceneState);
    JSONObject delta = new JSONObject("{\"narrativeDelta\":{\"summary\":\"Đôi vợ chồng đã được cứu.\",\"actors\":[{\"name\":\"Người vợ\",\"emotion\":\"biết ơn\"},{\"name\":\"Người chồng\",\"emotion\":\"vui mừng\"}]}}");
    JSONObject survivorRoll = new JSONObject("{\"survivor\":{\"success\":true}}");
    narrative.getMethod("apply",JSONObject.class,JSONObject.class,JSONObject.class,JSONObject.class)
        .invoke(null,afterNarrative,beforeNarrative,delta,survivorRoll);
    check(afterNarrative.getJSONObject("flags").getJSONObject("narrativeScene").getJSONArray("actors").length()==2,
        "Native narrative scene was not committed");
    JSONObject scoped = (JSONObject)view.invoke(null,afterNarrative);
    check(scoped.getJSONObject("flags").has("narrativeScene"), "Native prompt lost current Level memory");
    JSONObject traveled = new JSONObject(afterNarrative.toString());
    traveled.getJSONObject("levelTravel").put("nodeId","LEVEL.NODE.1");
    JSONObject expired = (JSONObject)view.invoke(null,traveled);
    check(!expired.getJSONObject("flags").has("narrativeScene"), "Native prompt leaked old-Level NPC memory");
    String prose = (String)narrative.getMethod("guidelines",String.class).invoke(null,"GM");
    check(prose.contains("NARRATIVE SCENE RULES"),"Native narrative instructions missing");

    // Verify native reconciliation of scoped memory in the real Core save.
    JSONObject changed = new JSONObject(afterNarrative.toString());
    changed.getJSONObject("levelTravel").put("nodeId","LEVEL.NODE.1");
    narrative.getMethod("afterTravel",JSONObject.class).invoke(null,changed);
    narrative.getMethod("persistCommitted",facadeType,JSONObject.class).invoke(null,facade,changed);
    JSONObject snapshot = new JSONObject((String)facadeType.getMethod("currentCoreState").invoke(facade));
    JSONObject world = snapshot.getJSONObject("world");
    JSONObject nativeFlags = new JSONObject(world.getString("flagsJson"));
    check(!nativeFlags.has("narrativeScene"), "Native Core save kept expired NPC memory");
    check(nativeFlags.has("narrativeSeen"), "Native Core lost One-Time identity markers");
    check(!new JSONObject(world.getString("levelTravelUi")).getJSONObject("flags").has("narrativeScene"),
        "Native UI save retained expired scene");
    // Loading the native bridge verifies the edited method's DEX register and reference types.
    loader.loadClass("com.rabpit.backroom.MainActivity$GameBridge").getDeclaredMethods();
    System.out.println("PASS: packaged Android Core routes abilities to GM and restores blocked item use without turns, effects or streak changes");
  }
}
