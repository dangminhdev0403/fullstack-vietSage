"""Evaluate captured website evidence; YOLO detections are a narrow visual signal."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re


def redact(value):
    if isinstance(value, dict):
        return {k: redact(v) for k, v in value.items()}
    if isinstance(value, list):
        return [redact(v) for v in value]
    if not isinstance(value, str):
        return value
    value = re.sub(r"(?i)\bBearer\s+[^\s,;]+", "Bearer [REDACTED]", value)
    value = re.sub(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", "[REDACTED JWT]", value)
    value = re.sub(r'''(?i)(["']?(?:password|passwd|secret|access_token|refresh_token|api_key)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s&,;]+)''', r"\1[REDACTED]", value)
    return re.sub(r'''(?im)["']?\b(?:set-cookie|cookie|authorization)["']?\s*:[^\r\n]*''', "[REDACTED HEADER]", value)


def asset(root, name):
    if not isinstance(name, str) or not name or Path(name).is_absolute():
        raise ValueError("asset must be a relative filename")
    target = (root / name).resolve()
    if not target.is_relative_to(root.resolve()) or not target.is_file():
        raise ValueError("asset is missing or outside evidence directory")
    return target


def component(name, status, detail):
    return {"name": name, "status": status, "detail": detail}


def aggregate(parts):
    states = [p["status"] for p in parts]
    return "FAIL" if "FAIL" in states else "GAP" if not states or "GAP" in states else "PASS"


def valid_box(box):
    return (isinstance(box, list) and len(box) == 4
            and all(type(n) in (int, float) and float("-inf") < n < float("inf") for n in box)
            and box[2] > box[0] >= 0 and box[3] > box[1] >= 0)


def iou(a, b):
    overlap = max(0, min(a[2], b[2]) - max(a[0], b[0])) * max(0, min(a[3], b[3]) - max(a[1], b[1]))
    area = lambda x: (x[2] - x[0]) * (x[3] - x[1])
    return overlap / (area(a) + area(b) - overlap)


class Detector:
    def __init__(self, weights):
        self.weights, self.model = weights, None

    def predict(self, screenshot, reference, visual, annotated):
        if not self.weights or not Path(self.weights).is_file() or Path(self.weights).suffix != ".pt":
            raise ValueError("local .pt YOLOE weights are required; no automatic download")
        from PIL import Image
        for image_path, boxes in ((reference, visual["bboxes"]), (screenshot, [t["box"] for t in visual["targets"]])):
            with Image.open(image_path) as image:
                if any(box[2] > image.width or box[3] > image.height for box in boxes):
                    raise ValueError("prompt/target is outside screenshot pixels; recapture the visible control")
        import numpy as np
        os.environ["YOLO_CONFIG_DIR"] = str(Path(__file__).resolve().parent / ".cache")
        os.environ["YOLO_AUTOINSTALL"] = "false"
        os.environ["YOLO_OFFLINE"] = "true"
        from ultralytics import YOLOE, settings
        settings.update({"sync": False})
        if self.model is None:
            self.model = YOLOE(str(Path(self.weights).resolve()))
        results = self.model.predict(
            source=str(screenshot),
            visual_prompts={"bboxes": np.array(visual["bboxes"], dtype=np.float32),
                            "cls": np.arange(len(visual["labels"]))},
            refer_image=str(reference), device="cpu", conf=.25, verbose=False, save=False,
        )
        if not results:
            return []
        results[0].save(filename=str(annotated))
        detections = []
        for box in results[0].boxes if results[0].boxes is not None else []:
            index = int(box.cls.item())
            detections.append({"class_id": index,
                               "label": visual["labels"][index] if 0 <= index < len(visual["labels"]) else f"object{index}",
                               "confidence": float(box.conf.item()), "box": box.xyxy[0].tolist()})
        return detections


def runtime_result(runtime, allowed):
    invalid_rules = not isinstance(allowed, list)
    exact_rules = []
    for rule in allowed if isinstance(allowed, list) else []:
        if (not isinstance(rule, dict) or rule.get("kind") not in {"http", "exception", "console_error", "request_failed"}
                or not isinstance(rule.get("path"), str) or not rule["path"].startswith("/")
                or "*" in rule["path"] or not isinstance(rule.get("reason"), str) or not rule["reason"].strip()
                or (rule["kind"] == "http" and type(rule.get("status")) is not int)):
            invalid_rules = True
        else:
            exact_rules.append(rule)
    if not isinstance(runtime, dict):
        return component("runtime", "GAP", "runtime capture missing")
    events, documents = runtime.get("events"), runtime.get("documents")
    if not isinstance(events, list) or not isinstance(documents, list):
        return component("runtime", "GAP", "runtime events/documents missing or malformed")
    faults, accepted, malformed = [], [], invalid_rules or any(not isinstance(d, dict) for d in documents)
    for event in events + [{"kind": "http", **d} for d in documents if isinstance(d, dict)]:
        if not isinstance(event, dict) or event.get("kind") not in {"http", "exception", "console_error", "request_failed", "redirect"}:
            malformed = True
            continue
        kind = event["kind"]
        if kind == "http" and type(event.get("status")) is not int:
            malformed = True
            continue
        is_fault = kind in {"exception", "console_error", "request_failed"} or kind == "http" and event["status"] >= 400
        if is_fault:
            safe = {k: event[k] for k in ("kind", "status", "path", "message", "canceled") if k in event}
            rule = next((r for r in exact_rules if all(event.get(k) == v for k, v in r.items() if k in {"kind", "path", "status"})), None)
            (accepted if rule else faults).append({**safe, **({"reason": rule["reason"]} if rule else {})})
    complete = runtime.get("complete") is True and runtime.get("truncated") is False and not malformed
    state = "FAIL" if faults else "PASS" if complete else "GAP"
    return component("runtime", state, {"complete": complete, "faults": faults, "allowed": accepted,
                                        "invalid_allowlist": invalid_rules, "events": len(events),
                                        "redirects": [{k: e[k] for k in ("path", "status") if k in e} for e in events if isinstance(e, dict) and e.get("kind") == "redirect"],
                                        "documents": [{k: d[k] for k in ("path", "status") if k in d} for d in documents if isinstance(d, dict)]})


def evaluate(case, root, detector, metadata_only):
    case_id = case.get("id", "invalid") if isinstance(case, dict) else "invalid"
    parts = []
    result = {"id": case_id, "title": case.get("title", case_id) if isinstance(case, dict) else "Invalid case", "components": parts}
    try:
        if not isinstance(case_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", case_id):
            raise ValueError("invalid case id")
        checks = case.get("checks")
        if (not isinstance(checks, list) or not checks or any(not isinstance(c, str) or not c for c in checks)
                or len(set(checks)) != len(checks) or type(case.get("visual_required")) is not bool):
            raise ValueError("case needs unique named checks and visual_required boolean")
        evidence = json.loads(asset(root, f"{case_id}.json").read_text(encoding="utf-8-sig"))
        if not isinstance(evidence, dict) or evidence.get("version") != 1 or evidence.get("case_id") != case_id:
            raise ValueError("evidence version/case_id mismatch")
        screenshot = None
        try:
            screenshot = asset(root, evidence.get("screenshot"))
            if not all(isinstance(evidence.get(k), str) and evidence[k] for k in ("captured_at", "url")):
                raise ValueError("capture time/URL missing")
            result.update({k: evidence[k] for k in ("captured_at", "url", "screenshot")})
            parts.append(component("evidence", "PASS", "Capture and screenshot present"))
        except (OSError, ValueError, TypeError) as error:
            parts.append(component("evidence", "GAP", str(error)))
        observed = evidence.get("checks", {})
        for name in checks:
            value = observed.get(name) if isinstance(observed, dict) else None
            criteria = case.get("check_sources", {})
            observations = evidence.get("observations", {})
            criterion = criteria.get(name) if isinstance(criteria, dict) else None
            observation = observations.get(name) if isinstance(observations, dict) else None
            state = "PASS" if value is True else "FAIL" if value is False else "GAP"
            detail = "captured assertion" if type(value) is bool else "assertion missing/malformed"
            if criterion is not None:
                detail = {"criterion": criterion, "observation": observation}
                if not isinstance(criterion, dict) or not isinstance(observation, dict) or not observation.get("observed") or observation.get("source") != criterion.get("source"):
                    state = "FAIL" if value is False else "GAP"
            elif "check_sources" in case:
                state = "FAIL" if value is False else "GAP"
                detail = "assertion criterion/source missing or malformed"
            parts.append(component(name, state, detail))
        if case.get("steps"):
            completed = evidence.get("completed_steps", [])
            parts.append(component("flow", "PASS" if completed == case["steps"] else "GAP",
                                   {"planned": case["steps"], "recorded": completed,
                                    "origin": evidence.get("steps_origin", "capture record")}))
        result["evidence_file"] = f"{case_id}.json"
        parts.append(runtime_result(evidence.get("runtime"), case.get("allowed_runtime", [])))
        visual = evidence.get("visual")
        if not case["visual_required"] and not visual:
            parts.append(component("visual", "NOT_REQUIRED", "No visual assertion requested"))
        else:
            try:
                if not isinstance(visual, dict):
                    raise ValueError("visual reference/prompts missing")
                if screenshot is None:
                    raise ValueError("screenshot unavailable")
                reference = asset(root, visual.get("reference"))
                boxes, labels, targets = visual.get("bboxes"), visual.get("labels"), visual.get("targets")
                if (not isinstance(boxes, list) or not boxes or not all(valid_box(b) for b in boxes)
                        or not isinstance(labels, list) or len(labels) != len(boxes) or len(set(labels)) != len(labels)
                        or not all(isinstance(x, str) and x for x in labels)
                        or not isinstance(targets, list) or not targets
                        or not all(isinstance(t, dict) and t.get("label") in labels and valid_box(t.get("box")) for t in targets)):
                    raise ValueError("visual prompts/targets malformed")
                if metadata_only:
                    raise ValueError("metadata-only: YOLO inference not run")
                annotated = (root / f"{case_id}-yolo.jpg").resolve()
                if not annotated.is_relative_to(root.resolve()):
                    raise ValueError("annotation path outside evidence directory")
                detections = detector.predict(screenshot, reference, visual, annotated)
                matches = [{"label": t["label"], "max_iou": max((iou(t["box"], d["box"]) for d in detections if d["label"] == t["label"]), default=0)} for t in targets]
                parts.append(component("visual", "PASS" if all(m["max_iou"] >= .3 for m in matches) else "GAP",
                                       {"detections": detections, "targets": matches, "annotated": annotated.name if annotated.is_file() else None,
                                        "scope": "object detection only; a miss is inconclusive for this unvalidated UI model"}))
            except Exception as error:
                parts.append(component("visual", "GAP", f"Inference unavailable: {type(error).__name__}: {error}"))
    except (OSError, ValueError, TypeError) as error:
        parts.append(component("evidence", "GAP", str(error)))
    result["status"] = aggregate(parts)
    return result


def analyze(cases_path, evidence_dir, weights=None, metadata_only=False):
    try:
        manifest = json.loads(Path(cases_path).read_text(encoding="utf-8-sig"))
        cases = manifest.get("cases") if isinstance(manifest, dict) else None
        if manifest.get("version") != 1 or not isinstance(cases, list) or not cases:
            raise ValueError("manifest needs version 1 and nonempty cases")
        ids = [c.get("id") if isinstance(c, dict) else None for c in cases]
        if len({str(x) for x in ids}) != len(ids):
            raise ValueError("duplicate case ids")
        detector = Detector(weights)
        results = [evaluate(c, Path(evidence_dir).resolve(), detector, metadata_only) for c in cases]
        for result, case in zip(results, cases):
            result["assessment"] = assess(result)
            result["scope_note"] = case.get("scope_note", "")
    except (OSError, ValueError, TypeError, AttributeError) as error:
        results = [{"id": "configuration", "title": "Input configuration", "status": "GAP",
                    "components": [component("manifest", "GAP", str(error))]}]
    counts = {state: sum(c["status"] == state for c in results) for state in ("PASS", "FAIL", "GAP")}
    parts = [p for c in results for p in c["components"]]
    return redact({"version": 1, "generated_at": datetime.now(timezone.utc).isoformat(),
                   "execution": "Reanalysis of captured evidence; this CLI does not operate the browser. See captured_at per case.",
                   "status": aggregate(results), "case_counts": counts,
                   "component_counts": {s: sum(p["status"] == s for p in parts) for s in ("PASS", "FAIL", "GAP", "NOT_REQUIRED")},
                   "cases": results,
                   "limitations": ["YOLO detects reference objects; it does not validate text, money, permissions or database transactions.",
                                   "Visual misses remain GAP until a UI model and thresholds are validated.",
                                   "Only captured cases/runtime intervals are covered; missing or truncated evidence never passes."]})


def assess(result):
    parts = result["components"]
    behavior = [p for p in parts if p["name"] not in {"evidence", "visual", "runtime", "flow", "manifest"}]
    runtime = next((p for p in parts if p["name"] == "runtime"), {})
    detail = runtime.get("detail", {})
    faults = detail.get("faults", []) if isinstance(detail, dict) else []
    canceled = [f for f in faults if f.get("kind") == "request_failed" and f.get("canceled") is True and f.get("message") == "net::ERR_ABORTED"]
    visual = next((p for p in parts if p["name"] == "visual"), {})
    verdict, notes, next_steps = "INCOMPLETE", [], []
    if not behavior or aggregate(behavior) == "GAP":
        notes.append("Chưa đủ bằng chứng nghiệp vụ để kết luận ca đạt.")
        next_steps.append("Chạy luồng còn thiếu và thu observation cho từng assertion.")
    elif aggregate(behavior) == "FAIL":
        verdict = "FAIL"
        notes.append("Có assertion nghiệp vụ sai; đối chiếu giá trị kỳ vọng và quan sát trong bảng bằng chứng.")
    else:
        verdict = "PASS_SCOPED"
        notes.append(f"{len(behavior)}/{len(behavior)} assertion nghiệp vụ đạt trong khoảng capture đã ghi.")
    if any(p["status"] == "GAP" for p in parts if p["name"] in {"evidence", "flow"}):
        if verdict != "FAIL": verdict = "INCOMPLETE"
        notes.append("Thiếu bằng chứng ảnh hoặc luồng ghi nhận chưa khớp thứ tự dự kiến.")
    if faults:
        verdict = "FAIL" if len(canceled) != len(faults) else "NEEDS_REVIEW" if verdict != "FAIL" else verdict
        notes.append(f"Runtime có {len(faults)} sự kiện ngoài ngoại lệ, trong đó {len(canceled)} request bị hủy.")
        next_steps.append("Đối chiếu request hủy với navigation/unmount và request thay thế; chưa kết luận lỗi sản phẩm chỉ từ ERR_ABORTED." if len(canceled) == len(faults) else "Tái hiện lỗi tại endpoint/exception được ghi và kiểm tra server log liên quan.")
    elif runtime.get("status") != "PASS":
        if verdict != "FAIL": verdict = "INCOMPLETE"
        notes.append("Cửa sổ runtime chưa đủ để xác nhận.")
    if visual.get("status") == "PASS":
        notes.append("YOLO tìm đủ vùng mục tiêu theo ngưỡng; không xác nhận chữ, tiền hoặc loại trừ nhận nhầm ở vùng khác.")
    elif visual.get("status") != "NOT_REQUIRED":
        notes.append("YOLO còn GAP; không dùng việc bỏ sót để kết luận giao diện hỏng.")
        next_steps.append("Kiểm tra ảnh/box mẫu, vùng nằm trong viewport và hiệu chỉnh detector trên dữ liệu UI riêng.")
        if verdict == "PASS_SCOPED": verdict = "INCOMPLETE"
    if isinstance(visual.get("detail"), dict):
        vd = visual["detail"]
        missed = [m["label"] for m in vd.get("targets", []) if m["max_iou"] < .3]
        if missed: notes.append("Vùng YOLO chưa tìm được: " + ", ".join(missed) + ".")
    return {"verdict": verdict, "basis": notes, "next_steps": next_steps,
            "scope": "Nhận xét suy ra theo quy tắc từ các component, không phải kết luận nghiệp vụ do YOLO sinh ra."}


def markdown(report, evidence_dir, output):
    import os
    lines = ["# Website visual and runtime verification", "", f"Status: **{report['status']}**", "",
             report["execution"], "",
             f"Cases: {report['case_counts']}", f"Components: {report['component_counts']}", ""]
    lines += ["| Case | Behavior | YOLO | Runtime | Overall |", "|---|---|---|---|---|"]
    for case in report["cases"]:
        by_name = {p["name"]: p for p in case["components"]}
        behavior = [p for p in case["components"] if p["name"] not in {"evidence", "visual", "runtime", "manifest"}]
        lines.append(f"| {case['id']} | {aggregate(behavior)} | {by_name.get('visual', {}).get('status', 'GAP')} | {by_name.get('runtime', {}).get('status', 'GAP')} | {case['status']} |")
    lines += ["", "Canceled requests remain visible in the strict runtime gate; an ERR_ABORTED alone is not a confirmed product defect.",
              "YOLO PASS means a reference target was found in its expected region; other detections can still be false positives.", ""]
    for case in report["cases"]:
        lines.extend([f"## {case['id']}: {case['title']} — {case['status']}", ""])
        if case.get("assessment"):
            review = case["assessment"]
            lines += [f"**Nhận xét: {review['verdict']}**", ""] + [f"- {n}" for n in review["basis"]]
            lines += [f"- Bước tiếp: {n}" for n in review["next_steps"]] + [""]
        if case.get("scope_note"):
            lines += [f"**Nhận xét phạm vi của agent:** {case['scope_note']}", ""]
        if case.get("captured_at"):
            lines += [f"Capture: {case['captured_at']} · URL: {case['url']}", ""]
        if case.get("evidence_file"):
            relative = os.path.relpath(Path(evidence_dir) / case["evidence_file"], Path(output).parent).replace("\\", "/")
            lines += [f"[Capture JSON](<{relative}>)", ""]
        if case.get("screenshot"):
            relative = os.path.relpath(Path(evidence_dir) / case["screenshot"], Path(output).parent).replace("\\", "/")
            lines.extend([f"[Screenshot](<{relative}>)", ""])
        for part in case["components"]:
            if isinstance(part["detail"], dict) and "criterion" in part["detail"]:
                criterion = part["detail"]["criterion"] or {}
                observation = part["detail"]["observation"] or {}
                criterion = criterion if isinstance(criterion, dict) else {}
                observation = observation if isinstance(observation, dict) else {}
                lines += [f"- **{part['status']}** `{part['name']}` — Nguồn: {criterion.get('source', 'thiếu')}; kỳ vọng: {criterion.get('expected', 'thiếu')}; quan sát: {observation.get('observed', 'thiếu')}."]
                continue
            if part["name"] == "runtime" and isinstance(part["detail"], dict):
                runtime = part["detail"]
                lines += ["", f"**Runtime gate — {part['status']}**; capture đầy đủ: {runtime['complete']}", "",
                          "| Loại | Endpoint | Status | Canceled | Thông báo |", "|---|---|---|---|---|"]
                for event in runtime["faults"] + [{"kind": "redirect", **e} for e in runtime.get("redirects", [])]:
                    lines.append("| " + " | ".join(str(event.get(k, "" )).replace("|", "/").replace("\n", " ") for k in ("kind", "path", "status", "canceled", "message")) + " |")
                lines += ["", f"Ngoại lệ đã khai báo và khớp chính xác: {json.dumps(runtime['allowed'], ensure_ascii=False)}", ""]
                continue
            if part["name"] == "flow":
                lines += ["", f"**Luồng — {part['status']}**", ""]
                lines += [f"{i}. {step}" for i, step in enumerate(part["detail"]["planned"], 1)]
                lines += ["", f"Nguồn ghi bước: {part['detail']['origin']}", ""]
                continue
            if part["name"] == "visual" and isinstance(part["detail"], dict):
                visual = part["detail"]
                lines += [f"**YOLO — {part['status']}** (confidence ≥ 0.25; IoU ≥ 0.30)", "",
                          "| Vùng mục tiêu | IoU tốt nhất |", "|---|---|"]
                lines += [f"| {m['label']} | {m['max_iou']:.3f} |" for m in visual["targets"]]
                if visual.get("annotated"):
                    relative = os.path.relpath(Path(evidence_dir) / visual["annotated"], Path(output).parent).replace("\\", "/")
                    lines += ["", f"[Ảnh YOLO đánh dấu](<{relative}>)"]
                lines += ["", f"Toàn bộ detections (kể cả vùng có thể nhận nhầm): {json.dumps(visual['detections'], ensure_ascii=False)}", ""]
                continue
            detail = part["detail"] if isinstance(part["detail"], str) else json.dumps(part["detail"], ensure_ascii=False)
            lines.append(f"- **{part['status']}** {part['name']}: {detail}")
        lines.append("")
    return "\n".join(lines + ["## Limits", ""] + [f"- {x}" for x in report["limitations"]]) + "\n"


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cases", required=True)
    parser.add_argument("--evidence", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--model", help="existing local YOLOE .pt weights; never downloaded")
    parser.add_argument("--metadata-only", action="store_true")
    args = parser.parse_args(argv)
    report = analyze(args.cases, args.evidence, args.model, args.metadata_only)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.with_suffix(".json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    output.write_text(markdown(report, args.evidence, output), encoding="utf-8")
    print(f"{report['status']} {report['case_counts']} -> {output}")
    return {"PASS": 0, "FAIL": 1, "GAP": 2}[report["status"]]


if __name__ == "__main__":
    raise SystemExit(main())
