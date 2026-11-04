"""Tests of the pure text functions. Run with: python tools/content/test_build.py"""

import importlib.util
import sys
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "build", Path(__file__).resolve().parent / "build.py"
)
assert spec and spec.loader
build = importlib.util.module_from_spec(spec)
sys.modules["build"] = build
spec.loader.exec_module(build)


class Normalize(unittest.TestCase):
    def test_matches_the_rules_of_the_app(self):
        self.assertEqual(
            build.normalize("“It’s” — café…\r\n  next"),
            ('"It\'s" - cafe... next', 0),
        )

    def test_counts_characters_without_a_key(self):
        self.assertEqual(build.normalize("abc пр def"), ("abc def", 2))


class Body(unittest.TestCase):
    EBOOK = (
        "﻿Header mentions Distributor\r\n"
        "*** START OF THE PROJECT GUTENBERG EBOOK X ***\r\n"
        "Preface.\r\n\r\nChapter 1\r\n\r\nThe text.\r\n"
        "*** END OF THE PROJECT GUTENBERG EBOOK X ***\r\n"
        "Footer mentions Distributor\r\n"
    )

    def test_cuts_header_and_footer(self):
        body = build.body_of_ebook(self.EBOOK)
        self.assertNotIn("Distributor", body)
        self.assertNotIn("GUTENBERG", body)
        self.assertIn("The text.", body)

    def test_skips_to_the_start_of_the_book(self):
        body = build.body_of_ebook(self.EBOOK, r"^Chapter 1")
        self.assertNotIn("Preface", body)

    def test_refuses_a_file_without_markers(self):
        with self.assertRaises(ValueError):
            build.body_of_ebook("no markers")


class Paragraphs(unittest.TestCase):
    def test_keeps_prose_and_marks_everything_else_as_a_break(self):
        body = (
            "CHAPTER I.\n\n"
            "[Illustration: a cat\nsitting]\n\n"
            "It was a _dark_ night--very dark.\nThe wind rose.\n\n"
            "A heading without an end\n\n"
            "Table | with | pipes.\n\n"
            "Last one."
        )
        self.assertEqual(
            build.paragraphs(body),
            [None, "It was a dark night-very dark. The wind rose.", None, None, "Last one."],
        )


class Sentences(unittest.TestCase):
    def test_splits_at_sentence_ends_only(self):
        self.assertEqual(
            build.sentences('Mr. Holmes sat. "Come in!" he said. J. Smith left.'),
            ["Mr. Holmes sat.", '"Come in!" he said.', "J. Smith left."],
        )


class Passages(unittest.TestCase):
    SENTENCE = "This sentence is here only to give the passage some length to work with."

    def test_lengths_stay_within_the_limits(self):
        passages = build.cut_passages([" ".join([self.SENTENCE] * 40)])
        self.assertTrue(passages)
        for passage in passages:
            self.assertGreaterEqual(len(passage), build.MIN_PASSAGE)
            self.assertLessEqual(len(passage), build.MAX_PASSAGE)

    def test_never_crosses_a_break(self):
        short = "A short one."
        self.assertEqual(build.cut_passages([short, None, short]), [])

    def test_never_starts_inside_a_quotation(self):
        paragraph = (
            f'"{self.SENTENCE} {self.SENTENCE} {self.SENTENCE} '
            f'{self.SENTENCE} {self.SENTENCE}"'
        )
        for passage in build.cut_passages([paragraph]):
            self.assertEqual(passage.count('"') % 2, 0)


class Filter(unittest.TestCase):
    def test_blocks_whole_words_and_phrases_only(self):
        word_filter = build.WordFilter(["badword", "two words", ""])
        self.assertTrue(word_filter.blocks_word("badword"))
        self.assertTrue(word_filter.blocks_text("A BadWord here."))
        self.assertTrue(word_filter.blocks_text("It has two words in it."))
        self.assertFalse(word_filter.blocks_text("A badwordless and two wordsmiths."))


class Difficulty(unittest.TestCase):
    def test_makes_three_equal_groups_in_order_of_hardness(self):
        common = {"the", "cat", "sat"}
        easy = "The cat sat. The cat sat. The cat sat."
        hard = 'Extraordinarily, "Xerxes" pontificated: 1234 Zebras; 5678 Quokkas!'
        items = []
        for i, text in enumerate([easy, easy, easy, hard, hard, hard]):
            items.append({"id": str(i), "features": build.features(text, common)})
        build.assign_difficulty(items)
        self.assertEqual(sorted(i["difficulty"] for i in items), [1, 1, 2, 2, 3, 3])
        self.assertTrue(all(i["difficulty"] >= 2 for i in items[3:]))


if __name__ == "__main__":
    unittest.main()
