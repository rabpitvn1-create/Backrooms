package backrooms;
import com.rabpit.backroom.core.*;
import org.json.JSONObject;
import org.teavm.jso.JSExport;

public final class CoreBridge {
  static class MemorySave implements SaveRepository {
    GameState value;
    public void save(GameState state) {value=state;}
    public void saveFresh(GameState state) {value=state;}
    public GameState load() {return value==null?GameState.Companion.initial():value;}
    public boolean exists() {return value!=null;}
    public void clear() {value=null;}
  }
  static final android.content.Context context=new android.content.Context();
  static final NarratorLogic narrator=new NarratorLogic();
  static MemorySave repository;
  static GameCoreFacade facade;
  @JSExport public static void coreAsset(String name,String text){android.content.res.AssetManager.files.put(name,text);}
  @JSExport public static boolean coreMeta(String action){return narrator.meta(action);}
  @JSExport public static String coreItemUseBegin(String state,String action){try{InventoryUsePolicy.begin(facade,state,action);return "{}";}catch(Throwable t){return error(t);}}
  @JSExport public static void coreItemUseCancel(){InventoryUsePolicy.cancel();}
  @JSExport public static String coreRolls(String state,String action,boolean meta){try{return narrator.rolls(state,action,meta);}catch(Throwable t){return error(t);}}

  // Location-scoped keyword Canon for CR2 narration. Gameplay remains authoritative.
  private static JSONObject keyCanonRecords;
  private static boolean keyCanonLoaded;
  private static String keyCanonFor(String stateJson) {
    try {
      JSONObject state = new JSONObject(stateJson);
      JSONObject travel = state.optJSONObject("levelTravel");
      String nodeId = travel == null ? "" : travel.optString("nodeId", "");
      if (!nodeId.startsWith("LEVEL.NODE.")) {
        JSONObject level = state.optJSONObject("level");
        if (level == null) return "";
        nodeId = "LEVEL.NODE." + level.optInt("number", 0);
      }
      if (!keyCanonLoaded) {
        keyCanonLoaded = true;
        try (java.io.Reader reader = new java.io.InputStreamReader(
            context.getAssets().open("knowledge/KeyCanon.json"), java.nio.charset.StandardCharsets.UTF_8)) {
          StringBuilder data = new StringBuilder();
          char[] buffer = new char[4096];
          int length;
          while ((length = reader.read(buffer)) != -1) data.append(buffer, 0, length);
          keyCanonRecords = new JSONObject(data.toString()).optJSONObject("records");
        }
      }
      if (keyCanonRecords == null) return "";
      JSONObject entry = keyCanonRecords.optJSONObject(nodeId);
      if (entry == null) return "";
      String keywords = entry.optString("AUTHOR_CANON", "");
      if (keywords.isEmpty()) return "";
      return "\n\n[KEYCANON v1 / CURRENT LOCATION: " + nodeId + "]\nAUTHOR_CANON: " + keywords +
          "\nKEYCANON_RULES: KeyCanon là nguồn ưu tiên cho miêu tả cảnh hiện tại; hồ sơ cảnh Legacy chỉ dùng đối chiếu tương thích, không thay thế từ khóa KeyCanon. " +
          "Chỉ kể chi tiết phù hợp hành động, quan sát và state. " +
          "Nhân vật biểu tượng và dấu hiệu sinh vật không mặc nhiên tạo encounter, combat, follower hay thay đổi state. " +
          "Không tự tạo loot, exit hoặc sự kiện bắt buộc; quy tắc gameplay, HARD CANON và kết quả Core luôn ưu tiên.";
    } catch (Exception ignored) {
      // A missing or malformed optional pack must not break the existing CR2 packet.
      return "";
    }
  }
  @JSExport public static String corePrompt(String state,String action,String rolls){
    try{
      com.rabpit.backroom.core.canon.CanonOutcome result=com.rabpit.backroom.core.canon.CanonRuntime2.buildPacket(context,state,action,rolls,false);
      String packet=null;
      if(result instanceof com.rabpit.backroom.core.canon.CanonOutcome.Ready)packet=((com.rabpit.backroom.core.canon.CanonOutcome.Ready)result).getPacket();
      if(result instanceof com.rabpit.backroom.core.canon.CanonOutcome.SafeLocalResolution)throw new IllegalStateException(((com.rabpit.backroom.core.canon.CanonOutcome.SafeLocalResolution)result).getReason());
      if (packet != null) packet += keyCanonFor(state);
      return InventoryUsePolicy.appendPrompt(narrator.prompt(state,action,rolls,packet));
    }catch(Throwable t){return error(t);}
  }
  @JSExport public static String coreCandidate(String state,String generated,String rolls,String action){try{return narrator.candidate(state,generated,rolls,action);}catch(Throwable t){return error(t);}}
  private static String error(Throwable t){t.printStackTrace();return new JSONObject().put("bridgeError",t.toString()).toString();}
  @JSExport public static String coreInit(String policy, String saved) {
    try {
      repository=new MemorySave();
      if(!saved.isEmpty())repository.value=GameStateCodec.INSTANCE.decode(saved);
      facade=new GameCoreFacade(repository, NoOpGamePipelineLogger.INSTANCE,
          new LevelTravelEngine(new LevelTravelPolicy(new JSONObject(policy)), () -> Math.random()),
          () -> (int)(Math.random()*10000));
      return "{\"ok\":true}";
    } catch(Throwable t) {return error(t);}
  }
  @JSExport public static String coreCall(String name, String a, String b, String c, String d) {
    try {
      switch(name) {
        case "initializeLevelGame":return facade.initializeLevelGame(a,Boolean.parseBoolean(b));
        case "resumeLevelGame":return facade.resumeLevelGame(a,Boolean.parseBoolean(b));
        case "levelCoreSnapshot":return repository.exists()?facade.currentCoreState():"";
        case "processLevelAction":return facade.processLevelAction(a,b);
        case "finishLevelTurn":return facade.finishLevelTurn(a,b,c);
        case "processWorldPickup":return facade.processWorldPickup(a,b);
        case "processNamedFollowerRule":return facade.processNamedFollowerRule(a,b);
        case "processRule":return facade.processRule(a,b);
        case "processExplorationLoot":return facade.processExplorationLoot(a,b,c);
        case "prepareNamedFollowerTurn":return facade.prepareNamedFollowerTurn(a,b,c,d);
        case "commitNamedFollowerTurn":return facade.commitNamedFollowerTurn(a,b,c,d);
        case "processValidatedCandidate":return facade.processValidatedCandidate(a,b,c);
        case "processCombat":return facade.processCombat(a,b,c);
        case "startCombatState":return facade.startCombatState(a,b);
        case "coreStats":return facade.coreStats(a,b);
        case "processCoreUpgrade":return facade.processCoreUpgrade(a,b,c);
        case "prepareCombatDice":return facade.prepareCombatDice(a,b);
        case "setCombatDiceHold":return facade.setCombatDiceHold(a,Integer.parseInt(b),Boolean.parseBoolean(c));
        case "rerollCombatDice":return facade.rerollCombatDice(a);
        case "finishCombatDice":return facade.finishCombatDice(a);
        case "processItemAction":return facade.processItemAction(a,b);
        case "clear":facade.clear();return "{}";
        default:throw new IllegalArgumentException("Unknown core call: "+name);
      }
    }catch(Throwable t){return error(t);}
  }
}
