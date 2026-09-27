from __future__ import annotations
import json, subprocess, tempfile, uuid
from pathlib import Path
p=Path(__file__).with_name("vietsage-localmate-concierge.json")
w=json.loads(p.read_text(encoding="utf-8")); nodes={n["name"]:n for n in w["nodes"]}
assert len(nodes)==len(w["nodes"])
for n in w["nodes"]: uuid.UUID(n["id"])
fallback="Fallback · Phản hồi trực tiếp / lỗi"
for name in ("02 · Chuẩn hóa & phân loại","04 · Tra cứu Tour & LocalMate","05 · Đóng gói ngữ cảnh","06 · Sinh phản hồi LocalMate AI","07 · Chuẩn hóa phản hồi"):
 assert nodes[name]["onError"]=="continueErrorOutput"
 assert w["connections"][name]["main"][1][0]["node"]==fallback
r=nodes["08 · Trả JSON về BFF"]
assert r["parameters"]["options"]["responseCode"].startswith("={{")
ai=nodes["06 · Sinh phản hồi LocalMate AI"]; tf=ai["parameters"]["options"]["textFormat"]["textOptions"]
assert ai["typeVersion"]==2.3 and tf["type"]=="json_schema" and tf["strict"] is True
json.loads(tf["schema"])
assert "$env" not in nodes["04 · Tra cứu Tour & LocalMate"]["parameters"]["url"]
normalizer=nodes["02 · Chuẩn hóa & phân loại"]["parameters"]["jsCode"]
assert all(field in normalizer for field in ("hotelId", "hotelName", "radiusKm"))
assert "!hotelId || hotelId.length > 160" in normalizer
assert "const destinations = [" not in normalizer and "resolveDestination" not in normalizer
assert "attractionKeywords" not in normalizer
assert "const destination = explicitDestination;" in normalizer
assert "Tây Bắc" not in normalizer and "Northwest Vietnam" not in normalizer
knowledge_body=nodes["04 · Tra cứu Tour & LocalMate"]["parameters"]["jsonBody"]
assert all(field in knowledge_body for field in ("cleanQuery", "hotelId", "radiusKm"))
context_code=nodes["05 · Đóng gói ngữ cảnh"]["parameters"]["jsCode"]
assert "distanceKm" in context_code and "locationScope" in context_code
assert "payload.metadata?.destination" in context_code and "effectiveDestination" in context_code
assert "PROVINCE_POLICY" in context_code and "outsideHotelProvince" in context_code
assert ".filter(" not in context_code and "tourCode" not in context_code and "guideCode" not in context_code

fallback_code=nodes[fallback]["parameters"]["jsCode"]
assert all(term not in fallback_code for term in ("Mù Cang Chải", "Trạm Tấu", "Mu Cang Chai", "Tram Tau"))
sys_prompt = ai["parameters"]["responses"]["values"][0]["content"]
assert all(term in sys_prompt for term in ("KNOWLEDGE", "title", "duration", "fullName", "Không hiển thị ID", "JSON theo schema"))
assert all(term in sys_prompt for term in ("LOCATION_SCOPE.province", "em", "Quý khách", "mình/tôi"))
assert "\n\n" not in sys_prompt
assert w["settings"]["saveDataSuccessExecution"] == "none"
assert w["settings"]["saveExecutionProgress"] is False
main_lane=["01 · Nhận yêu cầu du khách","02 · Chuẩn hóa & phân loại","03 · Cần tra cứu tri thức?","04 · Tra cứu Tour & LocalMate","05 · Đóng gói ngữ cảnh","06 · Sinh phản hồi LocalMate AI","07 · Chuẩn hóa phản hồi","08 · Trả JSON về BFF"]
assert all(nodes[name]["position"][1] == 360 for name in main_lane)
assert nodes[fallback]["position"][1] > 360
assert sum(n["type"] == "n8n-nodes-base.stickyNote" for n in w["nodes"]) == 4
with tempfile.TemporaryDirectory() as d:
 for n in w["nodes"]:
  code=n.get("parameters",{}).get("jsCode")
  if code:
   f=Path(d)/(n["id"]+".js"); f.write_text(code,encoding="utf-8"); subprocess.run(["node","--check",str(f)],check=True,capture_output=True,text=True)
print("LocalMate workflow check: PASS")
