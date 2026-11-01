# BACKROOMS: Architecture Audit, Design và Adversarial Validation

## Kết luận điều hành

**Trạng thái cuối: BLOCKED đối với triển khai.** Kiến trúc có nền tảng để thực hiện năm phần đã thảo luận. Không có căn cứ yêu cầu viết lại toàn bộ game. Tuy nhiên, cổng triển khai chưa đạt vì hợp đồng tích hợp native Android chưa được kiểm chứng đầy đủ, đặc biệt trước khi xây prompt và khi kết thúc giao dịch lượt chơi. Không có thay đổi mã nguồn sản phẩm, commit, pull request, merge, release hay deployment trong phiên kiểm toán.

Phát hiện mới có bằng chứng thực thi: sau một phản hồi AI có JSON hợp lệ nhưng bị bộ kiểm tra canon từ chối, Core vẫn giữ một băng gạc được cấp trong bước xử lý tạm, trong khi lượt trên giao diện không tăng. Vì vậy, không thể coi cơ chế hoàn tác hiện tại là nền tảng đã an toàn cho ký ức và cảm xúc mới.

Báo cáo này phân biệt: sự kiện đã kiểm chứng; giả thuyết thiết kế; kiểm thử chưa thực hiện. Phần phản biện do cùng một phiên AI tự thực hiện, không phải thẩm định độc lập của con người.

## Phạm vi và nguồn bằng chứng

Repository: `rabpitvn1-create/Backrooms`.
Commit khảo sát: `77ef6c3a1b17ca3353ad72429c25863c2c666f73`.
Nhánh `main` được đọc lại khi kết thúc và vẫn trỏ đến commit này.

Đã khảo sát luồng GM, canon retrieval, Core, inventory, named followers, travel, save/load, giao diện nhật ký và đường đóng gói web/APK. Không tuyên bố đã đọc mọi dòng trong mọi module âm thanh, đồ họa và thư viện phụ thuộc.

Bản thực thi lấy trực tiếp từ artifact `13078289052`, thuộc run `41294527424`, tên `github-pages-41294527424-1`. SHA-256 archive:

```text
1bb28951e280e451b74fbee5cd60d1f143c414009978f89e975d024a8fbb21bd
```

`build.json` trong artifact xác nhận đúng commit. Đã so sánh lại 73 file thường sau kiểm thử với bản tar gốc: không file nào thay đổi. Bản Core được chạy nguyên trạng bằng Node. Các phản hồi AI, xác suất và dữ liệu thử được kiểm soát trong harness bên ngoài sản phẩm.

Bằng chứng đi kèm:
* `evidence/verification.json`: kết quả tổng hợp và giới hạn.
* `evidence/rollback-delta.json`: thay đổi Core dù lượt bị từ chối.
* `evidence/probe-run.log`, `scope-run.log`: log chạy thực tế.
* `evidence/core-paths.txt`: các đoạn Core liên quan trong artifact. Chỉ giải mã bảng chuỗi để đọc; không phải source Java mới hoặc bản vá.
* `evidence/provenance.json`: danh tính và tính toàn vẹn artifact.

## A. Architecture Findings

### A1. Kiến trúc thực tế

Web chạy JavaScript giao diện, gọi `pages/bridge.js`. Bridge gọi các hàm Java được TeaVM xuất ra từ `CoreBridge.java`. Gameplay chính đến từ DEX phục hồi thành `recovered-core.jar`, không phải một cây source Kotlin/Java đầy đủ có thể sửa trực tiếp.

`engine/pom.xml` hiện dùng Java target 8, TeaVM 0.16.0, Kotlin stdlib 2.3.0 và org.json 20240303. Đây là các phiên bản đọc từ repository, không phải khuyến nghị nâng dependency.

Một lượt kể chuyện đi qua:

```text
web/primary-actions.js hoặc form trong web/index.html
  -> Android.submitGameplayAction(...)
  -> pages/bridge.js: gameplay(...)
  -> InventoryUsePolicy.begin(...)
  -> processLevelAction / processWorldPickup / processNamedFollowerRule
  -> processRule / processExplorationLoot
  -> prepareNamedFollowerTurn
  -> CoreBridge.corePrompt / CanonRuntime2 / NarratorLogic.prompt
  -> generate(...)
  -> NarratorLogic.candidate
  -> commitNamedFollowerTurn / finishLevelTurn / có thể startCombatState
  -> persist / backroomTurn / save / render
```

Không phải mọi nhánh đều đi đến GM. Có nhánh trả về sớm từ luật cục bộ, nhặt đồ, follower, combat, Inventory và tiếp tục sau combat. Bất kỳ thay đổi bộ nhớ hoặc transaction nào chỉ đặt trong `NarratorLogic.candidate()` đều có nguy cơ bỏ sót những đường đó.

Android không tự động sử dụng `NarratorLogic.java` của web. `scripts/debug_release.py::package()` lấy APK gốc, thay một số asset và vá DEX. `scripts/inventory_use.py::patch_bridge()` sửa `MainActivity$GameBridge` trong smali; `helper_dex()` hiện chỉ biên dịch thêm `InventoryUsePolicy.java`. Vì vậy, việc sửa source web không chứng minh APK có cùng hành vi.

Nguồn: `README.md`; `engine/pom.xml`; `CoreBridge.java::coreCall/corePrompt`; `pages/bridge.js::gameplay`; `scripts/prepare_web_engine.py`; `scripts/inventory_use.py`; `scripts/debug_release.py`.

### A2. Lỗi hoàn tác đã tái hiện, không còn là giả thuyết

Chuỗi gây lỗi:

1. `InventoryUsePolicy.begin()` giữ checkpoint Core.
2. `processExplorationLoot()` có thể thay đổi inventory và ghi dấu đã xử lý loot trong Core.
3. AI trả JSON hợp lệ với `itemUseRequest:null`.
4. `InventoryUsePolicy.redirect()` gọi `clear()` ngay tại nhánh `null`.
5. `NarratorLogic.candidate()` tiếp tục kiểm tra nội dung và có thể ném `canon_validation_failed`.
6. Catch của bridge gọi `cancel()`, nhưng `owner` và `checkpoint` đã bị xóa, nên không còn hoàn tác.

P05 dùng phản hồi có lỗi canon có chủ đích và xác suất kiểm soát. Kết quả:
* Lỗi trả về: `canon_validation_failed:competence_suppression`.
* Lượt UI trước và sau đều là 1.
* `medical:bandage` xuất hiện trong inventory Cao Minh, quantity 1.
* `executedCommandIds` có thêm `core:explore:TURN_1:pickup`.
* Metadata có `loot.rolled.EXPLORE:TURN_1=true`.

Ngược lại, P03 chứng minh nhánh dùng vật phẩm có ID bị chặn vẫn hoàn tác đúng; P04 chứng minh lỗi transport trước khi phân loại cũng hoàn tác đúng. Lỗi phụ thuộc vị trí thất bại trong pipeline.

Nguồn: `InventoryUsePolicy.java::redirect/cancel/clear`, `NarratorLogic.java:410–447`, `pages/bridge.js:112–158`; P03, P04, P05.

### A3. Bộ nhớ đã tồn tại, không nên xây lại từ đầu

Trong Core thực thi có `com.rabpit.backroom.core.knowledge.StoryContinuityReducer`. Hàm `apply()` cập nhật events, discoveries, objectives, unresolvedThreads, knowledge và relationshipChanges. Một số mảng được giới hạn số phần tử, chẳng hạn events/discoveries 12 và relationshipChanges 8.

P01 chứng minh một trường bổ sung trong `flags` có thể đi qua `finishLevelTurn`, được lưu trong `world.flagsJson` và `world.levelTravelUi`, rồi sống sót qua encode/decode và resume. Save hiện tại có `saveVersion:3`.

Do đó, không có lý do đã được chứng minh để tạo thêm database hoặc hệ thống persistence riêng chỉ cho NPC tạm.

Tuy nhiên, việc ghi thay đổi quan hệ trong reducer hiện chỉ được gọi cho `luc-tram` và `syvial`. P09 cho thấy `hua_tieu_lan.relationship` được giữ trong flags nhưng không tự có bản ghi tương ứng trong `relationshipChanges`. Điều này không có nghĩa game hoàn toàn không nhớ Tiểu Lan; nó chứng minh cơ chế hiện tại chưa phải mô hình quan hệ tổng quát giữa mọi cặp nhân vật.

Nguồn: artifact, `StoryContinuityReducer.apply/recordRelationshipState`, `GameStateCodec.decodeCurrent`, `GameCoreFacade.finishLevelTurn`; P01, P09.

### A4. Xóa một biến NPC chưa đủ để quên NPC

P02 đặt một dấu hiệu ký ức thử vào flags và log, đi từ Level 0 sang Level 1 bằng bốn lần thành công. Dấu hiệu vẫn còn trong prompt kế tiếp. Đây là thử nghiệm khả năng lưu trữ hiện có, không phải khẳng định One-Time NPC đã tồn tại trong sản phẩm.

P12 đi sâu hơn: đăng ký NPC thử vào `survivorRegistry` làm reducer tạo dữ liệu dẫn xuất trong `storyContinuity.discoveries`. Sau khi bỏ registry và log khỏi đầu vào prompt thử, dấu hiệu vẫn xuất hiện.

Hệ quả thiết kế: One-Time NPC không được đi vào registry lâu dài dành cho survivor/canon. Lọc ký ức cần diễn ra trước mọi bộ dựng context, không chỉ xóa `state.log` hoặc một nhánh flags sau khi prompt đã được tạo.

Nguồn: `StoryContinuityReducer.recordRegistryDiscoveries`; `LegacyJsonSceneResolver`; `KnowledgeContextEngine.Builder.compactState`; `CoreBridge.corePrompt`; P02, P12.

### A5. Scope phải là lần ghé Level, không chỉ tên Level

Core có `flags.storyContinuity.levelTravelEvents`, mỗi lần đến gồm `kind`, `turnId`, `nodeId`, `positionId`.

P11 kiểm chứng:
* Trong cùng lần ghé Level, `revision` tăng sau mỗi lượt nhưng event vào Level không đổi.
* Đi Level 0 → Level 1 → Level 0: nodeId giống lần đầu, nhưng event vào Level có `turnId` mới.

Vì vậy, key scope phù hợp là kết hợp `runId` và `turnId` của sự kiện vào Level do Core xác nhận. Không dùng mỗi `nodeId`, cũng không dùng `revision` như visit ID. Đây là cơ chế có thể tái sử dụng, không cần tự tạo thêm bộ đếm song song nếu sự kiện Core đầy đủ.

Nguồn: `LevelTravelEngine.arrival/resolve`; P11.

### A6. Non-ID Item bị cấm ở prompt hiện tại

`InventoryUsePolicy.appendPrompt()` chứa chỉ dẫn: khi không xác định được ID thì không được kể hoặc cấp hiệu ứng sử dụng.

P06 xác nhận câu cấm này có trong prompt thực tế. Đây là xung đột trực tiếp với yêu cầu Hồi Hoàn Đan tự sáng tác.

Không cần tạo item catalog, item ID, icon hoặc lượng tồn kho cho Non-ID Item. Phải sửa hợp đồng giữa GM và gameplay để cho phép hiệu ứng trong câu chuyện mà không tự đổi dữ liệu vật phẩm có ID.

Nguồn: `InventoryUsePolicy.java:55–68`; P06.

### A7. Giới hạn sáu mục log không phải giới hạn bộ nhớ/prompt đầy đủ

P07 đo được prompt đầu vào trong fixture:
* 65.223 đơn vị độ dài chuỗi JavaScript.
* 79.930 byte UTF-8.
* Mục prologue dài 33.700 đơn vị chuỗi và vẫn nằm trong prompt.

Đây không phải số token. Chưa đo độ trễ hoặc chi phí API với một model thực.

Trong thử nghiệm 100 lượt với văn bản tổng hợp, UI JSON tăng từ 142.408 byte tại lượt 2 lên 407.593 byte tại lượt 101. Core JSON tăng từ 81.025 lên 231.531 byte; log tăng từ 4 lên 202 mục; receipts từ 1 lên 100. Dữ liệu mới chỉ giới hạn theo Level không tự giải quyết sự tăng trưởng log và receipts đã tồn tại.

Một lần thử 500 lượt bị công cụ dừng ở giới hạn 20 giây. Không được suy diễn đây là crash hoặc timeout của game. P10 sau đó hoàn thành riêng với 100 lượt.

Nguồn: `NarratorLogic.compactStateForPrompt`, `web/index.html::render/save`, `GameCoreFacade.finishLevelTurn`, `LevelTravelEngine.resolve`; P07, P10.

### A8. Đường web/APK không đồng nhất đầy đủ

`PatchLevelTravel.java` sửa các hằng 0.4 thành 0.5, 3 thành 4, 40/60 thành 50/50 cho bản web. `prepare_web_engine.py` gọi patch đó trên class phục hồi. `debug_release.py` hiện gọi patch inventory trên DEX, không gọi patch class travel này.

Đây là chênh lệch đường build đã xác minh. Báo cáo không tuyên bố đã chạy APK để đo xác suất native trong phiên này. Cần kiểm tra DEX được đóng gói và hành vi native trước khi coi quy tắc 4 streak, 50/50 là bất biến đã được chứng minh ở cả hai nền tảng.

Bản APK cũng không tự copy toàn bộ `web/knowledge/level_travel_policy.json` theo đoạn override hiện có. Thay startingIds của web một mình chưa đủ chứng minh startup APK đã đổi.

Nguồn: `scripts/PatchLevelTravel.java`, `scripts/level_travel.py`, `scripts/prepare_web_engine.py`, `scripts/debug_release.py::package`.

### A9. Chất lượng kể chuyện vẫn cần bằng chứng riêng

“Văn khô, không muốn đọc” là triệu chứng chủ nhân báo. Các vấn đề context, ký ức và luật xung đột ở trên đã được kiểm chứng, nhưng chưa đủ để kết luận chúng là toàn bộ nguyên nhân của chất lượng văn học.

`test_live_turn.cjs` kiểm tra lời kể đủ dài và pipeline thành công, không đánh giá thoại, quan hệ, nhịp cảnh hay quyền chủ động của người chơi. Chưa thực hiện đánh giá model thật với năm phần mới. Không có bảo đảm rằng chỉ thêm state hoặc prompt sẽ làm văn hay.

## B. Solution Comparison

| Hướng | Ưu điểm | Điểm không giải quyết được | Kết luận |
|---|---|---|---|
| Minimal Intervention: chỉ sửa prompt và thêm flags tự do | Ít file; không thêm dependency | Không sửa checkpoint; không phân scope và kiểm soát dữ liệu dẫn xuất; khác biệt APK còn nguyên | Loại cho toàn bộ yêu cầu. Chỉ phù hợp cải thiện văn phong riêng lẻ |
| Modular Improvement: tái sử dụng Core/save/continuity, thêm hợp đồng kể chuyện dùng chung | Giữ gameplay, không thêm database, có thể dùng chung Java/JSON trên hai nền tảng | Cần xác minh điểm tích hợp native và commit; không thể chỉ append prompt | Phương án được chọn để hoàn thiện, chưa đủ điều kiện triển khai |
| Architectural Redesign: thay engine hoặc đưa cả APK sang cùng browser runtime | Có thể giảm hai đường chạy về dài hạn | Thay bridge, persistence, đóng gói và tương thích ngoài phạm vi; chưa có bằng chứng là bắt buộc | Không chọn |

Đánh đổi chính của phương án được chọn là thêm một helper nhỏ dùng chung, thay vì thêm một “manager” lớn hoặc năm dịch vụ AI. Mẫu biên dịch helper chung đã tồn tại ở `InventoryUsePolicy.java`. Không nâng dependency và không cần thêm lần gọi AI riêng cho từng NPC.

## C. Implementation Blueprint

Đây là thiết kế đề xuất, không phải mô tả mã đã được tạo. Phần native có điểm kiểm chứng bắt buộc chưa hoàn tất, nên blueprint chưa được phê duyệt để thực thi.

### C1. Bất biến cần bảo toàn

1. Vật phẩm đã đăng ký ID vẫn dùng qua Inventory; bị chặn qua GM không làm tăng lượt hoặc streak.
2. Non-ID Item chỉ là chi tiết do người chơi sáng tác trong câu chuyện. Không tự đăng ký, không thêm inventory, không tạo chỉ số, số lượng hay roll hiệu lực riêng.
3. Tình trạng của NPC tạm trong truyện có thể thay đổi theo sáng tác người chơi. Điều này không trao cho GM quyền ghi tùy ý HP, EXP, party, loot hoặc kết quả combat của Core.
4. Cao Minh không bị ép yêu, mất ký ức canon hoặc lựa chọn hành động ngoài ý người chơi.
5. One-Time NPC chỉ thuộc một cuộc gặp, có thể kéo dài qua vài lượt; khi đã kết thúc không tự mở lại. Hỏi lại trong Level không đồng nghĩa spawn lại.
6. Sang lần ghé Level mới, NPC tạm mất hiệu lực, kể cả quay về cùng node. Canon và quan hệ follower không bị xóa theo.
7. Save/load trong cùng lần ghé giữ nguyên câu chuyện. Load một save cũ là quay về timeline của save, không phải phát sinh cuộc gặp mới.
8. Tạo ván mới mặc định Level 0. Không di chuyển save cũ về Level 0. Không âm thầm tạm dừng no-clip vì câu chuyện.
9. API lỗi, JSON sai, validator từ chối hoặc phản hồi stale không được tạo “ký ức ma” hay cấp phần thưởng.
10. Nhật ký đọc lại và ký ức được phép đưa vào GM là hai tập dữ liệu khác nhau.

### C2. Hợp đồng dữ liệu đề xuất

Tái sử dụng `flags`, được lưu qua Core. Dành một namespace mới, ví dụ `flags.narrative`, cho dữ liệu do helper kiểm soát. Tên này **chưa tồn tại như một tính năng trong repository**.

Nội dung tối thiểu:
* Schema riêng của namespace, không đổi saveVersion toàn game chỉ vì thêm trường.
* Visit key lấy từ runId và event vào Level có thẩm quyền.
* Cảnh đang mở: các tham chiếu NPC nội bộ, tên nếu đã biết, hoàn cảnh, quan hệ giữa họ, nhận thức chủ quan, tình trạng và kết quả đã xác nhận.
* Tóm tắt ngắn các cuộc gặp đã kết thúc trong lần ghé hiện tại.
* Quan hệ dài hạn chỉ giữa nhân vật canon đã được xác nhận. Quan hệ có hướng, không đối xứng mặc định.

Mã nội bộ cho cảnh/NPC không phải item ID. Non-ID Item không có record catalog riêng; chỉ cần kết quả như “người vợ đã được cứu” khi kết quả này cần được nhớ.

GM trả lời trong một phản hồi gồm prose và một delta câu chuyện nhỏ. Không để GM gửi bản thay thế toàn bộ namespace. Host quyết định run/visit/scene identity; delta chỉ tham chiếu người thuộc cảnh hoặc nhân vật canon hợp lệ. Không cho GM sửa revision, runId hoặc tự thêm NPC vào Party.

Giới hạn bộ nhớ phải được kiểm tra bằng mã, không chỉ dặn AI viết ngắn. Một cấu hình thử nghiệm có thể giới hạn một cảnh hoạt động, sáu người trong cảnh, mười hai tóm tắt đã khép và 32 KiB cho phần ký ức tạm. Đây là đề xuất thử nghiệm, không phải số liệu hiệu năng hay quyết định đã triển khai. Khi hết ngân sách, không xóa một cuộc gặp còn cần nhớ; tạm không mở thêm cảnh tạm. Không ảnh hưởng cửa sổ spawn follower đã có.

### C3. Vòng đời và dữ liệu dẫn xuất

Dữ liệu One-Time NPC không đi vào `survivorRegistry` hoặc được thăng thành facts canon tự động.

Trước khi dựng CanonRuntime2, context fallback, narrative grounding và lịch sử rút gọn, helper phải tạo đầu vào đã lọc theo visit. Xóa dữ liệu ở cuối một prompt là quá muộn.

Khi Core xác nhận chuyển Level, cảnh cũ phải hết hiệu lực ngay. Lớp bảo vệ khi load và trước khi dựng prompt phải nhận ra stale visit kể cả một nhánh chuyển Level chưa gọi GM. Việc giải phóng vật lý namespace phải đồng bộ với snapshot đã lưu; không chỉ đổi một bản UI rồi để `world.flagsJson` giữ bản cũ.

Thông tin nhân vật canon vẫn có thể giữ biến đổi quan hệ tổng quát, nhưng không mang theo hồ sơ chi tiết của NPC tạm đã hết scope. Không dùng “hồi tưởng” để tái nhập NPC cũ.

### C4. Ranh giới giao dịch đề xuất

Không xóa checkpoint ở nhánh `itemUseRequest:null`.

Cần phân biệt: bắt đầu; phân loại; kiểm tra; cập nhật tạm; hoàn tất có thẩm quyền; thông báo UI. Lỗi trước hoàn tất phải phục hồi đúng checkpoint. Lỗi hiển thị sau khi đã ghi nhận phải được báo là lỗi đồng bộ giao diện, không giả vờ “lượt chưa thay đổi”.

Trên web, `call()` hiện gọi `persist()` ở các bước trung gian. Cần xác định một nơi sở hữu việc ghi bản bền vững cuối cùng; không bổ sung bộ nhớ mới vào giữa hai lần ghi rời rạc mà gọi đó là atomic.

Thiết kế chính xác cho native đang bị chặn: phải đọc toàn bộ phương thức bridge và cách SaveRepository native ghi dữ liệu trước khi quyết định điểm success/catch/finalize. Không chỉ thay `clear()` và mặc định mọi đường trả về đều đúng.

### C5. Danh sách file dự kiến

#### `engine/src/main/java/backrooms/InventoryUsePolicy.java` — sửa

Vai trò: checkpoint, nhận diện sử dụng item, chuyển người chơi vào Inventory.
Vấn đề: `redirect(null)` xóa checkpoint sớm; prompt cấm mọi hiệu ứng khi không có ID.
Tác động: `begin`, `redirect`, `cancel`, `clear`, `appendPrompt`.
Thay đổi: giữ checkpoint đến điểm kết thúc được xác minh; bổ sung thao tác hoàn tất phân biệt với hủy; tách item có ID và chi tiết kể chuyện không ID. Giữ cách xử lý thiếu/malformed classification.
Phụ thuộc: `CoreBridge`, `NarratorLogic`, `pages/bridge.js`, `scripts/inventory_use.py`, `InventoryUseSmoke.java`.
Kiểm chứng: P03/P04 không hồi quy; P05 không còn delta; kiểm thử thiếu ID, ID giả, phủ định, trích dẫn, thần thức, lệnh ghép.

#### `engine/src/main/java/backrooms/CoreBridge.java` — sửa

Vai trò: cổng Java/JavaScript và tạo canon packet.
Vấn đề: nhận state trước khi có phân scope ký ức; chưa có điểm finalize dành cho lifecycle được sửa.
Tác động: `corePrompt`, `coreCandidate`, các export transaction liên quan.
Thay đổi: gọi phép chiếu state trước CanonRuntime2; xuất hook hoàn tất chỉ khi hợp đồng đã chốt. Giữ nguyên export cũ; mọi export mới phải ghi rõ là bổ sung.
Phụ thuộc: bridge web, helper mới và TeaVM build.
Kiểm chứng: prompt marker không lọt scope; ngoại lệ vẫn trả bridgeError; fixture cũ tiếp tục gọi được public exports.

#### `engine/src/main/java/backrooms/NarratorLogic.java` — sửa

Vai trò: dựng prompt, lọc output GM, commit lượt.
Vấn đề: luật viết cũ chưa phân biệt chi tiết narrative mới; không có delta kể chuyện được kiểm soát; lịch sử chỉ giới hạn số mục.
Tác động: `compactStateForPrompt`, `prompt`, `candidate`, `sanitizedFlags`.
Thay đổi: đưa trạng thái cảm xúc có hướng và cảnh hiện hành vào prompt; giữ canon/POV; chấp nhận delta hợp lệ; ngăn GM ghi trực tiếp namespace mới qua flags; giới hạn history đầu vào theo visit và dung lượng.
Phụ thuộc: helper, CoreBridge, facade, item policy và kiểm thử.
Kiểm chứng: named NPC không bị ép tình cảm; cứu NPC tạm không thêm item; delta sai không commit; luật combat/loot/reunion không đổi.

#### `engine/src/main/java/backrooms/NarrativePolicy.java` — file mới được đề xuất

Không có file này trong baseline. Chỉ tạo nếu cổng triển khai qua.

Vai trò dự kiến: một utility Java/JSON dùng chung cho hợp đồng kể chuyện, phép chiếu context, kiểm tra delta và phạm vi ký ức. Không có database, scheduler hoặc lời gọi AI riêng.
Phụ thuộc: org.json và các adapter đã có; không thêm thư viện.
Kiểm chứng: chạy cùng bộ fixture trong TeaVM và Android; scope, thiếu trường, schema lạ, giới hạn kích thước, tham chiếu NPC sai, quan hệ hai chiều không tự suy diễn.
Lưu ý: utility không được tự nhận quyền commit Core nếu giao dịch vẫn thuộc facade/bridge.

#### `pages/bridge.js` — sửa

Vai trò: queue, gọi Core/model, persistence và callback.
Vấn đề: nhiều đường trả sớm; persist cả bước trung gian; catch không cứu được checkpoint đã clear.
Tác động: `gameplay`, `call`, `persist`, `enqueue`; rà cả `continueAfterCombat`, Inventory và combat.
Thay đổi: phối hợp đúng lifecycle; chặn kết quả stale; không gọi AI thêm chỉ để cập nhật memory; tách lỗi trước/sau commit.
Kiểm chứng: timeout, malformed JSON, lỗi validator, persist thất bại, callback thất bại, request lặp, ván cũ trả lời muộn; snapshot không bị trộn.

#### `web/level-travel.js` — sửa có điều kiện

Vai trò: New Game, load, save, lấy Core snapshot.
Điểm cần giữ: save cũ không bị ép Level 0; không tự đổi hành vi reload-as-newgame chỉ vì audit có ý kiến khác.
Thay đổi dự kiến: chỉ phối hợp namespace/schema nếu cần tại load/save; hết scope phải dựa sự kiện Core, không dựa render.
Kiểm chứng: load cùng visit; load game cũ không có namespace; quay lại node cũ; lỗi decode không xóa save.
Không dùng file UI này làm nơi duy nhất để “quên” NPC.

#### `web/index.html` — sửa có điều kiện và giới hạn phạm vi

Vai trò: form, nhật ký, callback `backroomTurn`, render.
Thay đổi dự kiến: metadata có phạm vi cho mục nhật ký mới và phối hợp persistence cuối nếu thiết kế transaction yêu cầu. Không viết lại HUD.
Rủi ro: thay render có thể phá vị trí đọc đầu câu chuyện.
Kiểm chứng: `test_pages.cjs`, `test_action_feedback.cjs`; giữ hành vi cuộn đã sửa.
Không tự xóa lịch sử cũ để giảm bộ nhớ. Tối ưu hiển thị dài chỉ thực hiện nếu không thay đổi quyền đọc lại.

#### `web/knowledge/level_travel_policy.json` — sửa

Vai trò: startingIds, nodes và destinations.
Thay đổi: startingIds chỉ còn `LEVEL.NODE.0`; cập nhật ghi chú mô tả khởi đầu. Không thu hẹp destinations; không thay dữ liệu canon.
Kiểm chứng: P08 đã chứng minh tính khả thi trên Core web bằng fixture, gồm tải lại save ở Level 1. Cần test startup/reload và APK trước khi triển khai.
Phụ thuộc: `build_pages.py`, `debug_release.py`, `test_engine.cjs`, `test_pages.cjs`.

#### `scripts/inventory_use.py` — sửa, phần hook native hiện BLOCKED

Vai trò: vá facade, native bridge, biên dịch helper DEX.
Vấn đề: helper hiện chỉ có InventoryUsePolicy; appendPrompt được chèn sau khi prompt đã được tạo; chưa có hook finalize tương ứng thiết kế mới.
Tác động: `patch_facade`, `patch_bridge`, `helper_dex`.
Thay đổi: đưa utility chung vào cùng đường compile; giữ kiểm tra hash và replace_once; xác định hook trước context và cuối giao dịch từ smali thật.
Kiểm chứng: không trùng class, DEX load được, kiểm thử đầy đủ pipeline và kết quả giống web.
Không có patch smali dự kiến theo register hoặc offset mới chưa được đọc. Đây là điểm thiếu bằng chứng phải giải quyết trước khi viết code.

#### `scripts/debug_release.py` — sửa

Vai trò: dựng APK từ bản phục hồi và danh sách override.
Thay đổi: đưa policy khởi đầu mới và helper chung vào đúng gói; chỉ override asset cần thiết. Không thay toàn bộ index web vào APK một cách mù quáng.
Kiểm chứng: bytes policy và class đúng trong APK; asset ngoài allowlist không đổi; không vô tình phát hành APK.
Phụ thuộc: inventory_use, unit test packaging, Android smoke.

#### `scripts/prepare_web_engine.py`, `scripts/level_travel.py`, `scripts/PatchLevelTravel.java` — giữ đường hiện tại; chỉ sửa nếu bằng chứng parity yêu cầu

Vai trò: khôi phục Core và áp dụng patch travel riêng web.
Không đổi xác suất hoặc threshold mới. Trước tiên phải xác minh APK. Nếu native thiếu patch 4/50, cần một patch native đã đọc đúng bytecode và kiểm thử tương đương; không chỉ sửa nhãn JSON để che hành vi.
Giữ nguyên DEX gốc, hash đầu vào và kiểm tra số lượng instruction được thay.

#### `scripts/test_inventory_use.cjs` — sửa

Bổ sung regression cho lỗi sau phân loại `null`: canon validator, thiếu entityPreview, sai kiểu dữ liệu, lỗi trước/sau finish, retry.
Yêu cầu so sánh Core snapshot và state UI, không chỉ kiểm tra lời thông báo.

#### `scripts/test_engine.cjs` — sửa

Bổ sung startup cố định; load save ngoài Level 0; không đổi 4/50; metadata scope; no-clip từ mọi đường; replay.
Giữ toàn bộ test existing, không sửa assert để bỏ qua lỗi.

#### `scripts/test_pages.cjs`, `scripts/test_inventory_use_pages.cjs` — sửa

Bổ sung các hành vi nhìn thấy ở trình duyệt: thông báo bị chặn, pending/error, trạng thái sau reload/load và sự nhất quán giữa UI/Core.
Không coi một screenshot là bằng chứng cơ chế memory đúng.

#### `scripts/test_debug_release.py`, `scripts/InventoryUseSmoke.java` — sửa

Kiểm tra asset/helper thực sự nằm trong gói; mở rộng smoke để kiểm tra lifecycle `null → lỗi validator → cancel`, save/load và phạm vi.
Test Android hiện tại chỉ load native bridge để kiểm tra kiểu DEX, không chạy đầy đủ lambda kể chuyện. Phần end-to-end mới cần môi trường native và vị trí gọi thật đã xác minh.

#### `scripts/test_narrative_policy.cjs` — file kiểm thử mới được đề xuất

Các fixture cho 5 phần, kích thước hữu hạn, scope quay lại node, nhận thức sai khác sự thật, quan hệ có hướng, Non-ID không tạo ID, NPC không tự thành follower và cứu người không bị đảo ngược.
Có cả test nhận output đối nghịch có chủ đích; không dùng toàn happy path.

#### `.github/workflows/inventory-use-qa.yml`, `.github/workflows/pages.yml` — sửa sau khi test tương ứng tồn tại

Chạy thêm suite chung và regression trước upload/deploy. Không bỏ test hiện hành.
Không kích hoạt deploy chỉ để lấy kết quả CI. Thiết kế workflow nondeploy/PR phải chạy những test mới; không dùng secret production cho fixture.
Run đã xanh trước audit không phải bằng chứng cho test mới.

#### Những phần giữ nguyên

`apk-original/**`, `Legacy/knowledge/**`, canon nhân vật, `engine/pom.xml`, cấu hình provider/API, tài nguyên ảnh/âm thanh, logic chiến đấu và mức thưởng. Không đổi những phần này chỉ vì tiện sửa. DEX gốc bất biến; mọi patch sinh ra trong build.

### C6. Thứ tự thực hiện và điều kiện hoàn thành

**Bước 0. Đóng các khoảng trống bằng chứng trước cổng.**
Mục tiêu: có danh sách chính xác điểm tạo prompt, đường success/error và nơi ghi save native.
Dữ liệu cần: DEX đúng hash, smali đầy đủ GameBridge/SaveRepository liên quan, test fixture APK.
Thực hiện: dùng tool phục hồi đã có trong repository, đọc toàn bộ phương thức mục tiêu và đối chiếu call sites. Xác minh quy tắc travel của APK.
Hoàn thành khi không phải đoán register, callback, serializer hoặc vị trí commit.
Trạng thái hiện tại: BLOCKED, chưa đủ bằng chứng native trong phiên này.

**Bước 1. Sửa nền giao dịch sau khi Gate cho phép.**
File: InventoryUsePolicy, CoreBridge, bridge web, patch native, test inventory/smoke.
Thực hiện: checkpoint sống tới điểm hoàn tất hợp lệ; hủy tại mọi lỗi trước đó; ngăn bản tạm trở thành save chính.
Kết quả: P05 không tạo băng gạc, command receipt hoặc memory ngoài lượt.
Test: ma trận lỗi ở từng chặng; hai request; stale run; lỗi persistence/callback; ID redirect vẫn giữ nguyên.
Hoàn thành: cùng các bất biến đạt ở web và APK.

**Bước 2. Thêm namespace và utility dùng chung.**
File: NarrativePolicy mới, NarratorLogic, CoreBridge, test narrative mới.
Thực hiện: schema additive; host giữ scope identity; allowlist delta; số lượng và byte budget.
Kết quả: scene/quan hệ riêng, không duplicate persistent store.
Test: encode/decode v3, thiếu schema, dữ liệu sai, key từ visit cũ, quá giới hạn.
Hoàn thành: dữ liệu hợp lệ giữ qua save/load, dữ liệu lỗi không commit.

**Bước 3. Khóa phạm vi context.**
File: helper, CoreBridge, NarratorLogic, hook native đã xác minh.
Thực hiện: lọc trước mọi context builder; không cho One-Time đi vào survivorRegistry; lịch sử chỉ lấy đúng visit và ngân sách.
Kết quả: cùng Level nhớ, chuyển Level quên, quay lại node không nhớ lại.
Test: marker kiểm thử trên toàn request gửi provider, không chỉ kiểm tra một object trung gian.
Hoàn thành: không có marker cũ trong request; canon/follower vẫn còn.

**Bước 4. Tích hợp Storytelling, Emotion, One-Time NPC và Tragedy.**
File: helper, NarratorLogic và shared native hook.
Thực hiện: tái sử dụng kết quả survivor; một scene mới khi có cơ hội hợp lệ; kết thúc cảnh không có nghĩa xóa ký ức ngay trong Level; quan hệ NPC với nhau không suy thành yêu Cao Minh.
Kết quả: cảnh có trạng thái và phản ứng nhưng không sinh quest, loot hoặc follower ngoài Core.
Test: NPC từ chối, người chơi bỏ đi, cứu người, quan hệ không đối xứng, no-clip giữa cảnh, encounter cùng lượt combat.
Hoàn thành: không cướp điều khiển người chơi, không ép kết cục chết để giữ tragedy.

**Bước 5. Cho phép Non-ID Item đúng phạm vi.**
File: InventoryUsePolicy, NarrativePolicy, NarratorLogic, tests.
Thực hiện: item ID hợp lệ giữ đường Inventory; chi tiết không ID do người chơi sáng tác được kể và cập nhật scene, không đăng ký item.
Test: Hồi Hoàn Đan cứu người vợ; câu hỏi sau đó nhớ đúng; Almond Water qua chat bị chặn; phủ định/trích dẫn/năng lực không bị nhầm; lệnh ghép không commit một nửa.
Hoàn thành: narrative outcome đúng, inventory/HP/EXP không bị GM tự ghi ngoài Core.

**Bước 6. Khởi đầu Level 0 và đóng gói đồng nhất.**
File: travel policy, debug_release, test engine/pages/packaging.
Thực hiện: chỉ thu hẹp startingIds; giữ destinations và save cũ; kiểm tra bytes gói APK.
Hoàn thành: các giá trị RNG thử đều khởi đầu Level 0, save Level khác vẫn load đúng, 4/50 giữ nguyên trên cả hai đường.

**Bước 7. Kiểm thử kết hợp, văn phong và phiên dài.**
File: các suite có sẵn, suite narrative mới, workflows phù hợp.
Thực hiện: chạy build, tests, APK, trình duyệt; kiểm tra các mẫu model thật với cùng input để đối chiếu trước/sau.
Kết quả: correctness và chất lượng văn học có bằng chứng tách biệt.
Hoàn thành: không có blocker; không tăng vô hạn namespace NPC; không nhầm 100 lượt tổng hợp với hàng chục giờ chơi thật.

**Bước 8. Khôi phục có kiểm soát.**
Trước activation: giữ bản sao save và nhận diện build. Không đổi saveVersion nếu không cần.
Rollback tính năng: tắt nhánh narrative bằng cấu hình năng lực đã kiểm thử, vẫn giữ sửa lỗi giao dịch; không dùng feature flag để lờ dữ liệu lỗi.
Rollback binary: kiểm tra đọc save bằng baseline, đặc biệt flags mở rộng và log; tạo bản save tương thích riêng nếu cần, không ghi đè bản có tiến trình mới. Nếu chưa chứng minh bảo toàn tiến trình thì không hứa rollback không mất dữ liệu.
Không merge/release/deploy trong phạm vi audit này.

## D. Devil's Advocate Verdict

| Phản biện | Mức | Đáp án thiết kế / bằng chứng | Trạng thái |
|---|---|---|---|
| Có thật sự hoàn tác mọi thất bại sau AI? | BLOCKER | P05 bác bỏ baseline. Đề xuất giữ checkpoint, nhưng điểm finalize và persist native chưa được xác minh đầy đủ | Mở |
| Một helper chung có thật sự lọc được native prompt trước khi dữ liệu cũ lọt vào? | BLOCKER | Hook appendPrompt hiện tại ở sau khi prompt đã hình thành. Không chấp nhận append “hãy quên” thay cho lọc dữ liệu | Mở |
| Chỉ xóa NPC khỏi registry có đủ? | MAJOR | P12 bác bỏ. Thiết kế đã đổi: namespace tạm, không đăng ký lâu dài, kiểm tra toàn request | Đã xử lý ở thiết kế; cần test tích hợp |
| Scope theo Level ID hay revision có đúng không? | MAJOR | P11 bác bỏ cả hai cách dùng đơn lẻ. Dùng arrival turnId + runId | Có bằng chứng cho primitive |
| Non-ID có cho phép sửa trực tiếp Core không? | MAJOR | Tách delta narrative khỏi numeric state; không tạo ID; item đã đăng ký vẫn theo Inventory | Thiết kế rõ; chưa triển khai |
| No-clip có cắt ngang cảnh bi kịch? | MAJOR | Có thể xảy ra theo luật hiện có. Không bí mật giữ chân người chơi; kết thúc đúng scope, không tái tạo NPC ở đích | Đánh đổi được nêu rõ; cần test |
| Bộ nhớ theo Level có chắc luôn nhỏ nếu ở mãi một Level? | MAJOR | Không. Cần budget và ngừng mở cảnh tạm khi đầy, không xóa ký ức cần nhớ giữa Level | Chính sách thử nghiệm; cần đo |
| 100 lượt tổng hợp có chứng minh trải nghiệm hàng chục giờ? | MAJOR | Không; log/receipts vẫn tăng. Không xóa receipts tùy tiện vì có vai trò chống xử lý lại | Cần kiểm thử dài hơn và thiết bị thật |
| Có thể hứa văn hay, không bao giờ lặp chỉ bằng schema? | MAJOR | Không. Schema giữ sự thật, đánh giá văn cần mẫu model thật; ID mới không bảo đảm lời văn hoàn toàn khác | Chưa đánh giá model |
| Cần database/multi-agent mới không? | MINOR | P01 chứng minh persistence sẵn dùng; không có lợi ích tương xứng của các lớp mới đó | Loại khỏi thiết kế |

**Kết quả Quality Gate: BLOCKED.**

Đã đạt: xác minh repository/commit; truy vết đường web và các lớp Core liên quan; có lỗi tái hiện; so sánh ba hướng; xác định bất biến; có thiết kế cục bộ, phạm vi file và ma trận kiểm thử.

Chưa đạt: blueprint native chính xác tại hai ranh giới quan trọng, bằng chứng tương thích native đầy đủ, và phương án commit/persistence cuối cùng đã được đối chiếu trên native. Không biến các mục này thành “đã xong” bằng lời giải thích.

Một lỗi hiện có không tự làm mọi thiết kế bị cấm triển khai vĩnh viễn. Blocker ở đây là chưa đủ bằng chứng để chốt cách sửa đúng trên cả hai host, không phải yêu cầu phải sửa sản phẩm trước khi được phép sửa.

## E. Implementation Results

Không file sản phẩm nào đã được thay đổi. Không có branch mới, commit, PR, merge, release hoặc production deployment từ phiên này.

Những file được tạo chỉ nằm trong thư mục kiểm toán độc lập:
* Harness Node và các fixture chẩn đoán.
* Probe trình duyệt.
* Báo cáo, kết quả JSON, log và trích đoạn Core phục vụ kiểm chứng.

Các file kiểm toán không được cấy vào repository hoặc artifact baseline. Chúng không phải bản triển khai năm tính năng.

## F. Verification

### Đã thực hiện

12 probe Core hoàn thành, chạy Core thật từ artifact đúng commit:
* P01: flags sống qua Core save/load.
* P02: flags/log chưa có scope vẫn vào prompt sau travel.
* P03: chặn ID item hoàn tác đúng.
* P04: lỗi transport hoàn tác đúng.
* P05: lỗi sau classification không hoàn tác đủ, đã xác nhận.
* P06: luật prompt cấm Non-ID có trong request thật.
* P07: đo kích thước prompt đầu vào.
* P08: fixture policy Level 0 vẫn travel và load save khác Level đúng.
* P09: đo phạm vi reducer quan hệ hiện có.
* P10: 100 lượt tổng hợp, đo kích thước state/log/receipts.
* P11: primitive visit key từ arrival event.
* P12: registry bị sao chép sang discoveries.

“Hoàn thành probe” không có nghĩa game vượt qua tất cả yêu cầu. Một số probe được viết để tái hiện lỗi và đã tìm thấy lỗi.

### Chưa thực hiện hoặc bị chặn

Clone trực tiếp thất bại do DNS. Lấy artifact qua connector thành công và đã đối chiếu hash.

Môi trường không có Maven, adb, sdkmanager hay emulator. Không chạy build mới hoặc Android runtime trong phiên này.

Probe trình duyệt:
1. Playwright không có executable bundled theo phiên bản mặc định.
2. Đã chuyển sang Chromium hệ thống có thật.
3. Chromium khởi động được nhưng chặn điều hướng localhost với `ERR_BLOCKED_BY_ADMINISTRATOR`.
Không tuyên bố UI test đã chạy thành công.

Không gọi model thật để chấm văn. AI response trong các probe là fixture. Không xác minh độ trễ API, chi phí token, pin/RAM trên điện thoại hoặc phiên chơi thực hàng chục giờ.

### CI đã tồn tại

Run `41294527424`, job `124812471292` của commit baseline có kết luận `success`. Đây là kết quả đã có trước audit, không phải CI cho thay đổi mới. Test Android hiện có chưa chứng minh toàn bộ native GM pipeline hoặc các failure injection mới.

## G. Final Status

**BLOCKED.**

Có thể phát triển năm phần bằng cải tiến cục bộ; không cần kết luận phải có kiến trúc AAA hoặc viết lại engine. Tuy nhiên, không được bắt đầu bản sửa tổng thể khi chưa xác minh ranh giới prompt và commit của Android.

Ưu tiên kỹ thuật đã được chứng minh: hoàn thiện giao dịch lượt chơi và hợp đồng ký ức trước; sau đó mới ghép Storytelling, Emotion, One-Time NPC, Tragedy và Non-ID Item. Chỉ đổi prompt ngay lúc này sẽ bỏ qua lỗi dữ liệu thật.

Bằng chứng còn thiếu trọng yếu: đường native đầy đủ và kiểm thử tích hợp tương ứng. Rủi ro còn lại: state không nhất quán khi lỗi giữa lượt, ký ức tạm trở thành lâu dài, và khác biệt hành vi web/APK.
