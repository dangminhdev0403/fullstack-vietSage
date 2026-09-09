from email.message import Message
import unittest

from server import Handler


class BrowserOriginTest(unittest.TestCase):
    def allowed(self, origin: str | None) -> bool:
        handler = Handler.__new__(Handler)
        handler.headers = Message()
        if origin is not None:
            handler.headers["Origin"] = origin
        return handler._browser_origin_allowed()

    def test_only_vietsage_and_direct_local_requests_are_allowed(self) -> None:
        self.assertTrue(self.allowed(None))
        self.assertTrue(self.allowed("https://stay.vietsage.com"))
        self.assertFalse(self.allowed("https://attacker.example"))


if __name__ == "__main__":
    unittest.main()