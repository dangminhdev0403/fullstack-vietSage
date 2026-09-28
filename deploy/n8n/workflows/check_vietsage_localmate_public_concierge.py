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
assert "$input.first()?.json" in normalizer
assert "$('01 · Nhận yêu cầu công khai')" not in normalizer
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
assert all(term in system_prompt for term in ("RECENT_CONVERSATION_UNTRUSTED", "LATEST_QUESTION", "một câu làm rõ", "ĐỊA DANH TRƯỚC"))
assert all(term in system_prompt for term in ("GUIDE_INTENT là NO", "không ghép địa danh với hướng dẫn viên", "GUIDE_INTENT là YES"))

context_code = nodes["05 · Đóng gói tri thức địa phương"]["parameters"]["jsCode"]
assert "hasKnowledge: false" in context_code
assert "RECENT_CONVERSATION_UNTRUSTED" in context_code
assert "GUIDE_INTENT:" in context_code
assert "guideIntent ?" in context_code
assert "const guides = guideIntent" in context_code
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
    context_source = Path(directory) / "context.js"
    context_source.write_text(context_code, encoding="utf-8")
    harness = Path(directory) / "context-harness.js"
    harness.write_text(
        """const fs = require('fs');
const code = fs.readFileSync(process.argv[2], 'utf8');
const normalized = JSON.parse(process.argv[3]);
const payload = JSON.parse(process.argv[4]);
const $input = { first: () => ({ json: payload }) };
const selector = (name) => {
  if (name !== '02 · Chuẩn hóa vị trí & câu hỏi') throw new Error(`Unexpected selector: ${name}`);
  return { first: () => ({ json: normalized }) };
};
const output = new Function('$input', '$', code)($input, selector);
process.stdout.write(JSON.stringify(output[0].json));
""",
        encoding="utf-8",
    )
    payload = {
        "tours": [
            {
                "title": "Phố Cổ Hà Nội",
                "duration": "4 giờ",
                "highlights": ["36 phố phường", "di sản Thăng Long"],
                "content": "Khám phá văn hóa đô thị và kiến trúc Pháp.",
                "suitableGuides": [{"fullName": "Nguyễn Văn Minh"}],
            }
        ],
        "guides": [{"fullName": "Nguyễn Văn Minh", "operatingRegions": ["Hà Nội"]}],
        "metadata": {"locationScope": {"province": "Hà Nội"}},
        "knowledgeVersion": "sha256:test",
        "cached": False,
    }

    def context_result(message: str) -> dict:
        normalized = {"message": message, "location": "Hà Nội", "history": [], "lang": "vi"}
        result = subprocess.run(
            ["node", str(harness), str(context_source), json.dumps(normalized, ensure_ascii=False), json.dumps(payload, ensure_ascii=False)],
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        return json.loads(result.stdout)

    discovery = context_result("Gợi ý trải nghiệm nổi bật")
    assert discovery["guideIntent"] is False
    assert "GUIDE_INTENT: NO" in discovery["userPrompt"]
    assert "Nguyễn Văn Minh" not in discovery["userPrompt"]
    assert "suitableGuides" not in discovery["userPrompt"]

    guide_request = context_result("Tìm hướng dẫn viên phù hợp")
    assert guide_request["guideIntent"] is True
    assert "GUIDE_INTENT: YES" in guide_request["userPrompt"]
    assert "Nguyễn Văn Minh" in guide_request["userPrompt"]

    for node in workflow["nodes"]:
        code = node.get("parameters", {}).get("jsCode")
        if not code:
            continue
        source = Path(directory) / f"{node['id']}.js"
        source.write_text(code, encoding="utf-8")
        subprocess.run(["node", "--check", str(source)], check=True, capture_output=True, text=True)

print("LocalMate public workflow check: PASS")
