# Kiểm chứng website bằng YOLO và dữ liệu runtime

YOLO nhận diện thành phần trên screenshot; kết quả nghiệp vụ lấy từ DOM và dữ liệu có thẩm quyền. Lỗi runtime lấy riêng từ CDP: exception, console error, request thất bại, HTTP lỗi và chuyển hướng. Không thay unit test, kiểm tra quyền, số tiền hoặc transaction bằng độ tin cậy của mô hình.

## Chạy từ workspace root

Danh sách ca: [cases.json](../../tools/visual-tests/cases.json). Bộ phân tích: [analyze.py](../../tools/visual-tests/analyze.py). Không thêm dependency vào frontend/backend.

Chuẩn bị môi trường riêng sau khi được phép cài dependency:

```powershell
python -m venv tools/visual-tests/.venv
tools/visual-tests/.venv/Scripts/python.exe -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
tools/visual-tests/.venv/Scripts/python.exe -m pip install ultralytics
```

Tải `yoloe-26n-seg.pt` từ link model chính thức trong [Ultralytics YOLOE](https://docs.ultralytics.com/models/yoloe/), đặt tại `tools/visual-tests/models/`. Môi trường, weights và cache được bỏ qua bởi Git. Không tự tải dependency hoặc weights khi phân tích; không dùng cloud inference.

## Skill dùng chung cho agent

Đã cài 8 skill từ [ultralytics/skills](https://github.com/ultralytics/skills): `yolo`, `yolo-models`, `yolo-datasets`, `yolo-training`, `yolo-tuning`, `yolo-inference`, `yolo-export`, `platform-cli`.

Nguồn dùng chung: `C:/Users/Dangminhdev0403/.agents/skills/`. Codex đọc qua junction trong `C:/Users/Dangminhdev0403/.codex/skills/`. Antigravity đọc cùng nội dung qua `C:/Users/Dangminhdev0403/.gemini/config/skills/` và `C:/Users/Dangminhdev0403/.gemini/antigravity-cli/skills/`; đường dẫn legacy `C:/Users/Dangminhdev0403/.gemini/antigravity/skills/` cũng đã liên kết. Đã đối chiếu hash cả 8 `SKILL.md` trên từng đường dẫn; không sửa global rule hoặc credential. Skill mới khả dụng từ lượt agent tiếp theo; nếu ứng dụng đang giữ catalog cũ, mở phiên mới/reload ứng dụng.

Các skill là hướng dẫn. Bộ thực thi YOLO vẫn nằm riêng trong workspace. Script phân tích đặt config trong `.cache/`, tắt sync analytics và cơ chế tự cài dependency; model đọc từ file local. Không gửi screenshot lên Ultralytics Platform.

## Lệnh kiểm chứng

```powershell
tools/visual-tests/.venv/Scripts/python.exe tools/visual-tests/analyze.py --cases tools/visual-tests/cases.json --evidence docs/audits/evidence/2026-10-31-yolo-runtime --output docs/audits/2026-10-31-yolo-runtime-report.md --model tools/visual-tests/models/yoloe-26n-seg.pt
```

Nếu chưa cài được YOLO, vẫn tổng hợp assertion và runtime; phần visual phải là `GAP`:

```powershell
python tools/visual-tests/analyze.py --cases tools/visual-tests/cases.json --evidence docs/audits/evidence/2026-10-31-yolo-runtime --output docs/audits/2026-10-31-yolo-runtime-report.md --metadata-only
python -m unittest discover -s tools/visual-tests -p test_analyze.py
```

## Thu bằng chứng và thêm case

Luồng áp dụng cho cả Codex và Antigravity: **đọc case → thực hiện từng bước trên website bằng CUA → đối chiếu assertion → kết thúc capture runtime → chạy YOLO local → đọc ảnh đánh dấu → nhận xét từng case → gửi báo cáo cho người dùng**. CLI `analyze.py` chỉ phân tích capture, không điều khiển browser. Chạy lại CLI không được gọi là một lượt browser mới.

Mỗi case trong manifest có `steps` theo thứ tự và `check_sources` (nguồn + kỳ vọng của từng assertion). Capture cần `completed_steps` đúng thứ tự, cùng `observations` ghi nguồn và giá trị quan sát; chỉ ghi `checks: true` mà không có observation thì GAP. Không lấy confidence của YOLO làm nguồn chứng minh giá, tổng, quyền hoặc trạng thái giao dịch. Với ca chưa thực thi, để thiếu capture/GAP; không chép steps dự kiến thành steps hoàn thành.

Các mô tả bước/observation bổ sung cho 4 capture cũ trong lượt chuẩn hóa này được dựng lại từ trace thao tác trước, có nhãn `steps_origin`; giữ nguyên `captured_at`. Chúng không phải log tự động có timestamp của từng bước. Lượt capture mới phải ghi observation ngay khi thực hiện.

1. Thêm entry có ID duy nhất vào manifest: tên ca, các assertion bắt buộc, yêu cầu visual và lỗi runtime dự kiến (nếu có). Mỗi ngoại lệ runtime phải có loại, endpoint chính xác, status HTTP khi áp dụng và lý do.
2. Thực hiện thao tác bằng CUA trên website thật. Bắt đầu thu CDP trước thao tác; kết thúc sau khi trạng thái cuối đã hiển thị. Nếu event bị cắt/mất hoặc bước chưa hoàn tất, đặt `runtime.complete: false`. Không ghi token, mật khẩu, cookie value, request/response body hoặc headers.
3. Lưu screenshot và `<ID>.json` trong cùng thư mục evidence. `checks` chỉ chứa boolean đã đối chiếu, không suy ra từ việc thao tác không ném lỗi. Thiếu assertion không được tính PASS.
4. Chuẩn bị ảnh tham chiếu riêng và box mẫu của thành phần mục tiêu. Box dùng tọa độ pixel ảnh; `labels` theo thứ tự `bboxes`. Ảnh mục tiêu phải là capture khác ảnh tham chiếu. Không dùng YOLO đọc giá hoặc suy luận trạng thái thanh toán.
5. Chạy bộ phân tích để xuất Markdown + JSON. Ca mới chưa có bằng chứng hiển thị `GAP`; không lấy bằng chứng cũ để giả lập lượt chạy mới.

Sau khi chạy, báo cáo bắt buộc có: luồng/URL/thời điểm capture; kỳ vọng và observation kèm nguồn; ảnh gốc + capture JSON + ảnh YOLO; confidence/box/IoU và vùng bỏ sót; lỗi/redirect runtime có endpoint/status; nhận xét từng case cùng bước xác minh tiếp. Nhận xét được suy ra từ các nguồn này, không phải văn bản do mô hình YOLO sinh ra.

`assessment.verdict` tách khỏi kết quả gate: `PASS_SCOPED` = đạt trong phạm vi; `FAIL` = assertion sai hoặc lỗi runtime ngoài request hủy; `NEEDS_REVIEW` = có request hủy chưa rõ nguyên nhân; `INCOMPLETE` = thiếu bằng chứng. Request `canceled=true` + `net::ERR_ABORTED` vẫn làm strict gate FAIL và giữ nguyên exit 1, nhưng nhận xét phải là cần kiểm tra, không mặc nhiên gọi đó là bug sản phẩm. YOLO có detection đúng vẫn không được ghi đè assertion tiền sai.

Ví dụ cấu trúc capture (giá trị boolean dưới đây chỉ minh họa format):

```json
{
  "version": 1,
  "case_id": "AUTH_VALID",
  "captured_at": "ISO-8601",
  "url": "https://vietsage.localhost/owner/dashboard",
  "screenshot": "AUTH_VALID.jpg",
  "checks": {"owner_dashboard": true, "logout_visible": true, "document_200": true},
  "runtime": {"complete": true, "truncated": false, "events": [], "documents": [{"path": "/owner/dashboard", "status": 200}]},
  "visual": {
    "reference": "AUTH_VALID-reference.jpg",
    "bboxes": [[10, 10, 100, 60]],
    "labels": ["logout_button"],
    "targets": [{"label": "logout_button", "box": [10, 10, 100, 60]}]
  }
}
```

## Đọc kết quả

- `PASS`: chỉ các assertion, cửa sổ runtime và nhận diện thành phần đã chạy trong ca đó. Không có nghĩa toàn hệ thống không lỗi.
- `FAIL`: assertion sai hoặc runtime lỗi ngoài ngoại lệ khai báo. Báo endpoint/status/message đã làm sạch để tái hiện.
- `GAP`: chưa chạy, thiếu bằng chứng, telemetry không đầy đủ hoặc YOLO chưa nhận diện được. Mô hình chưa được hiệu chỉnh cho UI nên bỏ sót detection không tự kết luận website lỗi.
- Exit code: `0` khi tất cả ca PASS; `1` khi có FAIL; `2` khi chưa có FAIL nhưng còn GAP.

`Network.loadingFailed` giữ cả cờ `canceled`. Request bị hủy vẫn được báo để xem xét và mặc định làm runtime gate FAIL; riêng `net::ERR_ABORTED` chưa đủ chứng minh lỗi sản phẩm (có thể do navigation/unmount). Chưa có lý do được xác minh thì không thêm ngoại lệ để làm xanh báo cáo. Redirect Socket.IO được liệt kê như dữ liệu chẩn đoán; HTTP 308 tự nó chưa chứng minh mất realtime.

YOLOE visual prompting dùng ảnh mẫu và không cần text encoder/CLIP. Model trả `object0`, `object1` theo ID tạm; bộ phân tích ánh xạ lại `labels`, lưu confidence/box và ảnh đánh dấu. Ngưỡng ban đầu `confidence ≥ 0.25`, IoU với vùng mục tiêu `≥ 0.3` chỉ là kiểm chứng nhận diện thử nghiệm; chưa chứng minh detector tổng quát cho mọi giao diện. Xem [visual prompting và giới hạn](https://docs.ultralytics.com/models/yoloe/) và [Results/boxes](https://docs.ultralytics.com/modes/predict/).

Client `runtimeConsole` hiện tắt log ở production (`src/core/logging/runtime-console.ts:3–5`). Vì vậy không dùng sự im lặng của logger làm bằng chứng runtime sạch. CDP không quan sát toàn bộ log backend hoặc rollback DB; những mặt này cần case và bằng chứng riêng.

## Kết quả khởi tạo 31/10/2026

[Báo cáo Markdown](../audits/2026-10-31-yolo-runtime-report.md), [JSON](../audits/2026-10-31-yolo-runtime-report.json) và [bằng chứng](../audits/evidence/2026-10-31-yolo-runtime/) được tạo từ website thật, với `ultralytics 8.4.194`, `torch 2.15.0+cpu`, model `yoloe-26n-seg.pt`. Hash model, phiên bản môi trường và kiểm tra đường dẫn global skill nằm trong các JSON evidence tương ứng.

| Phân loại | Kết quả trong lượt này |
|---|---|
| COMPLIANT | 4 ca browser: dashboard hợp lệ, filter đoàn 0015, cookie hết hạn rồi đăng nhập lại, đọc booking 0117 giá 0. **16/16 assertion nghiệp vụ** đúng. Cookie hết hạn có đúng một 307 → login 200; booking vẫn 0 dù giá gốc 1,3 triệu. Không lưu sửa booking hoặc thu tiền. |
| COMPLIANT có phạm vi | YOLO tìm đúng 4/5 vùng mục tiêu theo ngưỡng box: logout, xóa lọc, login và ô đơn giá. 3 ca visual PASS; ca filter GAP vì không thấy nút phòng. Đây là thử nghiệm ảnh tham chiếu ở cùng viewport, không phải phép đo độ chính xác tổng quát. |
| VIOLATION của runtime gate / chưa xác nhận lỗi sản phẩm | Cả 4 ca có request `net::ERR_ABORTED` với `canceled: true`, gồm `/api/owner/hotels`, `room-plan`, `billing/booking-payments`, `/g/collect`; chưa thêm ngoại lệ để bỏ qua. Có 308 lặp ở `/socket.io/`. Không thấy exception JavaScript hoặc HTTP >=400 trong những khoảng capture này; không suy rộng sang server logs hay toàn hệ thống. |
| GAP | YOLO nhận nhầm ô email thành nút login và nhiều vùng khác thành ô đơn giá; không dùng nó để tự click hoặc đọc số tiền. Cần dữ liệu UI có nhãn và đánh giá riêng trước khi dùng làm driver tự hành. |
| GAP | 4 ca chưa chạy lại trong lượt này: booking ngoài kỳ, đổi giá gốc, chỉ sửa tên, checkout trả trước. Chúng có sẵn entry để bổ sung bằng chứng sau; báo cáo không tính PASS từ bằng chứng cũ. |

Kiểm tra công cụ ban đầu: **12/12 unit tests**, `py_compile`, `pip check` và `git diff --check` đều exit 0. Sau chỉnh luồng/báo cáo, bộ regression có **15 tests** gồm nguồn observation, thứ tự bước, request hủy cần review và YOLO không ghi đè assertion tiền sai. Lệnh phân tích YOLO thật exit **1** vì 4 runtime gate FAIL; 4 ca còn thiếu bằng chứng là GAP. Không công bố toàn bộ bộ kiểm thử đã PASS.
