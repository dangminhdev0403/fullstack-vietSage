from __future__ import annotations

import json
import subprocess
import tempfile
import uuid
from pathlib import Path

path = Path(__file__).with_name("vietsage-localmate-public-concierge.json")
workflow = json.loads(path.read_text(encoding="utf-8"))
nodes = {node["name"]: node for node in workflow["nodes"]}
assert len(nodes) == len(workflow["nodes"]) == 10
for node in workflow["nodes"]:
    uuid.UUID(node["id"])

fallback = "Fallback · Hỏi vị trí hoặc báo lỗi"
for name in (
    "02 · Chuẩn hóa vị trí & câu hỏi",
    "04 · Tra cứu tri thức theo vị trí",
    "05 · Đóng gói tri thức địa phương",
    "06 · Sinh phản hồi LocalMate công khai",
    "07 · Chuẩn hóa phản hồi công khai",
):
    assert nodes[name]["onError"] == "continueErrorOutput"
    assert workflow["connections"][name]["main"][1][0]["node"] == fallback

normalizer = nodes["02 · Chuẩn hóa vị trí & câu hỏi"]["parameters"]["jsCode"]
assert "location.length < 2" in normalizer
assert "locationPrompts" in normalizer
assert "body.history" in normalizer and ".slice(-8)" in normalizer
assert "hotelId" not in normalizer

knowledge = nodes["04 · Tra cứu tri thức theo vị trí"]
assert knowledge["parameters"]["url"] == "http://auth-service:8080/localmate/knowledge"
assert "destination: $json.location" in knowledge["parameters"]["jsonBody"]
assert "hotelId" not in knowledge["parameters"]["jsonBody"]
assert knowledge["retryOnFail"] is True

ai = nodes["06 · Sinh phản hồi LocalMate công khai"]
schema = ai["parameters"]["options"]["textFormat"]["textOptions"]
assert ai["typeVersion"] == 2.3 and schema["strict"] is True
json.loads(schema["schema"])
system_prompt = ai["parameters"]["responses"]["values"][0]["content"]
assert all(term in system_prompt for term in ("STATED_LOCATION", "KNOWLEDGE", "Quý khách", "Không tạo hành động đặt dịch vụ"))
assert all(term in system_prompt for term in ("RECENT_CONVERSATION_UNTRUSTED", "LATEST_QUESTION", "một câu làm rõ"))

context_code = nodes["05 · Đóng gói tri thức địa phương"]["parameters"]["jsCode"]
assert "hasKnowledge: false" in context_code
assert "RECENT_CONVERSATION_UNTRUSTED" in context_code
knowledge_branch = "05b · Có tri thức phù hợp?"
assert workflow["connections"]["03 · Cần tra cứu tri thức?"]["main"][1][0]["node"] == "08 · Trả JSON về Public BFF"
assert workflow["connections"]["05 · Đóng gói tri thức địa phương"]["main"][0][0]["node"] == knowledge_branch
assert workflow["connections"][knowledge_branch]["main"][0][0]["node"] == "06 · Sinh phản hồi LocalMate công khai"
assert workflow["connections"][knowledge_branch]["main"][1][0]["node"] == "08 · Trả JSON về Public BFF"

response = nodes["08 · Trả JSON về Public BFF"]
assert "action: null" in response["parameters"]["responseBody"]
assert response["parameters"]["options"]["responseCode"].startswith("={{")
assert workflow["settings"]["saveDataSuccessExecution"] == "none"
assert workflow["active"] is False

with tempfile.TemporaryDirectory() as directory:
    for node in workflow["nodes"]:
        code = node.get("parameters", {}).get("jsCode")
        if not code:
            continue
        source = Path(directory) / f"{node['id']}.js"
        source.write_text(code, encoding="utf-8")
        subprocess.run(["node", "--check", str(source)], check=True, capture_output=True, text=True)

print("LocalMate public workflow check: PASS")
