# BÁO CÁO ĐẶC TẢ DỰ ÁN: GRIDCRAFT MOBILE (PHIÊN BẢN CAI THẦU CÔNG TRÌNH)
> **Thiết bị mục tiêu:** Samsung Galaxy S23 Ultra (Màn hình 6.8", Bút S-Pen, One UI)  
> **Đối tượng người dùng:** Cai thầu, thợ xây dựng, người dùng Low-Tech (ít rành công nghệ)  
> **Nền tảng lõi:** Rust Engine / WebAssembly / PWA tương thích Microsoft Excel (.xlsx)

---

## 1. TỔNG QUAN DỰ ÁN (PROJECT OVERVIEW)

### 1.1. Bối cảnh & Vấn đề
- **Thực tế:** Các cai thầu xây dựng thường quản lý từ 5 đến 30 thợ công nhật. Việc ghi chép chấm công, tạm ứng tiền ăn/xăng giữa tuần và tính toán vật tư hiện nay chủ yếu dùng **sổ tay giấy** (dễ rách, mất, ướt nước, tính toán thủ công hay sai sót) hoặc cố gắng dùng **Microsoft Excel trên điện thoại** (giao diện quá nhỏ, rối mắt, khó thao tác bằng ngón tay ngoài công trường).
- **Mục tiêu:** Xây dựng một ứng dụng di động **siêu đơn giản, trực quan, 1 chạm là xong**, thiết kế chuyên biệt cho chiếc điện thoại **Samsung Galaxy S23 Ultra**, giải quyết triệt để bài toán: **Chấm công ➔ Quản lý tiền ứng có ký nhận S-Pen ➔ Tính lương tự động ➔ Quản lý vật tư ➔ Xuất file Excel chuẩn khi cần**.

---

## 2. CHÂN DUNG NGƯỜI DÙNG & BỐI CẢNH SỬ DỤNG (USER PERSONA & CONTEXT)

| Yếu tố | Đặc điểm thực tế | Yêu cầu đối với phần mềm |
|---|---|---|
| **Trình độ công nghệ (Low-Tech)** | Sợ các ứng dụng nhiều nút bấm, sợ bảng tính chằng chịt, không biết gõ công thức (`=SUM`, `=VLOOKUP`...). | Giao diện phải cực kỳ tinh giản, chữ to rõ ràng, tự động tính toán 100%, không bắt người dùng nhập công thức. |
| **Môi trường làm việc** | Ngoài trời công trường, chói nắng, tay dính bụi cát hoặc đeo găng tay lao động. | Độ tương phản cao, nút bấm to bản (> 56px), dễ bấm chính xác không bị trượt. |
| **Tâm lý nhạy cảm về tiền bạc** | Thợ hay ứng tiền lắt nhắt giữa tuần, đến cuối tháng nhận lương hay cãi nhau vì nhớ nhầm số tiền đã ứng. | Phải có cơ chế **chữ ký số tại chỗ** để thợ ký xác nhận đã nhận tiền mặt. |

---

## 3. ĐẶC THÙ THIẾT KẾ CHO SAMSUNG GALAXY S23 ULTRA

1. **Màn hình lớn 6.8 inch (Tỷ lệ 19.3:9 - Dài và Hẹp):**
   - Áp dụng triết lý **Samsung One UI**:
     - **2/3 phía trên:** Dành cho việc hiển thị (Viewing Area) — xem số liệu, tên công trình, tổng quan.
     - **1/3 phía dưới:** Dành cho việc thao tác ngón cái (Interaction Area) — các nút bấm quan trọng, chuyển tab, bàn phím số dồn hết xuống dưới để cầm 1 tay vẫn với tới.
2. **Vũ khí độc quyền - Bút S-Pen:**
   - **Ký nhận tiền mặt:** Thợ nhận tiền ứng hoặc lương cầm bút S-Pen ký trực tiếp lên màn hình (Digital Signature).
   - **Chấm công chính xác:** Dùng đầu bút S-Pen chấm chọn thợ cực nhạy, không lo tay dính bụi cát làm mờ màn hình.
3. **Màn hình Dynamic AMOLED 2X:**
   - Chế độ **AMOLED Dark Mode** (nền đen thuần túy) giúp tiết kiệm pin tối đa và hiển thị sắc nét, không bị lóa khi đứng dưới trời nắng công trường.

---

## 4. CÁC PHÂN HỆ NGHIỆP VỤ CỐT LÕI (CORE MODULES)

### Module 1: Chấm Công (Attendance)
- **Danh sách đội thợ:** Tên thợ, vai trò (Thợ chính, Thợ phụ, Thợ sắt, Thợ điện...), đơn giá lương 1 ngày công.
- **Thao tác 1 chạm:**
  - Nút thần thánh: **«Điểm danh cả đội (1 Công)»** — Sáng ra bấm 1 phát là xong cho cả 10-20 thợ.
  - Từng thợ: Nút chuyển nhanh giữa 4 trạng thái to rõ: `1.0` (Cả ngày) | `0.5` (Nửa ngày) | `1.5` (Tăng ca) | `0` (Nghỉ).
- **Bộ chọn ngày:** Xem lại lịch sử các ngày trước hoặc chấm công bù.

### Module 2: Sổ Tạm Ứng & Vay Tiền (Advances & S-Pen Signature)
- Ghi nhận các khoản thợ ứng tiền giữa tuần/tháng.
- **Bàn phím tiền tệ thông minh:** Các phím tắt nhanh `+100k`, `+200k`, `+500k`, `+1 Triệu`, `+2 Triệu`.
- **Khung ký nhận S-Pen:** Thợ ký tên xác nhận bằng bút cảm ứng. Có chữ ký lưu kèm phiếu ứng để đối soát.

### Module 3: Tính Lương & Quyết Toán (Payroll & Zalo Sharing)
- **Công thức tự động:**
  $$\text{Thực lĩnh} = (\text{Tổng số ngày công} \times \text{Đơn giá lương}) - \text{Tổng tiền đã ứng}$$
- **Nút gửi Zalo 1 chạm:** Tự động định dạng tin nhắn phiếu lương rõ ràng (Ngày công, Đơn giá, Lương gộp, Đã trừ tiền ứng bao nhiêu, Còn lại bao nhiêu) để gửi thẳng qua Zalo cho thợ hoặc gửi cho chủ nhà duyệt chi.

### Module 4: Vật Liệu Xây Dựng (Materials Tracking)
- Ghi chép vật tư nhập về công trình: Xi măng, cát tô, đá 1x2, sắt thép, gạch ống...
- Ghi rõ: Số lượng × Đơn giá = Thành tiền.
- Phân loại trạng thái thanh toán: **Đã trả tiền mặt** hay **Đang nợ gối đầu đại lý VLXD**.

### Module 5: Sổ Quỹ Thu Chi & Tương Thích Excel
- **Cân đối dòng tiền:**
  $$\text{Tồn quỹ tiền mặt} = \text{Tiền chủ nhà ứng} - \text{Tiền trả lương/ứng thợ} - \text{Tiền vật tư đã trả} - \text{Chi phí lặt vặt}$$
- **Xuất file Excel (.xlsx):** Xuất toàn bộ dữ liệu ra bảng tính Excel chuẩn mực để gửi kế toán hoặc mở trên máy tính.

---

## 5. ĐÁNH GIÁ GIAO DIỆN HIỆN TẠI & ĐỊNH HƯỚNG THIẾT KẾ LẠI (DESIGN CRITIQUE)

### 5.1. Điểm chưa tốt ở bản mẫu thử nghiệm ban đầu (Feedback người dùng)
- **Quá nhiều thông tin cùng lúc:** Nhìn vào màn hình thấy thẻ card, nút bấm, chữ số xếp dày đặc làm người dùng cảm thấy "rối mắt" và căng thẳng nhận thức.
- **Phân cấp màu sắc chưa gãy gọn:** Nhiều khối màu (xanh lá, vàng hổ phách, xanh dương, đỏ) xuất hiện cùng lúc làm giảm độ tập trung.
- **Thiếu khoảng thở (White-space / Breathing room):** Các thành phần cần được tinh gọn, giấu bớt các chi tiết phụ, chỉ hiển thị những gì quan trọng nhất ở màn hình chính.

### 5.2. Định hướng thiết kế mới (Cho ChatGPT & UI Designer)
1. **Quy tắc "1 Màn hình — 1 Mục tiêu chính":**
   - Màn hình Chấm công chỉ tập trung vào việc: Ai đi làm, ai nghỉ (chữ to, icon rõ ràng).
   - Màn hình Ứng tiền chỉ tập trung vào: Chọn thợ ➔ Nhập số tiền ➔ Ký tên.
2. **Tối giản hóa thông tin (Progressive Disclosure):**
   - Chi tiết lịch sử, số điện thoại, ngày tham gia... nên giấu trong nút "Xem thêm" hoặc chạm vào thẻ mới mở ra, không phơi bày hết lên màn hình chính.
3. **Typography & Nút bấm chuẩn S23 Ultra:**
   - Font chữ lớn (Headline 20–24px, Số tiền 22–28px font Mono đậm nét).
   - Nút hành động chính (Primary Action Button) phải nằm ở góc dưới bên phải hoặc toàn chiều ngang đáy màn hình để ngón cái bấm tự nhiên nhất.
4. **Bảng màu tinh giản (Chỉ dùng 2–3 màu chủ đạo):**
   - Nền: Đen sâu AMOLED (`#000000` hoặc `#0f172a`).
   - Màu nhấn hành động: Xanh ngọc công trình (Emerald/Teal) cho trạng thái tốt / tiền vào; Màu hổ phách (Amber) cho tiền ứng / chi phí.
   - Chữ: Trắng độ tương phản cao, xám nhạt cho thông tin phụ.

---

## 6. PROMPT MẪU DÀNH CHO BẠN GỬI VÀO CHATGPT

*(Bạn có thể sao chép đoạn prompt dưới đây và dán thẳng vào ChatGPT để yêu cầu lên ý tưởng layout/wireframe mới)*

```text
Tôi đang xây dựng một ứng dụng di động bảng tính quản lý công trình xây dựng (dành cho Cai thầu / Nhà thầu xây dựng), sử dụng trên điện thoại Samsung Galaxy S23 Ultra (màn hình lớn 6.8 inch, có bút S-Pen).

Đặc thù người dùng: Low-Tech (không rành công nghệ, sợ nhìn bảng tính phức tạp, thao tác ngoài công trường bụi bặm, chói nắng).
Tôi muốn bạn đóng vai trò là một chuyên gia UI/UX hàng đầu về Mobile App (chuẩn Samsung One UI):

1. Hãy thiết kế lại giao diện sao cho CỰC KỲ DỄ NHÌN, KHÔNG RỐI MẮT, TỐI GIẢN NHẤT CÓ THỂ.
2. Ứng dụng gồm 4 màn hình chính:
   - Màn hình 1: Chấm công đội thợ (có nút "Điểm danh cả đội 1 công", từng thợ chuyển nhanh 1 công / nửa công / nghỉ).
   - Màn hình 2: Sổ tạm ứng tiền (chọn thợ, nút tiền nhanh +200k, +500k, +1tr, khung cho thợ ký tên bằng bút S-Pen).
   - Màn hình 3: Bảng lương tự động tính (Tổng công x Giá công - Tiền đã ứng = Thực lĩnh; có nút gửi Zalo phiếu lương cho thợ).
   - Màn hình 4: Sổ vật tư & Quỹ tiền mặt (Xi măng, cát đá, nợ đại lý, tiền chủ nhà ứng còn lại).
3. Hãy mô tả chi tiết bố cục từng màn hình (Wireframe mô tả bằng text hoặc mã HTML/CSS tinh gọn):
   - Đâu là vùng hiển thị (ở trên)?
   - Đâu là vùng tương tác ngón cái (ở dưới)?
   - Làm thế nào để giảm thiểu số nút bấm trên màn hình nhưng vẫn đủ chức năng?
```

---
*Bản báo cáo này được biên soạn bởi Antigravity Engine dựa trên dự án GridCraft.*
