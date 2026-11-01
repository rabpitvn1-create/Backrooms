APK Android debug cá nhân, phiên bản 1.0.0.3, versionCode 90000004.

* Giữ các thay đổi PR #9 và tích hợp PR #10 đã merge, sửa lỗi lượt chơi bị chặn bởi metadata cảm xúc NPC vắng mặt.
* Chặn việc kể NPC tái xuất khi chưa có xác nhận từ Core; không thay đổi luật gặp NPC.
* Cải thiện toàn vẹn giao dịch: lỗi trước commit hoàn tác trạng thái, phản hồi AI cũ không ghi đè ván mới, và lỗi hiển thị sau commit không hủy lượt đã lưu.
* Bổ sung cảnh truyện có ký ức trong phạm vi từng lần ghé Level, cảm xúc riêng của NPC và quan hệ có hướng.
* Cho phép gặp NPC One-Time khi Core xác nhận. NPC không tự động vào Party, không tự tái xuất sau khi kết thúc cảnh.
* Vật phẩm tự sáng tác không có item ID chỉ tạo hiệu ứng trong lời kể, không tự ý thay đổi Inventory hoặc chỉ số gameplay.
* Vật phẩm có ID chỉ sử dụng trong Inventory. Lệnh yêu cầu dùng vật phẩm trong Game Master được chuyển hướng về kho đồ, không tiêu thụ lượt.
* New Game bắt đầu tại Level 0. No-clip theo bốn lần thành công liên tiếp với xác suất 50/50 mỗi lượt hợp lệ, thất bại đặt lại streak.
* Cải thiện rollback khi xử lý lượt thất bại và bảo vệ các cờ encounter của Game Core khỏi thay đổi không được phép từ AI.
* Giữ bộ bốn ảnh Cao Minh gồm avatar, overlay chiến đấu, overlay khám phá và ma kiếm, với dữ liệu ảnh ngoại tuyến sau khi đồng bộ thành công.
* Giữ cấu hình sáu key chính cho bản APK debug. Chỉ phát hành sau khi workflow xác minh build, chữ ký, thử khởi chạy Android và kết nối mô hình.
* Đây là APK debug xây dựng từ bytecode gốc đã phục hồi. Kết quả emulator không thay thế kiểm thử trên thiết bị Android thực.
