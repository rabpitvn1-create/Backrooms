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
    owner = facade;
    checkpoint = facade.inventoryUseCheckpoint();
    JSONObject before = new JSONObject(raw);
    before.remove("itemUseNotice");
    original = before.toString();
    action = input;
    items = directory(checkpoint);
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
          String prefix = text.substring(Math.max(0, at - 100), at);
          int use = lastVerb(prefix, uses), observation = lastVerb(prefix, observations);
          if (use < 0 || use < observation) continue;
          String beforeUse = prefix.substring(Math.max(0, use - 13), use).trim();
          if (beforeUse.endsWith("không") || beforeUse.endsWith("chưa")
              || beforeUse.endsWith("đừng") || beforeUse.endsWith("chẳng")) continue;
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
        if (!registeredUse(generated.optString("reply", "")).isEmpty())
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

  /** Release the checkpoint only after the whole turn was committed and delivered. */
  public static void complete() { clear(); }

  public static void cancel() {
    if (owner != null) owner.restoreInventoryUse(checkpoint);
    clear();
  }

  private static void clear() { owner = null; checkpoint = null; }
}
