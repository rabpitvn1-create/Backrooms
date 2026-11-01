package backrooms;

import java.util.HashSet;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Scoped narrative facts. Never grants Core items, followers, combat results, stats or travel.
 * The Core's existing flags JSON is the only persistence store.
 */
public final class NarrativePolicy {
  private static final String MEMORY = "narrativeScene";
  private static final String RELATIONS = "narrativeRelations";
  private static final String HISTORY = "narrativeLevelMemory";
  private static final String SEEN = "narrativeSeen";
  private static final int MAX_FACTS = 10, MAX_ACTORS = 6, MAX_RELATIONS = 16;

  private NarrativePolicy() {}

  private static boolean genericName(String name) {
    String n = name.toLowerCase(java.util.Locale.ROOT).trim();
    return n.startsWith("người ") || n.startsWith("một ") || n.startsWith("kẻ ")
        || n.startsWith("đứa ") || n.startsWith("cô gái") || n.startsWith("chàng trai")
        || n.startsWith("survivor ") || n.startsWith("unknown ") || n.startsWith("nhân vật ");
  }

  private static String shortText(Object value, int limit) {
    if (!(value instanceof String)) throw new IllegalArgumentException("narrative_text_invalid");
    String s = ((String)value).trim();
    if (s.length() > limit) throw new IllegalArgumentException("narrative_text_too_long");
    return s;
  }

  private static String visit(JSONObject state) {
    JSONObject travel = state.optJSONObject("levelTravel");
    if (travel == null) return "";
    String run = travel.optString("runId", ""), node = travel.optString("nodeId", "");
    if (run.isEmpty() || node.isEmpty()) return "";
    JSONObject flags = state.optJSONObject("flags");
    JSONObject continuity = flags == null ? null : flags.optJSONObject("storyContinuity");
    JSONArray events = continuity == null ? null : continuity.optJSONArray("levelTravelEvents");
    if (events != null) for (int i = events.length()-1; i >= 0; i--) {
      JSONObject e = events.optJSONObject(i);
      if (e != null && node.equals(e.optString("nodeId", "")) &&
          ("new_game".equals(e.optString("kind")) || "arrival".equals(e.optString("kind")) ||
           "level_transition".equals(e.optString("kind")) || "level_exit".equals(e.optString("kind")) || "travel".equals(e.optString("kind")))) {
        return run + ":" + node + ":" + e.optString("turnId", "");
      }
    }
    return run + ":" + node + ":NO_ARRIVAL";
  }

  private static JSONObject scoped(JSONObject state) {
    JSONObject flags = state.optJSONObject("flags");
    JSONObject memory = flags == null ? null : flags.optJSONObject(MEMORY);
    return memory != null && visit(state).equals(memory.optString("visit", "~")) ? memory : null;
  }

  private static int entryTurn(JSONObject state) {
    JSONObject travel = state.optJSONObject("levelTravel");
    JSONObject flags = state.optJSONObject("flags");
    JSONObject continuity = flags == null ? null : flags.optJSONObject("storyContinuity");
    JSONArray events = continuity == null ? null : continuity.optJSONArray("levelTravelEvents");
    if (events == null || travel == null) return -1;
    String node = travel.optString("nodeId", "");
    for (int i=events.length()-1;i>=0;i--) {
      JSONObject e=events.optJSONObject(i);
      if(e == null || !node.equals(e.optString("nodeId","")))continue;
      String turnId=e.optString("turnId","");
      if("NEW_GAME".equals(turnId))return 1;
      if(turnId.startsWith("TURN_"))try{return Integer.parseInt(turnId.substring(5));}catch(NumberFormatException ignored){return -1;}
    }
    return -1;
  }

  private static boolean travelArrival(JSONObject state) {
    JSONObject travel=state.optJSONObject("levelTravel");
    JSONObject flags=state.optJSONObject("flags");
    JSONObject cont=flags==null?null:flags.optJSONObject("storyContinuity");
    JSONArray events=cont==null?null:cont.optJSONArray("levelTravelEvents");
    if(travel==null||events==null)return false;
    String node=travel.optString("nodeId","");
    for(int i=events.length()-1;i>=0;i--){
      JSONObject e=events.optJSONObject(i);
      if(e!=null&&node.equals(e.optString("nodeId","")))
        return !"new_game".equals(e.optString("kind",""));
    }
    return false;
  }

  /** Canon builders only receive a bounded, current-visit view; saved history stays intact. */
  public static JSONObject promptView(JSONObject original) {
    JSONObject safe = new JSONObject(original.toString());
    safe.remove("coreSnapshot"); // Never pass nested Core/save snapshots into any GM canon builder.
    JSONObject flags = safe.optJSONObject("flags");
    if (flags != null) {
      if (scoped(safe) == null) flags.remove(MEMORY);
      JSONObject history = flags.optJSONObject(HISTORY);
      if (history != null && !visit(safe).equals(history.optString("visit", "~")))
        flags.remove(HISTORY);
      flags.remove(SEEN); // opaque lifetime markers are not information Cao Minh can recall
    }
    JSONArray log = safe.optJSONArray("log");
    if(log != null) {
      JSONArray recent = new JSONArray();
      int entry=entryTurn(safe), current=safe.optInt("turn",1);
      int allowed=entry<0?6:Math.max(0,Math.min(6,(current-entry-(travelArrival(safe)?1:0))*2));
      int start=Math.max(0,log.length()-allowed);
      for(int i=start;i<log.length();i++){
        JSONObject item=log.optJSONObject(i);
        if(item==null)continue;
        JSONObject copy=new JSONObject(item.toString());
        String t=copy.optString("text","");
        if(t.length()>1400)copy.put("text",t.substring(0,1400));
        recent.put(copy);
      }
      safe.put("log",recent);
    }
    // Level travel receipt history is Core-owned and not NPC knowledge.
    if (flags != null && flags.optJSONObject("storyContinuity") != null)
      flags.getJSONObject("storyContinuity").remove("levelTravelEvents");
    return safe;
  }

  private static void remember(JSONObject history, String raw) {
    if(raw==null||raw.trim().isEmpty())return;
    String text=raw.trim();
    if(text.length()>500)text=text.substring(0,350)+" … "+text.substring(text.length()-140);
    JSONArray old=history.optJSONArray("facts"),next=new JSONArray();
    if(old!=null)for(int i=Math.max(0,old.length()-(MAX_FACTS-1));i<old.length();i++)
      next.put(old.optString(i));
    next.put(text);
    history.put("facts",next);
  }

  /** Applied after GM validation and before Core's authoritative turn commit. */
  public static void apply(JSONObject after, JSONObject before, JSONObject generated, JSONObject rolls) {
    JSONObject currentFlags = after.optJSONObject("flags");
    if(currentFlags == null){currentFlags=new JSONObject();after.put("flags",currentFlags);}
    JSONObject priorFlags = before.optJSONObject("flags");
    // Core owns gameplay state. AI proposals can describe effects but must never
    // silently change HP, item ownership or Party through its arbitrary JSON.
    for (String key : new String[] {"player", "party", "inventory"}) {
      if (before.has(key)) after.put(key, new JSONObject().put("value", before.get(key)).get("value"));
      else after.remove(key);
    }
    // These flags belong to the Core and cannot be forged via generated.flags.
    for (String key : new String[] {"storyContinuity", "survivorRegistry", "worldItems",
        "anNhien", "hua_tieu_lan", "nguyen_quoc_nam", "luc-tram", "syvial",
        "survivorEncountersAllowed", "entityEncountersAllowed"}) {
      if (priorFlags != null && priorFlags.has(key))
        currentFlags.put(key, new JSONObject().put("value", priorFlags.get(key)).get("value"));
      else currentFlags.remove(key);
    }
    // The model cannot replace the narrative stores through a generic flags patch.
    currentFlags.remove(MEMORY);
    currentFlags.remove(RELATIONS);
    currentFlags.remove(HISTORY);
    currentFlags.remove(SEEN);
    JSONObject memoryBefore = priorFlags == null ? null : priorFlags.optJSONObject(HISTORY);
    JSONObject history = memoryBefore != null && visit(before).equals(memoryBefore.optString("visit", "~"))
        ? new JSONObject(memoryBefore.toString())
        : new JSONObject().put("visit", visit(before)).put("facts", new JSONArray());
    currentFlags.put(HISTORY, history);
    JSONArray oldSeen = priorFlags == null ? null : priorFlags.optJSONArray(SEEN);
    JSONArray seen = oldSeen == null ? new JSONArray() : new JSONArray(oldSeen.toString());
    currentFlags.put(SEEN, seen);
    JSONObject existing=scoped(before);
    if(existing!=null)currentFlags.put(MEMORY,new JSONObject(existing.toString()));
    JSONObject oldRelations=priorFlags==null?null:priorFlags.optJSONObject(RELATIONS);
    if(oldRelations!=null)currentFlags.put(RELATIONS,new JSONObject(oldRelations.toString()));

    if(!generated.has("narrativeDelta") || generated.isNull("narrativeDelta")) {
      // Models may omit optional JSON fields even when instructed otherwise.
      // Preserve accepted narration as a bounded observation, never invent success.
      remember(history,generated.optString("reply",""));
      currentFlags.put(HISTORY,history);
      return;
    }
    JSONObject delta=generated.optJSONObject("narrativeDelta");
    if(delta==null)throw new IllegalArgumentException("narrative_delta_invalid");
    boolean wantsScene=delta.has("summary")||delta.has("actors")||delta.has("closed");
    JSONObject survivor=rolls.optJSONObject("survivor");
    boolean newEncounter=survivor!=null&&survivor.optBoolean("success",false);
    JSONObject scene=existing==null?null:new JSONObject(existing.toString());
    if(wantsScene){
      JSONArray actors=delta.optJSONArray("actors");
      if(delta.has("actors")&&actors==null)throw new IllegalArgumentException("narrative_actors_invalid");
      if(actors!=null&&actors.length()>MAX_ACTORS)throw new IllegalArgumentException("narrative_actor_limit");
      // A survivor roll authorizes only newly appearing unregistered people.
      // Named characters already present in the party may speak without a fresh roll.
      if(scene==null||scene.optBoolean("closed",false)){
        scene=new JSONObject().put("visit",visit(before)).put("sceneKey",visit(before)+":TURN_"+before.optInt("turn",1)).put("closed",false).put("facts",new JSONArray()).put("actors",new JSONArray());
      }
      if(actors!=null){
        // Each actor delta updates only the named participant. Do not drop other
        // people from an ongoing scene when the model mentions just one speaker.
        java.util.LinkedHashMap<String,JSONObject> participants =
            new java.util.LinkedHashMap<String,JSONObject>();
        JSONArray previous=scene.optJSONArray("actors");
        if(previous!=null)for(int i=0;i<previous.length();i++){
          JSONObject p=previous.optJSONObject(i);
          if(p!=null&&!p.optString("name","").isEmpty())
            participants.put(p.optString("name"),new JSONObject(p.toString()));
        }
        Set<String> namesInUpdate=new HashSet<String>();
        for(int i=0;i<actors.length();i++){
          JSONObject actor=actors.optJSONObject(i);
          if(actor==null)throw new IllegalArgumentException("narrative_actor_invalid");
          String name=shortText(actor.opt("name"),64);
          String canonId=actor.has("id")?shortText(actor.opt("id"),64):"";
          String alias=actor.has("aliasOf")?shortText(actor.opt("aliasOf"),64):"";
          if(name.isEmpty()||!namesInUpdate.add(name))
            throw new IllegalArgumentException("narrative_actor_duplicate");
          JSONObject entry=participants.get(name);
          if(canonId.isEmpty() && entry==null && alias.isEmpty())
            canonId=presentActorId(before,name);
          // The model may put an absent canon character into optional emotion
          // metadata (e.g. a separated follower recalled in prose). Ignore that
          // actor update without changing Core presence, Party or the active scene.
          // Validate before alias handling to avoid erasing an existing actor.
          if(!canonId.isEmpty()&&!present(before,canonId))continue;
          if(!alias.isEmpty()){
            if(entry!=null||!participants.containsKey(alias))
              throw new IllegalArgumentException("narrative_actor_alias_invalid");
            entry=participants.remove(alias);
            entry.put("name",name);
          }
          if(!canonId.isEmpty()){
            if(entry!=null&&!entry.optString("id",canonId).equals(canonId))
              throw new IllegalArgumentException("narrative_actor_identity_changed");
          }else if(entry==null){
            if(!newEncounter)throw new IllegalArgumentException("narrative_unconfirmed_encounter");
          }
          if(entry==null)entry=new JSONObject().put("name",name);
          if(!canonId.isEmpty())entry.put("id",canonId);
          // A name is not a globally unique identity when it is merely a
          // descriptor such as "Người vợ". The sceneKey distinguishes those.
          if(entry!=null&&(!participants.containsKey(name))&&!genericName(name)&&canonId.isEmpty()){
            String key=name.toLowerCase(java.util.Locale.ROOT);
            for(int j=0;j<seen.length();j++)
              if(key.equals(seen.optString(j)))throw new IllegalArgumentException("narrative_npc_reappeared");
            seen.put(key);
          }
          for(String key:new String[]{"emotion","belief","intent"})
            if(actor.has(key))entry.put(key,shortText(actor.opt(key),180));
          participants.put(name,entry);
        }
        if(participants.size()>MAX_ACTORS)
          throw new IllegalArgumentException("narrative_actor_limit");
        JSONArray people=new JSONArray();
        for(JSONObject person:participants.values())people.put(person);
        scene.put("actors",people);
      }
      if(delta.has("summary")){
        String fact=shortText(delta.opt("summary"),600);
        if(!fact.isEmpty()){
          JSONArray facts=scene.optJSONArray("facts");
          if(facts==null)facts=new JSONArray();
          JSONArray next=new JSONArray();
          for(int i=Math.max(0,facts.length()-(MAX_FACTS-1));i<facts.length();i++)
            next.put(facts.optString(i));
          next.put(fact);
          scene.put("facts",next);
          remember(history,fact);
          currentFlags.put(HISTORY,history);
        }
      }
      if(delta.has("closed")) {
        Object closed=delta.opt("closed");
        if(!(closed instanceof Boolean))throw new IllegalArgumentException("narrative_closed_invalid");
        scene.put("closed",closed);
      }
      if(scene.toString().length()>10000)throw new IllegalArgumentException("narrative_scene_limit");
      currentFlags.put(MEMORY,scene);
    }
    JSONArray changes=delta.optJSONArray("relationships");
    if(delta.has("relationships")&&changes==null)throw new IllegalArgumentException("narrative_relationships_invalid");
    if(changes!=null){
      if(changes.length()>6)throw new IllegalArgumentException("narrative_relationship_change_limit");
      JSONObject relations=currentFlags.optJSONObject(RELATIONS);
      if(relations==null)relations=new JSONObject();
      for(int i=0;i<changes.length();i++){
        JSONObject c=changes.optJSONObject(i);
        if(c==null)throw new IllegalArgumentException("narrative_relationship_invalid");
        String from=shortText(c.opt("from"),64),to=shortText(c.opt("to"),64),value=shortText(c.opt("emotion"),160);
        if(!known(before,from)||!known(before,to)||from.equals(to))
          throw new IllegalArgumentException("narrative_relationship_unknown_actor");
        String key=from+">"+to;
        if(!relations.has(key)&&relations.length()>=MAX_RELATIONS)
          throw new IllegalArgumentException("narrative_relationship_limit");
        relations.put(key,value);
      }
      currentFlags.put(RELATIONS,relations);
    }
  }

  // The model's actor.id is optional: resolve only exact names of present Core actors.
  // Never infer an absent NPC or turn an arbitrary narrative name into a follower.
  private static String presentActorId(JSONObject state,String name) {
    if("Cao Minh".equalsIgnoreCase(name))return "cao-minh";
    JSONArray party=state.optJSONArray("party");
    if(party!=null)for(int i=0;i<party.length();i++){
      JSONObject member=party.optJSONObject(i);
      if(member==null || !name.equalsIgnoreCase(member.optString("name","")))continue;
      String id=member.optString("id","");
      if(!id.isEmpty() && present(state,id))return id;
    }
    return "";
  }

  private static boolean present(JSONObject state,String id){
    if("cao-minh".equals(id))return true;
    JSONArray party=state.optJSONArray("party");
    if(party!=null)for(int i=0;i<party.length();i++){
      JSONObject p=party.optJSONObject(i);
      if(p!=null&&id.equals(p.optString("id")))return true;
    }
    JSONObject flags=state.optJSONObject("flags");
    JSONObject record=flags==null?null:flags.optJSONObject(id);
    return record!=null&&record.optBoolean("present",false);
  }

  private static boolean known(JSONObject state,String id){
    if("cao-minh".equals(id))return true;
    JSONObject flags=state.optJSONObject("flags");
    if(flags!=null&&flags.optJSONObject(id)!=null)return true;
    JSONArray party=state.optJSONArray("party");
    if(party!=null)for(int i=0;i<party.length();i++){
      JSONObject p=party.optJSONObject(i);
      if(p!=null&&id.equals(p.optString("id")))return true;
    }
    return false;
  }

  /** A completed travel removes the scene from the projected UI state. */
  public static JSONObject afterTravel(JSONObject state){
    JSONObject flags=state.optJSONObject("flags");
    if (flags != null && scoped(state) == null) flags.remove(MEMORY);
    if (flags != null) {
      JSONObject history=flags.optJSONObject(HISTORY);
      if (history != null && !visit(state).equals(history.optString("visit","~")))
        flags.remove(HISTORY);
    }
    return state;
  }

  /**
   * Reconcile transient narrative metadata in Core's actual saved snapshot, not merely
   * the UI projection. Preserve all other game data and re-decode the existing codec.
   */
  public static void persistCommitted(com.rabpit.backroom.core.GameCoreFacade facade, JSONObject ui) {
    JSONObject actual = new JSONObject(facade.currentCoreState());
    JSONObject world = actual.getJSONObject("world");
    JSONObject safe = new JSONObject(ui.toString());
    safe.remove("coreSnapshot");
    JSONObject uiFlags = safe.optJSONObject("flags");
    if (uiFlags == null) throw new IllegalStateException("narrative_flags_missing");
    JSONObject persistedFlags = new JSONObject(world.optString("flagsJson", "{}"));
    // Only our four owned fields are projected back. All Core flags remain
    // authoritative, especially receipts, continuity, survivor and world loot.
    for (String key : new String[] {MEMORY, RELATIONS, HISTORY, SEEN}) {
      if (uiFlags.has(key)) persistedFlags.put(key, uiFlags.get(key));
      else persistedFlags.remove(key);
    }
    world.put("flagsJson", persistedFlags.toString());
    safe.put("flags", new JSONObject(persistedFlags.toString()));
    world.put("levelTravelUi", safe.toString());
    com.rabpit.backroom.core.GameState decoded =
        com.rabpit.backroom.core.GameStateCodec.INSTANCE.decode(actual.toString());
    facade.restoreInventoryUse(decoded);
    ui.put("flags", persistedFlags);
  }

  /** Shared travel-commit boundary for narration, local rules and combat. */
  public static String finishAndPersist(com.rabpit.backroom.core.GameCoreFacade facade, String result) {
    JSONObject ui = new JSONObject(result);
    if (!ui.has("flags") || !ui.has("levelTravel") || ui.has("error")) return result;
    afterTravel(ui);
    persistCommitted(facade, ui);
    return ui.toString();
  }

  public static String guidelines(String prompt){
    return prompt+"\n[NARRATIVE SCENE RULES]\n"+
      "Viết một cảnh văn xuôi có cảm xúc và đối thoại tự nhiên; giọng mỗi nhân vật khác nhau. "+
      "Quan hệ giữa NPC với nhau tồn tại độc lập với Cao Minh, không ép Cao Minh yêu hay quyết định hộ người chơi. "+
      "Tragedy phải có nguyên nhân, không ép chết hoặc thất bại để giữ kịch bản. "+
      "Chỉ khi Core xác nhận survivor.success mới mở cuộc gặp One-Time NPC mới; NPC có thể có tên hoặc vô danh, "+
      "có cảm xúc, quan hệ và động cơ riêng. NPC này không tự vào party, không vào registry và không tái xuất sau khi kết thúc. "+
      "Các cuộc gặp đang mở có thể tiếp tục trong cùng lần ghé Level; qua Level khác phải quên, không dùng nhật ký cũ để nhớ lại. "+
      "Không bắt mỗi lượt phải gặp NPC, nói chuyện hoặc gây bi kịch. "+
      "Vật phẩm không có ID do người chơi tự sáng tác chỉ tồn tại trong lời kể: có thể cứu người trong cảnh, "+
      "không thêm Inventory, không sửa HP/EXP, combat, loot, party hoặc travel. "+
      "Chỉ ghi actors cho nhân vật đang trực tiếp hiện diện trong cảnh đã được Core xác nhận. "+
      "Nhân vật chỉ được nhắc lại trong ký ức hoặc đang thất lạc không thuộc actors; có thể ghi vào summary. "+
      "Hãy xuất thêm narrativeDelta:null nếu không có thay đổi cần nhớ; "+
      "khi có, chỉ dùng {summary:string,actors:[{name,id?,aliasOf?,emotion,belief,intent}],closed:boolean,relationships:[{from,to,emotion}]}. "+
      "summary tối đa 600 ký tự, actors tối đa 6; relationship phải dùng ID nhân vật canon đã biết, "+
      "có hướng, không tự suy tình cảm ngược chiều. Dùng aliasOf khi NPC vô danh tiết lộ tên thật. Nêu kết quả qua hành động thay vì thông báo khô.\n";
  }
}
