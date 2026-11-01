package backrooms;

import com.rabpit.backroom.core.*;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/** The serial gameplay pipeline stages narration; only Inventory may execute item use. */
public final class InventoryUsePolicy {
  public static final String NOTICE = "Vui lòng vào kho đồ và nhấn sử dụng vật phẩm.";
  private static GameCoreFacade owner;
  private static GameState checkpoint;
  private static SaveRepository repository;
  private static GameState staged;
  private static boolean committed;
  private static String original, action;
  private static JSONObject items = new JSONObject();

  public static boolean needsNarration(String text) {
    String value = text.toLowerCase(Locale.ROOT);
    if (value.contains("nhẫn") || value.contains("giới chỉ") || value.contains("omnivault")) return true;
    for (String verb : new String[] {"dùng", "sử dụng", "uống", "ăn", "quét", "scan", "copy", "sao chép", "nhân bản", "tạo thêm", "tạo ra thêm", "nhân thêm", "hoàn nguyên", "khôi phục vật", "restore"}) {
      int offset = -1;
      while ((offset = value.indexOf(verb, offset + 1)) >= 0) {
        int end = offset + verb.length();
        if ((offset == 0 || !Character.isLetterOrDigit(value.charAt(offset - 1))) &&
            (end == value.length() || !Character.isLetterOrDigit(value.charAt(end)))) return true;
      }
    }
    return false;
  }

  public static String fallback(String raw) {
    return new JSONObject().put("handled", false).put("state", new JSONObject(raw))
        .put("reason", "inventory_use_requires_gm").toString();
  }

  public static void begin(GameCoreFacade facade, String raw, String input) {
    if (owner != null) throw new IllegalStateException("turn_already_pending");
    committed = false;
    GameState saved = facade.inventoryUseCheckpoint();
    JSONObject before = new JSONObject(raw);
    String travelJson = saved.getWorld().get("levelTravel");
    if (travelJson != null) {
      JSONObject travel = new JSONObject(travelJson), expected = before.optJSONObject("levelTravel");
      if (expected == null || !travel.optString("runId").equals(expected.optString("runId")) ||
          travel.optInt("revision") != expected.optInt("revision") ||
          !Integer.toString(before.optInt("turn",1)).equals(saved.getWorld().get("levelTravelUiTurn")))
        throw new IllegalStateException("stale_level_turn");
    }
    before.remove("itemUseNotice");
    owner = facade;
    checkpoint = staged = saved;
    repository = facade.inventoryUseRepository();
    original = before.toString();
    action = input;
    items = directory(checkpoint);
  }

  // All facade reads/writes share one staged Core state until the host accepts it.
  public static GameState load(SaveRepository target) {
    return target == repository ? staged : target.load();
  }

  public static void save(SaveRepository target, GameState state) {
    if (target == repository) staged = state;
    else target.save(state);
  }

  public static void clearRepository(SaveRepository target) {
    if (target == repository) clear();
    target.clear();
  }

  private static JSONObject directory(GameState state) {
    JSONObject result = new JSONObject().put("almond-water", "Almond Water");
    for (LootItemCatalog.Definition item : LootItemCatalog.INSTANCE.getDroppable())
      result.put(item.getId(), item.getName());
    for (LootItemCatalog.Definition item : new LootItemCatalog.Definition[] {
        LootItemCatalog.INSTANCE.getBandage(), LootItemCatalog.INSTANCE.getAntiseptic(),
        LootItemCatalog.INSTANCE.getFoodRation()}) result.put(item.getId(), item.getName());
    for (InventoryState inventory : state.getInventories().values())
      for (ItemStack item : inventory.getItems().values()) result.put(item.getItemId(), item.getName());
    for (ItemStack item : state.getVanKhoGioiChi().getStoredItems().values())
      result.put(item.getItemId(), item.getName());
    return result;
  }

  public static String appendPrompt(String prompt) {
    return prompt + "\n[INVENTORY USE ONLY]\n" +
        "Mọi JSON trả về BẮT BUỘC có itemUseRequest: null hoặc {\"itemId\":\"ID chính xác trong ITEM_DIRECTORY\"}. " +
        "Nếu người chơi yêu cầu sử dụng, ăn, uống, kích hoạt vật phẩm hoặc nhờ người khác dùng vật phẩm, kể cả lệnh ghép hay diễn đạt gián tiếp, " +
        "đặt itemUseRequest với ID có thật. Chỉ nhận diện ý định, không thực hiện, không kể đã dùng thành công, không áp dụng hiệu ứng hoặc thay đổi state. " +
        "Vật phẩm có ID không có nghĩa là đang sở hữu. Không tự tạo ID. Khi người chơi tự sáng tác vật phẩm không khớp ITEM_DIRECTORY, đặt itemUseRequest:null và chỉ kể hiệu ứng trong cảnh truyện, không tự cấp item, đổi HP/EXP, combat, loot, party hoặc travel trong Core. " +
        "Nhắc tên, quan sát, hỏi thông tin, câu phủ định và trích dẫn không phải yêu cầu dùng vật phẩm. " +
        "Thần niệm, ý niệm, thần thức, mắt và tay không phải vật phẩm. Việc điều khiển hay chiến đấu bằng vũ khí đang trang bị không phải thao tác tiêu dùng trong kho. " +
        "Các hành động đó đặt itemUseRequest:null và kể theo canon cùng kết quả Core. " +
        "Không tự dùng trang bị hoặc vật phẩm để giải quyết hộ người chơi.\nITEM_DIRECTORY: " + items + "\n";
  }


  // Only deterministic, affirmative uses of known registered items are intercepted.
  // The AI's itemUseRequest classification is not an authorization boundary.
  private static int lastVerb(String text, String[] verbs) {
    int result = -1;
    for (String verb : verbs) {
      int offset = text.lastIndexOf(verb);
      if (offset >= 0 && (offset == 0 || !Character.isLetterOrDigit(text.charAt(offset - 1)))
          && (offset + verb.length() == text.length()
              || !Character.isLetterOrDigit(text.charAt(offset + verb.length()))))
        result = Math.max(result, offset);
    }
    return result;
  }

  private static boolean itemWordAt(String text, String term, int at) {
    return at >= 0 && (at == 0 || !Character.isLetterOrDigit(text.charAt(at - 1)))
        && (at + term.length() >= text.length()
            || !Character.isLetterOrDigit(text.charAt(at + term.length())));
  }

  // The player may put an item first, followed by the instruction:
  // "Almond Water, uống ngay". The AI alone must not be able to misclassify it.
  private static boolean postfixedUse(String text, int itemEnd) {
    String suffix = text.substring(itemEnd, Math.min(text.length(), itemEnd+90)).trim();
    while (!suffix.isEmpty() && ",:;".indexOf(suffix.charAt(0))>=0)
      suffix=suffix.substring(1).trim();
    for (String subject : new String[] {"cao minh ", "hắn ", "ta ", "anh ta ", "cô ấy "})
      if (suffix.startsWith(subject)){suffix=suffix.substring(subject.length()).trim();break;}
    for (String verb : new String[] {"sử dụng", "dùng", "uống", "ăn", "bôi", "kích hoạt", "use", "drink", "consume"}) {
      if (!suffix.startsWith(verb)||!itemWordAt(suffix,verb,0))continue;
      String remaining=suffix.substring(verb.length()).trim();
      if (remaining.contains("?")||remaining.startsWith("được không")||
          remaining.startsWith("như thế nào")||remaining.startsWith("thế nào")||
          remaining.startsWith("ra sao")||remaining.startsWith("để làm gì")||
          remaining.startsWith("cách nào")||remaining.startsWith("gì"))
        continue;
      return true;
    }
    return false;
  }

  // Check the surrounding clause, not just the word immediately before "use".
  // Negated actions and questions must reach GM rather than consume Inventory turns.
  private static boolean nonUseContext(String text, int itemEnd, String prefix) {
    String suffix = text.substring(itemEnd, Math.min(text.length(), itemEnd + 90)).trim();
    while (!suffix.isEmpty() && ",;:".indexOf(suffix.charAt(0)) >= 0)
      suffix = suffix.substring(1).trim();
    if (suffix.startsWith("?") || suffix.startsWith("được không") ||
        suffix.startsWith("có được không") || suffix.startsWith("hay không") ||
        suffix.startsWith("thế nào") || suffix.startsWith("như thế nào"))
      return true;
    int boundary = -1;
    for (char mark : new char[] {'.', ',', ';', '!', '?', '\n'})
      boundary = Math.max(boundary, prefix.lastIndexOf(mark));
    String clause = prefix.substring(boundary + 1).trim();
    if (clause.matches("(?s).*(?:không|chưa|chẳng|đừng|tránh|từ chối|cấm|ngừng|khỏi)(?:\\s+\\S+){0,6}\\s*$"))
      return true;
    return clause.matches("(?s).*(?:hỏi|liệu|thắc mắc|có nên|có thể|hướng dẫn|cách|làm sao|muốn biết)(?:\\s+\\S+){0,7}\\s*$");
  }

  private static String registeredUse(String input) {
    if (input == null || items.length() == 0) return "";
    String text = input.toLowerCase(Locale.ROOT)
        .replaceAll("“[^”]*”|\\\"[^\\\"]*\\\"|‘[^’]*’|'[^']*'", " ");
    String[] uses = {"sử dụng", "dùng", "uống", "ăn", "tu", "cho", "bôi", "kích hoạt", "use", "drink", "consume"};
    String[] observations = {"nhìn", "quan sát", "xem", "hỏi", "nói", "nhắc", "thấy", "mở", "có", "đọc", "tìm"};
    java.util.Iterator<String> keys = items.keys();
    while (keys.hasNext()) {
      String id = keys.next();
      String[] names = "almond-water".equals(id)
          ? new String[] {id, items.optString(id).toLowerCase(Locale.ROOT), "nước hạnh nhân"}
          : new String[] {id.toLowerCase(Locale.ROOT), items.optString(id).toLowerCase(Locale.ROOT)};
      for (String name : names) {
        if (name.isEmpty()) continue;
        int at = -1;
        while ((at = text.indexOf(name, at + 1)) >= 0) {
          if (!itemWordAt(text, name, at)) continue;
          if (postfixedUse(text,at+name.length())) return id;
          String prefix = text.substring(Math.max(0, at - 100), at);
          int use = lastVerb(prefix, uses), observation = lastVerb(prefix, observations);
          if (use < 0 || use < observation || nonUseContext(text, at+name.length(), prefix)) continue;
          // Questions about an item are not requests to consume it.
          if (prefix.matches("(?s).*(?:cách|hướng dẫn|làm sao để)\\s+(?:dùng|sử dụng|uống|ăn)\\s*$"))
            continue;
          // "Cho rằng" expresses an opinion, not an item transfer.
          if (prefix.trim().endsWith("cho rằng")) continue;
          String beforeUse = prefix.substring(Math.max(0, use - 24), use).trim();
          if (beforeUse.matches("(?s).*(?:không(?:\\s+hề)?|chưa(?:\\s+từng)?|đừng|chẳng)\\s*$"))
            continue;
          return id;
        }
      }
    }
    return "";
  }

  private static String inventoryNotice() {
    JSONObject state = new JSONObject(original);
    cancel();
    JSONArray log = state.optJSONArray("log");
    if (log == null) log = new JSONArray();
    log.put(new JSONObject().put("role", "player").put("text", action));
    log.put(new JSONObject().put("role", "gm").put("text", NOTICE));
    return state.put("log", log).put("itemUseNotice", NOTICE).toString();
  }

  public static String redirect(JSONObject generated) {
    if (owner == null) throw new IllegalStateException("item_use_checkpoint_missing");
    try {
      if (!generated.has("itemUseRequest")) throw new IllegalStateException("item_use_classification_missing");
      if (generated.isNull("itemUseRequest")) {
        if (!registeredUse(action).isEmpty()) return inventoryNotice();
        if (!registeredUse(generated.optString("reply", "")).isEmpty() ||
            !registeredUse(generated.optString("entityPreview", "")).isEmpty())
          throw new IllegalStateException("item_use_narrative_conflict");
        JSONObject narrative=generated.optJSONObject("narrativeDelta");
        if(narrative!=null && !registeredUse(narrative.optString("summary","")).isEmpty())
          throw new IllegalStateException("item_use_narrative_conflict");
        return null;
      }
      JSONObject request = generated.optJSONObject("itemUseRequest");
      String id = request == null ? "" : request.optString("itemId", "");
      if (!items.has(id)) throw new IllegalStateException("item_use_id_invalid");
      return inventoryNotice();
    } catch (RuntimeException error) {
      cancel();
      throw error;
    }
  }

  /** Commit once before UI delivery; a later callback failure cannot undo a turn. */
  public static void complete() {
    if (repository == null) return;
    try {
      repository.save(staged);
    } catch (RuntimeException error) {
      // SharedPreferences may update its in-memory value even when disk commit fails.
      try { repository.save(checkpoint); }
      catch (RuntimeException rollback) { error.addSuppressed(rollback); }
      throw error;
    }
    committed = true;
    clear();
  }

  public static String failure(Exception error) {
    return (committed ? "turn_committed_ui_sync_failed: " : "") + error.getMessage();
  }

  public static void cancel() {
    if (owner != null) owner.restoreInventoryUse(checkpoint);
    clear();
  }

  private static void clear() { owner = null; checkpoint = null; repository = null; staged = null; }
}
