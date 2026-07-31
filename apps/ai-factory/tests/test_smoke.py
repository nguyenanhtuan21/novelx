import unittest

from novelx_ai_factory.smoke import get_health


class SmokeTest(unittest.TestCase):
    def test_exposes_ai_factory_health(self):
        self.assertEqual(
            get_health(),
            {
                "service": "ai-factory",
                "status": "ok",
            },
        )


if __name__ == "__main__":
    unittest.main()
