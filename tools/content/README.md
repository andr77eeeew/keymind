# Content pipeline

`build.py` builds `content/` from public-domain or openly licensed sources. The result is
deterministic and committed, and raw downloads are not. See ADR-0006.

```bash
python -m venv tools/content/.venv
tools/content/.venv/Scripts/python -m pip install -r tools/content/requirements.txt
tools/content/.venv/Scripts/python -I tools/content/build.py
```

Tests of the text functions, which need no dependencies:

```bash
python tools/content/test_build.py
```

Every download is checked against a SHA-256 pinned in `build.py`. If a source changes, the build
stops and names the file, so a new version is always a deliberate choice: review the new file,
update the hash and `RETRIEVED`, rebuild and read the diff.
