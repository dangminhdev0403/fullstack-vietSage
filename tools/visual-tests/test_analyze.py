import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from contextlib import nullcontext
from types import SimpleNamespace
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("visual_analyze", Path(__file__).with_name("analyze.py"))
analyze = importlib.util.module_from_spec(spec)
spec.loader.exec_module(analyze)


class EvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "shot.jpg").write_bytes(b"unit fixture; metadata only")
        self.case = {"id": "auth", "title": "Authentication", "checks": ["login"], "visual_required": False, "allowed_runtime": []}
        self.evidence = {"version": 1, "case_id": "auth", "captured_at": "2026-10-31T00:00:00Z",
                         "url": "https://vietsage.localhost/owner/dashboard", "screenshot": "shot.jpg",
                         "checks": {"login": True}, "runtime": {"complete": True, "truncated": False, "events": [], "documents": []}}

    def run_report(self, evidence=True):
        (self.root / "cases.json").write_text(json.dumps({"version": 1, "cases": [self.case]}), encoding="utf-8")
        if evidence:
            (self.root / "auth.json").write_text(json.dumps(self.evidence), encoding="utf-8")
        return analyze.analyze(self.root / "cases.json", self.root, metadata_only=True)

    def test_complete_metadata_case_and_counts(self):
        report = self.run_report()
        self.assertEqual(report["status"], "PASS")
        self.assertEqual(report["case_counts"], {"PASS": 1, "FAIL": 0, "GAP": 0})
        self.assertEqual(report["component_counts"], {"PASS": 3, "FAIL": 0, "GAP": 0, "NOT_REQUIRED": 1})

    def test_missing_evidence_runtime_or_check_cannot_pass(self):
        self.assertEqual(self.run_report(False)["status"], "GAP")
        for missing in ("runtime", "checks"):
            saved = self.evidence.pop(missing)
            self.assertEqual(self.run_report()["status"], "GAP")
            self.evidence[missing] = saved
        self.evidence["runtime"]["truncated"] = True
        self.assertEqual(self.run_report()["status"], "GAP")

    def test_required_visual_not_run_is_gap(self):
        self.case["visual_required"] = True
        self.assertEqual(self.run_report()["status"], "GAP")
        self.evidence["visual"] = {"reference": "shot.jpg", "bboxes": [[0, 0, 20, 20]], "labels": ["login"], "targets": [{"label": "login", "box": [0, 0, 20, 20]}]}
        self.assertEqual(self.run_report()["status"], "GAP")

    def test_runtime_500_wins_over_passing_ui_and_incomplete_capture(self):
        self.evidence["runtime"].update(complete=False, events=[{"kind": "http", "status": 500, "path": "/api/rooms"}])
        report = self.run_report()
        self.assertEqual(report["status"], "FAIL")
        self.assertIn("/api/rooms", json.dumps(report))
        self.evidence["screenshot"] = "missing.jpg"
        self.assertEqual(self.run_report()["status"], "FAIL")
        self.case["allowed_runtime"] = [{"kind": "http", "path": "/*", "reason": "invalid"}]
        self.assertEqual(self.run_report()["status"], "FAIL")

    def test_expected_401_matches_only_exact_path_and_status(self):
        self.case["allowed_runtime"] = [{"kind": "http", "status": 401, "path": "/api/session", "reason": "expired session fixture"}]
        self.evidence["runtime"]["events"] = [{"kind": "http", "status": 401, "path": "/api/session"}]
        self.assertEqual(self.run_report()["status"], "PASS")
        self.evidence["runtime"]["events"][0]["path"] = "/api/other"
        self.assertEqual(self.run_report()["status"], "FAIL")
        self.evidence["runtime"]["events"][0].update(path="/api/session", status=500)
        self.assertEqual(self.run_report()["status"], "FAIL")

    def test_broad_allowlist_and_false_assertion(self):
        self.case["allowed_runtime"] = [{"kind": "http", "status": 401, "path": "/*", "reason": "broad"}]
        self.assertEqual(self.run_report()["status"], "GAP")
        self.evidence["checks"]["login"] = False
        self.assertEqual(self.run_report()["status"], "FAIL")

    def test_malformed_json_and_asset_traversal_are_gap(self):
        self.evidence["screenshot"] = "../outside.jpg"
        self.assertEqual(self.run_report()["status"], "GAP")
        self.run_report()
        (self.root / "auth.json").write_text("{bad", encoding="utf-8")
        self.assertEqual(analyze.analyze(self.root / "cases.json", self.root)["status"], "GAP")
        (self.root / "cases.json").write_text("[]", encoding="utf-8")
        self.assertEqual(analyze.analyze(self.root / "cases.json", self.root)["status"], "GAP")

    def test_document_failure_and_exception_are_runtime_failures(self):
        self.evidence["runtime"]["documents"] = [{"path": "/owner/dashboard", "status": 503}]
        self.assertEqual(self.run_report()["status"], "FAIL")
        self.evidence["runtime"].update(documents=[], events=[{"kind": "exception", "message": "TypeError: broken"}])
        self.assertEqual(self.run_report()["status"], "FAIL")
        self.evidence["runtime"].update(documents=["malformed"], events=[])
        self.assertEqual(self.run_report()["status"], "GAP")

    def test_report_redacts_credentials(self):
        self.evidence["runtime"]["events"] = [{"kind": "console_error", "message": "password=private Bearer private eyJhbGciOiJIUzI1NiJ9.abcdef.signature\nCookie: session=private"}]
        rendered = json.dumps(self.run_report())
        self.assertNotIn("private", rendered)
        self.assertNotIn("eyJhb", rendered)
        self.assertNotIn("private", analyze.redact('"password": "private private"\n"Cookie": "private"'))
        self.evidence["runtime"]["documents"] = [{"path": "/page", "status": 200, "headers": {"Cookie": "private"}}]
        self.assertNotIn("private", json.dumps(self.run_report()))

    def test_visual_match_is_narrow_and_a_miss_is_gap(self):
        class FakeDetector:
            detections = [{"label": "login", "confidence": .9, "box": [0, 0, 20, 20]}]

            def predict(self, *args):
                return self.detections

        self.case["visual_required"] = True
        self.evidence["visual"] = {"reference": "shot.jpg", "bboxes": [[0, 0, 20, 20]], "labels": ["login"], "targets": [{"label": "login", "box": [0, 0, 20, 20]}]}
        self.run_report()
        fake = FakeDetector()
        self.assertEqual(analyze.evaluate(self.case, self.root, fake, False)["status"], "PASS")
        fake.detections = []
        self.assertEqual(analyze.evaluate(self.case, self.root, fake, False)["status"], "GAP")
        fake.detections = FakeDetector.detections
        self.evidence["checks"]["login"] = False
        self.run_report()
        self.assertEqual(analyze.evaluate(self.case, self.root, fake, False)["status"], "FAIL")

    def test_cli_exit_states_and_both_reports(self):
        for expected, mutation in [(0, lambda: None), (1, lambda: self.evidence["checks"].update(login=False)), (2, lambda: self.evidence["checks"].clear())]:
            mutation()
            self.run_report()
            output = self.root / "report.md"
            self.assertEqual(analyze.main(["--cases", str(self.root / "cases.json"), "--evidence", str(self.root), "--output", str(output), "--metadata-only"]), expected)
            self.assertTrue(output.is_file())
            self.assertTrue(output.with_suffix(".json").is_file())

    def test_prompt_outside_image_is_rejected_before_inference(self):
        weights = self.root / "local.pt"
        weights.write_bytes(b"unit fixture")
        image = SimpleNamespace(open=lambda _: nullcontext(SimpleNamespace(width=10, height=10)))
        with patch.dict("sys.modules", {"PIL": SimpleNamespace(Image=image)}):
            with self.assertRaisesRegex(ValueError, "outside screenshot pixels"):
                analyze.Detector(weights).predict(self.root / "shot.jpg", self.root / "shot.jpg",
                                                 {"bboxes": [[0, 0, 20, 20]], "targets": []}, self.root / "out.jpg")

    def test_canceled_request_requires_review_without_claiming_product_bug(self):
        self.evidence["runtime"]["events"] = [{"kind": "request_failed", "path": "/api/rooms", "message": "net::ERR_ABORTED", "canceled": True}]
        report = self.run_report()
        self.assertEqual(report["status"], "FAIL")
        self.assertEqual(report["cases"][0]["assessment"]["verdict"], "NEEDS_REVIEW")
        self.evidence["runtime"]["events"][0]["canceled"] = False
        self.assertEqual(self.run_report()["cases"][0]["assessment"]["verdict"], "FAIL")

    def test_observation_source_and_ordered_flow_must_be_present(self):
        self.case.update(steps=["open", "read"], check_sources={"login": {"source": "DOM", "expected": "login form"}})
        self.assertEqual(self.run_report()["status"], "GAP")
        self.evidence.update(completed_steps=["open", "read"], observations={"login": {"source": "DOM", "observed": "login form visible"}})
        report = self.run_report()
        self.assertEqual(report["status"], "PASS")
        rendered = analyze.markdown(report, self.root, self.root / "report.md")
        self.assertIn("1. open", rendered)
        self.assertIn("Capture JSON", rendered)
        self.assertIn("Nhận xét", rendered)
        self.evidence["completed_steps"] = ["read", "open"]
        report = self.run_report()
        self.assertEqual(report["status"], "GAP")
        self.assertEqual(report["cases"][0]["assessment"]["verdict"], "INCOMPLETE")
        self.evidence["observations"]["login"]["source"] = "YOLO"
        self.assertEqual(self.run_report()["status"], "GAP")
        self.case["check_sources"] = {}
        self.assertEqual(self.run_report()["status"], "GAP")

    def test_yolo_success_cannot_override_bad_money_assertion(self):
        result = {"components": [analyze.component("rate_zero", "FAIL", "observed nonzero"), analyze.component("runtime", "PASS", {}), analyze.component("visual", "PASS", {})]}
        self.assertEqual(analyze.assess(result)["verdict"], "FAIL")


if __name__ == "__main__":
    unittest.main()
