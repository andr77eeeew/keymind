//! A small EPUB reader that extracts the title and the text in reading order.
//!
//! Written here because the `epub` crate is GPL-3.0, which does not fit this MIT project. An EPUB is
//! a ZIP file: `META-INF/container.xml` names the package file, whose spine lists the chapters.

use std::collections::HashMap;
use std::io::{Cursor, Read};

use quick_xml::Reader;
use quick_xml::XmlVersion;
use quick_xml::events::{BytesRef, BytesStart, Event};
use zip::ZipArchive;

/// Limits against files that unpack to far more than they weigh.
const MAX_ENTRY_BYTES: u64 = 64 * 1024 * 1024;
const MAX_TOTAL_BYTES: u64 = 256 * 1024 * 1024;

#[derive(Debug, thiserror::Error)]
pub enum EpubError {
    #[error("this file is not a readable EPUB: {0}")]
    Malformed(String),
    #[error("this EPUB is protected by DRM, so its text cannot be read")]
    Protected,
    #[error("this EPUB unpacks to more than the allowed size")]
    TooLarge,
}

fn malformed(message: impl ToString) -> EpubError {
    EpubError::Malformed(message.to_string())
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Book {
    pub title: Option<String>,
    /// Raw text with line breaks between blocks. The caller normalizes it.
    pub text: String,
}

pub fn extract(bytes: &[u8]) -> Result<Book, EpubError> {
    let mut archive = ZipArchive::new(Cursor::new(bytes)).map_err(malformed)?;
    let mut budget = MAX_TOTAL_BYTES;

    // Font obfuscation also lives in this file, but a file that hides its chapters always does.
    if let Some(encryption) = read_optional(&mut archive, "META-INF/encryption.xml", &mut budget)?
        && has_encrypted_chapters(&encryption)
    {
        return Err(EpubError::Protected);
    }

    let container = read_entry(&mut archive, "META-INF/container.xml", &mut budget)?;
    let package_path = package_path(&container)?;
    let package = read_entry(&mut archive, &package_path, &mut budget)?;
    let parsed = parse_package(&package)?;

    let base = match package_path.rfind('/') {
        Some(index) => &package_path[..=index],
        None => "",
    };
    let mut text = String::new();
    for href in parsed.chapters {
        let path = resolve(base, &href);
        let chapter = read_entry(&mut archive, &path, &mut budget)?;
        chapter_text(&chapter, &mut text);
    }
    if text.trim().is_empty() {
        return Err(malformed("it has no text"));
    }
    Ok(Book {
        title: parsed.title,
        text,
    })
}

fn read_optional(
    archive: &mut ZipArchive<Cursor<&[u8]>>,
    name: &str,
    budget: &mut u64,
) -> Result<Option<Vec<u8>>, EpubError> {
    if archive.index_for_name(name).is_none() {
        return Ok(None);
    }
    read_entry(archive, name, budget).map(Some)
}

fn read_entry(
    archive: &mut ZipArchive<Cursor<&[u8]>>,
    name: &str,
    budget: &mut u64,
) -> Result<Vec<u8>, EpubError> {
    let entry = archive
        .by_name(name)
        .map_err(|error| malformed(format!("{name}: {error}")))?;
    // Trust the bytes that come out, not the size the file declares.
    let limit = MAX_ENTRY_BYTES.min(*budget);
    let mut data = Vec::new();
    entry
        .take(limit + 1)
        .read_to_end(&mut data)
        .map_err(|error| malformed(format!("{name}: {error}")))?;
    if data.len() as u64 > limit {
        return Err(EpubError::TooLarge);
    }
    *budget -= data.len() as u64;
    Ok(data)
}

fn local_name(tag: &str) -> &str {
    tag.rsplit(':').next().unwrap_or(tag)
}

fn attribute(element: &BytesStart<'_>, name: &str) -> Option<String> {
    element
        .attributes()
        .flatten()
        .find(|a| local_name(a.key.as_ref()) == name)
        .and_then(|a| {
            a.normalized_value(XmlVersion::Implicit1_0)
                .ok()
                .map(|v| v.into_owned())
        })
}

fn new_reader(bytes: &[u8]) -> Reader<&[u8]> {
    let mut reader = Reader::from_reader(bytes);
    // Real books contain sloppy markup. Keep going rather than refuse them.
    reader.config_mut().check_end_names = false;
    reader
}

fn package_path(container: &[u8]) -> Result<String, EpubError> {
    let mut reader = new_reader(container);
    let mut buffer = Vec::new();
    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(Event::Start(e) | Event::Empty(e))
                if local_name(e.name().as_ref()) == "rootfile" =>
            {
                if let Some(path) = attribute(&e, "full-path") {
                    return Ok(path);
                }
            }
            Ok(Event::Eof) | Err(_) => return Err(malformed("no package file is named")),
            _ => {}
        }
        buffer.clear();
    }
}

struct Package {
    title: Option<String>,
    chapters: Vec<String>,
}

fn parse_package(package: &[u8]) -> Result<Package, EpubError> {
    let mut reader = new_reader(package);
    let mut buffer = Vec::new();
    let mut manifest: HashMap<String, String> = HashMap::new();
    let mut spine: Vec<String> = Vec::new();
    let mut title: Option<String> = None;
    let mut in_title = false;

    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(Event::Start(e)) if local_name(e.name().as_ref()) == "title" => {
                in_title = title.is_none();
            }
            Ok(Event::End(e)) if local_name(e.name().as_ref()) == "title" => in_title = false,
            Ok(Event::Text(t)) if in_title => {
                title.get_or_insert_with(String::new).push_str(&t);
            }
            // An entity arrives as its own event, between the two pieces of text around it.
            Ok(Event::GeneralRef(r)) if in_title => {
                push_reference(&r, title.get_or_insert_with(String::new));
            }
            Ok(Event::Start(e) | Event::Empty(e)) => match local_name(e.name().as_ref()) {
                "item" => {
                    if let (Some(id), Some(href)) = (attribute(&e, "id"), attribute(&e, "href")) {
                        manifest.insert(id, href);
                    }
                }
                "itemref" => {
                    if let Some(idref) = attribute(&e, "idref") {
                        spine.push(idref);
                    }
                }
                _ => {}
            },
            Ok(Event::Eof) => break,
            Err(error) => return Err(malformed(error)),
            _ => {}
        }
        buffer.clear();
    }

    let chapters: Vec<String> = spine
        .iter()
        .filter_map(|id| manifest.get(id).cloned())
        .collect();
    if chapters.is_empty() {
        return Err(malformed("it lists no chapters"));
    }
    Ok(Package {
        title: title.map(|t| t.trim().to_owned()).filter(|t| !t.is_empty()),
        chapters,
    })
}

fn has_encrypted_chapters(encryption: &[u8]) -> bool {
    let mut reader = new_reader(encryption);
    let mut buffer = Vec::new();
    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(Event::Start(e) | Event::Empty(e))
                if local_name(e.name().as_ref()) == "CipherReference" =>
            {
                let is_chapter = attribute(&e, "URI").is_some_and(|uri| {
                    let uri = uri.to_lowercase();
                    uri.ends_with("html") || uri.ends_with("htm")
                });
                if is_chapter {
                    return true;
                }
            }
            Ok(Event::Eof) | Err(_) => return false,
            _ => {}
        }
        buffer.clear();
    }
}

/// Resolves a chapter link against the package folder, including `../` and `%20`.
fn resolve(base: &str, href: &str) -> String {
    let href = href.split('#').next().unwrap_or(href);
    let mut parts: Vec<String> = base
        .split('/')
        .filter(|p| !p.is_empty())
        .map(str::to_owned)
        .collect();
    for part in percent_decode(href).split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            other => parts.push(other.to_owned()),
        }
    }
    parts.join("/")
}

fn percent_decode(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%'
            && let Some(value) = text
                .get(i + 1..i + 3)
                .and_then(|hex| u8::from_str_radix(hex, 16).ok())
        {
            out.push(value);
            i += 3;
            continue;
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn is_block(tag: &str) -> bool {
    matches!(
        tag,
        "p" | "div"
            | "br"
            | "li"
            | "tr"
            | "h1"
            | "h2"
            | "h3"
            | "h4"
            | "h5"
            | "h6"
            | "blockquote"
            | "section"
            | "article"
            | "hr"
            | "pre"
    )
}

fn is_skipped(tag: &str) -> bool {
    matches!(tag, "head" | "script" | "style" | "svg" | "math")
}

/// Appends the readable text of one chapter. Bad markup ends the chapter, not the import.
fn chapter_text(chapter: &[u8], out: &mut String) {
    let mut reader = new_reader(chapter);
    let mut buffer = Vec::new();
    let mut skip_depth = 0usize;

    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(Event::Start(e)) => {
                let name = e.name();
                let tag = local_name(name.as_ref());
                if skip_depth > 0 || is_skipped(tag) {
                    skip_depth += 1;
                } else if is_block(tag) {
                    out.push('\n');
                }
            }
            Ok(Event::End(e)) => {
                let name = e.name();
                let tag = local_name(name.as_ref());
                if skip_depth > 0 {
                    skip_depth -= 1;
                } else if is_block(tag) {
                    out.push('\n');
                }
            }
            Ok(Event::Empty(e)) => {
                if skip_depth == 0 && is_block(local_name(e.name().as_ref())) {
                    out.push('\n');
                }
            }
            Ok(Event::Text(t)) if skip_depth == 0 => out.push_str(&t),
            Ok(Event::CData(c)) if skip_depth == 0 => out.push_str(&c),
            Ok(Event::GeneralRef(r)) if skip_depth == 0 => push_reference(&r, out),
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
        buffer.clear();
    }
    out.push('\n');
}

fn push_reference(reference: &BytesRef<'_>, out: &mut String) {
    if let Ok(Some(c)) = reference.resolve_char_ref() {
        out.push(c);
        return;
    }
    let name: &str = reference;
    out.push_str(match name {
        "amp" => "&",
        "lt" => "<",
        "gt" => ">",
        "quot" => "\"",
        "apos" => "'",
        "nbsp" => " ",
        "mdash" | "ndash" => "-",
        "lsquo" | "rsquo" => "'",
        "ldquo" | "rdquo" => "\"",
        "hellip" => "...",
        _ => "",
    });
}

#[cfg(test)]
pub(crate) mod tests {
    use std::io::Write;

    use zip::write::{SimpleFileOptions, ZipWriter};

    use super::*;

    const CONTAINER: &str = r#"<?xml version="1.0"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>"#;

    const PACKAGE: &str = r#"<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>A Small Book</dc:title></metadata>
  <manifest>
    <item id="two" href="text/ch%202.xhtml" media-type="application/xhtml+xml"/>
    <item id="one" href="text/ch1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="one"/><itemref idref="two"/></spine>
</package>"#;

    const CHAPTER_ONE: &str = r#"<html><head><title>Skip me</title><style>p {}</style></head>
<body><h1>First</h1><p>Tom &amp; Jerry&#8217;s <i>big</i> day&mdash;fine.</p><script>var skip;</script></body></html>"#;

    const CHAPTER_TWO: &str = "<html><body><p>Second chapter.<br/>Next line.</p></body></html>";

    fn zip_of(files: &[(&str, &str)]) -> Vec<u8> {
        let mut bytes = Vec::new();
        let mut writer = ZipWriter::new(Cursor::new(&mut bytes));
        for (name, content) in files {
            writer
                .start_file(*name, SimpleFileOptions::default())
                .unwrap();
            writer.write_all(content.as_bytes()).unwrap();
        }
        writer.finish().unwrap();
        bytes
    }

    pub(crate) fn sample_epub() -> Vec<u8> {
        zip_of(&[
            ("META-INF/container.xml", CONTAINER),
            ("OEBPS/content.opf", PACKAGE),
            ("OEBPS/text/ch1.xhtml", CHAPTER_ONE),
            ("OEBPS/text/ch 2.xhtml", CHAPTER_TWO),
        ])
    }

    #[test]
    fn it_reads_title_and_chapters_in_spine_order() {
        let book = extract(&sample_epub()).unwrap();
        assert_eq!(book.title.as_deref(), Some("A Small Book"));
        let flat = book.text.split_whitespace().collect::<Vec<_>>().join(" ");
        assert_eq!(
            flat,
            "First Tom & Jerry\u{2019}s big day-fine. Second chapter. Next line."
        );
    }

    #[test]
    fn head_style_and_script_are_skipped() {
        let book = extract(&sample_epub()).unwrap();
        assert!(!book.text.contains("Skip me"));
        assert!(!book.text.contains("var skip"));
    }

    #[test]
    fn a_file_that_is_not_a_zip_is_an_error() {
        assert!(matches!(
            extract(b"plain text"),
            Err(EpubError::Malformed(_))
        ));
    }

    #[test]
    fn a_zip_without_a_container_is_an_error() {
        let bytes = zip_of(&[("readme.txt", "hello")]);
        assert!(matches!(extract(&bytes), Err(EpubError::Malformed(_))));
    }

    #[test]
    fn a_missing_chapter_is_an_error() {
        let bytes = zip_of(&[
            ("META-INF/container.xml", CONTAINER),
            ("OEBPS/content.opf", PACKAGE),
        ]);
        assert!(matches!(extract(&bytes), Err(EpubError::Malformed(_))));
    }

    #[test]
    fn encrypted_chapters_are_reported_but_obfuscated_fonts_are_not() {
        let cipher = |uri: &str| {
            format!(
                r#"<encryption><EncryptedData><CipherData><CipherReference URI="{uri}"/></CipherData></EncryptedData></encryption>"#
            )
        };
        let drm = cipher("OEBPS/text/ch1.xhtml");
        let bytes = zip_of(&[
            ("META-INF/encryption.xml", &drm),
            ("META-INF/container.xml", CONTAINER),
        ]);
        assert!(matches!(extract(&bytes), Err(EpubError::Protected)));

        let font = cipher("OEBPS/fonts/a.otf");
        let bytes = zip_of(&[
            ("META-INF/encryption.xml", &font),
            ("META-INF/container.xml", CONTAINER),
            ("OEBPS/content.opf", PACKAGE),
            ("OEBPS/text/ch1.xhtml", CHAPTER_ONE),
            ("OEBPS/text/ch 2.xhtml", CHAPTER_TWO),
        ]);
        assert!(extract(&bytes).is_ok());
    }

    #[test]
    fn links_resolve_against_the_package_folder() {
        assert_eq!(resolve("OEBPS/", "a.xhtml"), "OEBPS/a.xhtml");
        assert_eq!(resolve("OEBPS/x/", "../a%20b.xhtml#p1"), "OEBPS/a b.xhtml");
        assert_eq!(resolve("", "a.xhtml"), "a.xhtml");
        assert_eq!(resolve("OEBPS/", "../../../a.xhtml"), "a.xhtml");
    }
}
