from html.parser import HTMLParser
from pathlib import Path
import unittest


INDEX = Path(__file__).resolve().parents[1] / "index.html"
MODEL_URL = "https://sant-genis-3-maqueta.juan-vilade.chatgpt.site"


class LandingParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.section_depth = 0
        self.in_model_section = False
        self.model_links = []
        self.model_headings = []
        self._heading_depth = 0
        self._heading_text = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == "section":
            self.section_depth += 1
            if attributes.get("id") == "model-3d":
                self.in_model_section = True
        elif self.in_model_section and tag == "a":
            self.model_links.append(attributes)
        elif self.in_model_section and tag in {"h1", "h2", "h3"}:
            self._heading_depth = 1
            self._heading_text = []

    def handle_data(self, data):
        if self._heading_depth:
            self._heading_text.append(data)

    def handle_endtag(self, tag):
        if self._heading_depth and tag in {"h1", "h2", "h3"}:
            self.model_headings.append(" ".join("".join(self._heading_text).split()))
            self._heading_depth = 0
        if tag == "section" and self.in_model_section:
            self.in_model_section = False
        if tag == "section" and self.section_depth:
            self.section_depth -= 1


class Model3DAccessTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = INDEX.read_text(encoding="utf-8")
        cls.parser = LandingParser()
        cls.parser.feed(cls.html)

    def test_offers_a_clear_link_to_the_current_3d_model(self):
        self.assertIn("Explora el proyecto en 3D", self.parser.model_headings)
        matching = [link for link in self.parser.model_links if link.get("href") == MODEL_URL]
        self.assertEqual(len(matching), 1)
        self.assertEqual(matching[0].get("target"), "_blank")
        self.assertIn("noopener", matching[0].get("rel", "").split())

    def test_does_not_send_visitors_to_the_stale_building_demo(self):
        self.assertNotIn('href="explora-edificio.html"', self.html)


if __name__ == "__main__":
    unittest.main()
