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
