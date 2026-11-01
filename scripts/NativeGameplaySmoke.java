import android.content.Context;
import android.content.ContextWrapper;
import android.content.SharedPreferences;
import android.content.res.AssetManager;
import android.os.Looper;
import dalvik.system.DexClassLoader;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.lang.reflect.*;
import java.util.*;
import org.json.JSONArray;
import org.json.JSONObject;

/** Actual packaged gameplay lambda, with controlled external IO boundaries. */
public final class NativeGameplaySmoke {
  static ClassLoader loader;
  static Object facade, bridge;
  static Class<?> facadeType;
  static Method gameplay;
  static JSONObject state, answer;
  static String prompt, error;
  static boolean transportFailure, storageFailure, callbackFailure, stale;
  static String initial;
  static String answerRaw, newRun;
  static double draw=0.61;
  static boolean entitySuccess;
  static int writes, failed;
  static final Map<String, Map<String,Object>> stores = new HashMap<>();

  static void check(boolean ok, String name) {
    System.out.println((ok ? "PASS: " : "FAIL_CONFIRMED: ") + name);
    if (!ok) failed++;
  }
  static String asset(AssetManager manager, String name) throws Exception {
    try (InputStream in=manager.open(name); ByteArrayOutputStream out=new ByteArrayOutputStream()) {
      byte[] bytes=new byte[8192]; int n;
      while ((n=in.read(bytes))!=-1) out.write(bytes,0,n);
      return out.toString("UTF-8");
    }
  }
  static Object prefs(String name) {
    Map<String,Object> values=stores.computeIfAbsent(name,k->new HashMap<>());
    return Proxy.newProxyInstance(NativeGameplaySmoke.class.getClassLoader(),new Class<?>[]{SharedPreferences.class},(p,m,a)->{
      switch(m.getName()) {
        case "getString": case "getBoolean": case "getInt": case "getLong":
          return values.getOrDefault((String)a[0],a[1]);
        case "contains": return values.containsKey((String)a[0]);
        case "getAll": return new HashMap<>(values);
        case "edit":
          Map<String,Object> pending=new HashMap<>(values);
          return Proxy.newProxyInstance(NativeGameplaySmoke.class.getClassLoader(),new Class<?>[]{SharedPreferences.Editor.class},(e,em,ea)->{
            switch(em.getName()) {
              case "putString": case "putBoolean": case "putInt": case "putLong": pending.put((String)ea[0],ea[1]); return e;
              case "remove": pending.remove((String)ea[0]); return e;
              case "clear": pending.clear(); return e;
              case "commit": case "apply":
                if(storageFailure && name.equals("caominh_game_state_core_v1"))return false;
                values.clear();values.putAll(pending);
                if(name.equals("caominh_game_state_core_v1"))writes++;
                return em.getName().equals("commit") ? true : null;
              default: throw new AssertionError(em.getName());
            }
          });
        default: throw new AssertionError(m.getName());
      }
    });
  }
  static Object call(String name, Class<?>[] types, Object... args) throws Exception {
    try {return facadeType.getMethod(name,types).invoke(facade,args);}
    catch(InvocationTargetException e) {throw (Exception)e.getCause();}
  }
  static String snapshot() throws Exception {return (String)call("currentCoreState",new Class<?>[]{});}
  static void fresh() throws Exception {
    transportFailure=storageFailure=callbackFailure=stale=false;
    error=null;prompt="";
    answerRaw=null;entitySuccess=false;draw=0.61;
    state=new JSONObject((String)call("initializeLevelGame",new Class<?>[]{String.class,boolean.class},initial,true));
    answer=new JSONObject().put("itemUseRequest",JSONObject.NULL)
        .put("reply","Cao Minh quan sát hành lang trước mặt.").put("entityPreview","")
        .put("narrativeDelta",JSONObject.NULL);
    writes=0;
  }
  static void turn(String raw) throws Exception {
    try {gameplay.invoke(bridge,"EXECUTE",raw,"Cao Minh lắng nghe tiếng đèn.");}
    catch(InvocationTargetException e) {error="uncaught:"+e.getCause();}
  }
  public static String generate(String text) throws Exception {
    prompt=text;
    if(transportFailure)throw new IllegalStateException("fixture_transport_failure");
    if(stale)newRun=new JSONObject((String)call("initializeLevelGame",new Class<?>[]{String.class,boolean.class},initial,true)).getJSONObject("levelTravel").getString("runId");
    return answerRaw==null?answer.toString():answerRaw;
  }
  public static void emit(String name,String raw) throws Exception {
    if(name.equals("backroomTurn")) {
      state=new JSONObject(raw);
      if(callbackFailure)throw new IllegalStateException("fixture_callback_failure");
    } else if(name.equals("backroomError"))error=raw;
  }
  public static JSONObject rolls(JSONObject before,boolean meta) throws Exception {
    JSONObject r=new JSONObject().put("meta",meta).put("turn",before.optInt("turn",1));
    for(String key:new String[]{"survivor","entityEncounter","hazard","loot","almondWater","lucTramReunion","syvialReunion","anNhienEncounter","huaTieuLanEncounter","nguyenQuocNamEncounter"})
      r.put(key,new JSONObject().put("success",false));
    if(entitySuccess)r.put("entityEncounter",new JSONObject().put("success",true)).put("roamingEntityKey","hound").put("roamingEntityName","Hound");
    return r;
  }
  static void field(Object target,String name,Object value) throws Exception {
    Field f=target.getClass().getDeclaredField(name);f.setAccessible(true);f.set(target,value);
  }
  public static void main(String[] args) {
    try {run(args);} catch(Throwable e) {e.printStackTrace();System.exit(1);}
  }
  static void run(String[] args) throws Exception {
    System.out.println("NATIVE_GATE_STAGE: start");
    Looper.prepareMainLooper();
    System.out.println("NATIVE_GATE_STAGE: looper");
    loader=new DexClassLoader(args[0],"/data/local/tmp",null,NativeGameplaySmoke.class.getClassLoader());
    Constructor<AssetManager> assetsConstructor=AssetManager.class.getDeclaredConstructor();assetsConstructor.setAccessible(true);
    final AssetManager assets=assetsConstructor.newInstance();
    AssetManager.class.getMethod("addAssetPath",String.class).invoke(assets,args[0]);
    System.out.println("NATIVE_GATE_STAGE: assets");
    Context context=new ContextWrapper(null) {
      public AssetManager getAssets(){return assets;}
      public Context getApplicationContext(){return this;}
      public SharedPreferences getSharedPreferences(String n,int mode){return (SharedPreferences)prefs(n);}
    };
    initial=asset(assets,"qa-initial.json");
    facadeType=loader.loadClass("com.rabpit.backroom.core.GameCoreFacade");
    Class<?> repositoryType=loader.loadClass("com.rabpit.backroom.core.SaveRepository");
    Object repository=loader.loadClass("com.rabpit.backroom.core.SharedPreferencesSaveRepository")
        .getConstructor(Context.class).newInstance(context);
    Object logger=loader.loadClass("com.rabpit.backroom.core.NoOpGamePipelineLogger").getField("INSTANCE").get(null);
    Class<?> function=loader.loadClass("kotlin.jvm.functions.Function0");
    Object random=Proxy.newProxyInstance(loader,new Class<?>[]{function},(p,m,a)->draw);
    Object tickets=Proxy.newProxyInstance(loader,new Class<?>[]{function},(p,m,a)->6100);
    Class<?> policyType=loader.loadClass("com.rabpit.backroom.core.LevelTravelPolicy");
    Object policy=policyType.getConstructor(JSONObject.class).newInstance(new JSONObject(asset(assets,"knowledge/level_travel_policy.json")));
    Class<?> travelType=loader.loadClass("com.rabpit.backroom.core.LevelTravelEngine");
    Object travel=travelType.getConstructor(policyType,function).newInstance(policy,random);
    facade=facadeType.getConstructor(repositoryType,loader.loadClass("com.rabpit.backroom.core.GamePipelineLogger"),travelType,function)
        .newInstance(repository,logger,travel,tickets);
    System.out.println("NATIVE_GATE_STAGE: facade");
    Object activity=loader.loadClass("com.rabpit.backroom.MainActivity").getConstructor().newInstance();
    System.out.println("NATIVE_GATE_STAGE: activity");
    // This headless Activity has no window/autofill services to attach.
    Field base=ContextWrapper.class.getDeclaredField("mBase");base.setAccessible(true);base.set(activity,context);
    field(activity,"gameCore",facade);
    Constructor<?> diagnostic=loader.loadClass("com.rabpit.backroom.AppDiagnosticLog").getDeclaredConstructor(Context.class);diagnostic.setAccessible(true);
    field(activity,"diagnosticLog",diagnostic.newInstance(context));
    Constructor<?> b=loader.loadClass("com.rabpit.backroom.MainActivity$GameBridge").getDeclaredConstructor(activity.getClass());b.setAccessible(true);bridge=b.newInstance(activity);
    gameplay=bridge.getClass().getDeclaredMethod("lambda$submitGameplayAction$2",String.class,String.class,String.class);gameplay.setAccessible(true);
    fresh();int turn=state.getInt("turn");turn(state.toString());
    check(error==null&&state.getInt("turn")==turn+1,"native full GM pipeline commits accepted turn");
    check(prompt.contains("NARRATIVE SCENE RULES"),"native provider receives shared narrative contract");
    fresh();String before=snapshot();transportFailure=true;turn(state.toString());
    check(error!=null&&before.equals(snapshot()),"native transport failure restores exact Core snapshot");
    fresh();before=snapshot();answerRaw="{broken";turn(state.toString());
    check(error!=null&&before.equals(snapshot()),"native malformed JSON restores exact Core snapshot");
    fresh();before=snapshot();answer.put("reply","Cao Minh không thể dùng thần thức.");turn(state.toString());
    check(error!=null&&before.equals(snapshot()),"native rejected canon restores exact Core snapshot");
    fresh();before=snapshot();entitySuccess=true;turn(state.toString());
    check(error!=null&&before.equals(snapshot()),"native missing entity preview restores exact Core snapshot");
    fresh();before=snapshot();answer.put("narrativeDelta",new JSONObject().put("actors",new JSONArray().put(new JSONObject().put("name","Người lạ"))));turn(state.toString());
    check(error!=null&&before.equals(snapshot()),"native invalid encounter metadata restores exact Core snapshot");
    fresh();before=snapshot();answer.put("reply","Lục Trầm bước tới trước mặt Cao Minh và nắm tay hắn.")
        .put("narrativeDelta",new JSONObject().put("actors",new JSONArray().put(new JSONObject().put("name","Lục Trầm").put("id","luc-tram"))));turn(state.toString());
    check(error!=null&&before.equals(snapshot()),"native prose cannot invent reunion after failed Core roll");
    fresh();before=snapshot();callbackFailure=true;turn(state.toString());
    check(state.getInt("turn")==new JSONObject(new JSONObject(snapshot()).getJSONObject("world").getString("levelTravelUi")).getInt("turn"),"native callback failure preserves committed UI/Core agreement");
    fresh();stale=true;turn(state.toString());
    check(newRun.equals(new JSONObject(new JSONObject(snapshot()).getJSONObject("world").getString("levelTravel")).getString("runId")),"native old response cannot overwrite new game");
    fresh();String repeated=state.toString();turn(repeated);String committed=snapshot();turn(repeated);
    check(committed.equals(snapshot()),"native double submit commits Core once");
    fresh();before=snapshot();storageFailure=true;turn(state.toString());storageFailure=false;
    check(error!=null&&before.equals(snapshot()),"native persistence failure leaves accepted save intact");
    for(double value:new double[]{0,0.499999,0.5,0.999999}) {
      fresh();draw=value;
      JSONObject candidate=new JSONObject(state.toString()).put("turn",state.getInt("turn")+1);
      JSONObject next=new JSONObject((String)call("finishLevelTurn",new Class<?>[]{String.class,String.class,String.class},state.toString(),candidate.toString(),"Khám phá"));
      JSONObject result=next.getJSONObject("exitResult");
      check(result.getInt("requiredStreak")==4&&result.getInt("chancePercent")==50&&result.getBoolean("success")== (value<0.5),"native exact travel boundary "+value);
      check(state.getJSONObject("levelTravel").getString("nodeId").equals("LEVEL.NODE.0"),"native new game starts at Level 0");
    }
    fresh();draw=0.49;String node=state.getJSONObject("levelTravel").getString("nodeId");
    for(int i=1;i<=4;i++) {
      JSONObject candidate=new JSONObject(state.toString()).put("turn",state.getInt("turn")+1);
      state=new JSONObject((String)call("finishLevelTurn",new Class<?>[]{String.class,String.class,String.class},state.toString(),candidate.toString(),"Khám phá"));
      check(state.getJSONObject("exitResult").getBoolean("completed")==(i==4),"native four-streak step "+i);
    }
    check(!node.equals(state.getJSONObject("levelTravel").getString("nodeId")),"native four successes change Level");
    String outside=state.getJSONObject("levelTravel").getString("nodeId");
    state=new JSONObject((String)call("resumeLevelGame",new Class<?>[]{String.class,boolean.class},state.toString(),true));
    check(outside.equals(state.getJSONObject("levelTravel").getString("nodeId")),"native existing nonzero-Level save remains in place");
    System.out.println("NATIVE_GATE_RESULT: "+new JSONObject().put("failures",failed).put("controlledIO",true));
    Field io=activity.getClass().getDeclaredField("io");io.setAccessible(true);
    ((java.util.concurrent.ExecutorService)io.get(activity)).shutdownNow();
    if(failed>0&&(args.length<2||!args[1].equals("probe")))throw new AssertionError("Native gate failures: "+failed);
  }
}
