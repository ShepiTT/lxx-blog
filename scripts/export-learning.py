#!/usr/bin/env python3
"""Read one complete dated issue from the learning DOCX; never modify it.

Only Python's standard library is used. JSON is written to stdout, diagnostics
to stderr. Unsupported content fails closed instead of publishing a partial
lesson. `sha256` is the SHA-256 of the UTF-8 Markdown, including frontmatter.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import sys
import unicodedata
from datetime import date
from pathlib import Path
from urllib.parse import urlsplit
from xml.etree import ElementTree as ET
from zipfile import BadZipFile, ZipFile


W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
M = "http://schemas.openxmlformats.org/officeDocument/2006/math"
NS = {"w": W, "r": R}
DEFAULT_DOCX = Path(
    r"C:\Users\Administrator\Documents\Codex\2026-09-05\new-chat\outputs\AI产品架构师每日学习手册.docx"
)
ISSUE_RE = re.compile(
    r"^第\s*(\d+)\s*期\s*\(\s*(\d{4})[-/年](\d{1,2})[-/月]"
    r"(\d{1,2})日?\s*\)\s*[:：]?\s*(\S.*?)\s*$"
)
POINT_RE = re.compile(r"^(?:知识点\s*)?([1-6])\s*[.:、)]\s*\S")


class ExportError(ValueError):
    pass


def w(name: str) -> str:
    return f"{{{W}}}{name}"


def normalized(text: str) -> str:
    return unicodedata.normalize("NFKC", text).strip()


def text_of(node: ET.Element) -> str:
    parts = []
    for item in node.iter():
        if item.tag == w("t"):
            parts.append(item.text or "")
        elif item.tag == w("tab"):
            parts.append("\t")
        elif item.tag in (w("br"), w("cr")):
            if item.get(w("type")) != "page":
                parts.append("\n")
        elif item.tag == w("noBreakHyphen"):
            parts.append("\u2011")
        elif item.tag == w("softHyphen"):
            parts.append("\u00ad")
    return "".join(parts)


def issue_of(node: ET.Element):
    if node.tag != w("p"):
        return None
    match = ISSUE_RE.fullmatch(normalized(text_of(node)))
    if not match:
        return None
    number, year, month, day, theme = match.groups()
    try:
        issued = date(int(year), int(month), int(day))
    except ValueError as exc:
        raise ExportError(f"期标题日期无效：{text_of(node)}") from exc
    return int(number), issued.isoformat(), theme


def blocks(container: ET.Element):
    """Unwrap content controls without dropping any content blocks."""
    for child in container:
        if child.tag in (w("p"), w("tbl")):
            yield child
        elif child.tag == w("sdt"):
            content = child.find("w:sdtContent", NS)
            if content is None:
                raise ExportError("文档内容控件没有可读取的正文")
            yield from blocks(content)
        elif child.tag == w("customXml"):
            yield from blocks(child)
        elif child.tag not in (w("sectPr"), w("tcPr"), w("sdtPr"), w("sdtEndPr")):
            raise ExportError(f"不能无损导出正文结构：{child.tag.rsplit('}', 1)[-1]}")


def markdown_escape(text: str) -> str:
    return re.sub(r"([\\`*_{}\[\]<>])", r"\\\1", text)


def code_span(text: str) -> str:
    delimiter = "`" * (max((len(x) for x in re.findall(r"`+", text)), default=0) + 1)
    padding = " " if text.startswith(("`", " ")) or text.endswith(("`", " ")) else ""
    return f"{delimiter}{padding}{text}{padding}{delimiter}"


class DocxReader:
    def __init__(self, archive: ZipFile):
        self.archive = archive
        self.relationships = {}
        self.styles = {}
        self.numbers = {}
        self.counters = {}
        if "word/_rels/document.xml.rels" in archive.namelist():
            root = self.xml("word/_rels/document.xml.rels")
            self.relationships = {node.get("Id"): node.attrib for node in root}
        if "word/styles.xml" in archive.namelist():
            root = self.xml("word/styles.xml")
            self.styles = {node.get(w("styleId")): node for node in root.findall("w:style", NS)}
        if "word/numbering.xml" in archive.namelist():
            root = self.xml("word/numbering.xml")
            abstracts = {node.get(w("abstractNumId")): node for node in root.findall("w:abstractNum", NS)}
            for node in root.findall("w:num", NS):
                ref = node.find("w:abstractNumId", NS)
                if ref is None or ref.get(w("val")) not in abstracts:
                    raise ExportError("列表编号定义不完整")
                levels = {}
                for level in abstracts[ref.get(w("val"))].findall("w:lvl", NS):
                    levels[int(level.get(w("ilvl"), "0"))] = level
                overrides = {}
                for override in node.findall("w:lvlOverride", NS):
                    index = int(override.get(w("ilvl"), "0"))
                    custom = override.find("w:lvl", NS)
                    if custom is not None:
                        levels[index] = custom
                    start = override.find("w:startOverride", NS)
                    if start is not None:
                        overrides[index] = int(start.get(w("val")))
                self.numbers[node.get(w("numId"))] = (levels, overrides)

    def xml(self, name: str) -> ET.Element:
        if self.archive.getinfo(name).file_size > 32 * 1024 * 1024:
            raise ExportError(f"DOCX XML 过大：{name}")
        return ET.fromstring(self.archive.read(name))

    def style(self, paragraph: ET.Element) -> str:
        prop = paragraph.find("w:pPr/w:pStyle", NS)
        return prop.get(w("val"), "") if prop is not None else ""

    def heading_level(self, paragraph: ET.Element):
        sid = self.style(paragraph)
        match = re.fullmatch(r"Heading\s*([1-6])", sid, re.IGNORECASE)
        if match:
            return int(match.group(1))
        if sid.casefold() == "title":
            return 1
        direct = paragraph.find("w:pPr/w:outlineLvl", NS)
        visited = set()
        while direct is None and sid in self.styles and sid not in visited:
            visited.add(sid)
            style = self.styles[sid]
            direct = style.find("w:pPr/w:outlineLvl", NS)
            based = style.find("w:basedOn", NS)
            sid = based.get(w("val"), "") if based is not None else ""
        if direct is not None and 0 <= int(direct.get(w("val"), "9")) <= 5:
            return int(direct.get(w("val"))) + 1
        return None

    def check_supported(self, selected):
        unsupported = {
            w(name) for name in (
                "drawing", "pict", "object", "altChunk", "footnoteReference",
                "endnoteReference", "sym", "del", "ins", "moveFrom", "moveTo",
                "fldChar", "instrText", "subDoc", "contentPart",
            )
        } | {f"{{{M}}}oMath", f"{{{M}}}oMathPara"}
        for block in selected:
            for node in block.iter():
                if node.tag in unsupported:
                    name = node.tag.rsplit("}", 1)[-1]
                    raise ExportError(
                        f"本期含不能无损保留的 {name}（图片、公式、引用、修订或复杂域等）；"
                        "停止导出，请将关键内容转换为正文或完善转换器后重试"
                    )

    def link(self, target: str, content: str, html_mode: bool) -> str:
        parsed = urlsplit(target)
        if parsed.scheme and parsed.scheme.casefold() not in ("http", "https", "mailto"):
            raise ExportError(f"链接协议不适合公开网页：{parsed.scheme}")
        if html_mode:
            return f'<a href="{html.escape(target, quote=True)}">{content}</a>'
        safe = target.replace(" ", "%20").replace("<", "%3C").replace(">", "%3E")
        return f"[{content}](<{safe}>)"

    def inline(self, node: ET.Element, html_mode=False) -> str:
        escaped = html.escape if html_mode else markdown_escape
        if node.tag == w("r"):
            plain = text_of(node)
            if not plain:
                return ""
            props = node.find("w:rPr", NS)
            code = False
            if props is not None:
                font = props.find("w:rFonts", NS)
                style = props.find("w:rStyle", NS)
                code = (font is not None and any(
                    name in (font.get(w("ascii"), "") + " " + font.get(w("hAnsi"), "")).lower()
                    for name in ("consolas", "courier", "monospace")
                )) or (style is not None and "code" in style.get(w("val"), "").lower())
            if code:
                result = f"<code>{html.escape(plain)}</code>" if html_mode else code_span(plain)
            else:
                result = escaped(plain).replace("\n", "<br />" if html_mode else "  \n")
            if props is not None:
                for name, mark, tag in (("b", "**", "strong"), ("i", "*", "em"), ("strike", "~~", "s")):
                    prop = props.find(f"w:{name}", NS)
                    if prop is not None and prop.get(w("val"), "1") not in ("0", "false", "off"):
                        result = f"<{tag}>{result}</{tag}>" if html_mode else f"{mark}{result}{mark}"
            return result
        if node.tag == w("hyperlink"):
            content = "".join(self.inline(child, html_mode) for child in node)
            rid = node.get(f"{{{R}}}id")
            anchor = node.get(w("anchor"))
            if rid:
                relation = self.relationships.get(rid)
                if relation is None or not relation.get("Type", "").endswith("/hyperlink"):
                    raise ExportError("链接缺少合法关系定义")
                target = relation.get("Target", "")
            elif anchor:
                target = "#" + anchor
            else:
                raise ExportError("链接缺少目标")
            return self.link(target, content, html_mode)
        if node.tag == w("fldSimple"):
            instruction = node.get(w("instr"), "").strip()
            match = re.fullmatch(r'HYPERLINK\s+"([^"\n]+)"(?:\s+\\l\s+"([^"\n]+)")?\s*', instruction, re.I)
            if not match:
                raise ExportError(f"不能无损导出 Word 域：{instruction[:60]}")
            target = match.group(1) + ("#" + match.group(2) if match.group(2) else "")
            return self.link(target, "".join(self.inline(child, html_mode) for child in node), html_mode)
        if node.tag == w("bookmarkStart"):
            name = node.get(w("name"), "")
            return f'<span id="{html.escape(name, quote=True)}"></span>' if name and name != "_GoBack" else ""
        if node.tag in (w("pPr"), w("rPr"), w("bookmarkEnd"), w("proofErr"), w("commentRangeStart"), w("commentRangeEnd"), w("commentReference"), w("lastRenderedPageBreak")):
            return ""
        if node.tag in (w("p"), w("smartTag"), w("sdt"), w("sdtContent"), w("customXml")):
            return "".join(self.inline(child, html_mode) for child in node if child.tag not in (w("sdtPr"), w("sdtEndPr")))
        raise ExportError(f"不能无损导出段落元素：{node.tag.rsplit('}', 1)[-1]}")

    def list_prefix(self, paragraph: ET.Element):
        props = paragraph.find("w:pPr/w:numPr", NS)
        if props is None:
            return None
        num = props.find("w:numId", NS)
        depth = props.find("w:ilvl", NS)
        if num is None or num.get(w("val")) == "0":
            return None
        num_id = num.get(w("val"))
        index = int(depth.get(w("val"), "0")) if depth is not None else 0
        if num_id not in self.numbers or index not in self.numbers[num_id][0]:
            raise ExportError("列表缺少层级或编号定义")
        levels, overrides = self.numbers[num_id]
        level = levels[index]
        fmt = level.find("w:numFmt", NS)
        kind = fmt.get(w("val"), "") if fmt is not None else ""
        if kind == "bullet":
            return index, "-"
        if kind != "decimal":
            raise ExportError(f"不能无损保留列表编号格式：{kind}")
        start = level.find("w:start", NS)
        initial = overrides.get(index, int(start.get(w("val"), "1")) if start is not None else 1)
        key = (num_id, index)
        current = self.counters.get(key, initial - 1) + 1
        self.counters[key] = current
        for other in list(self.counters):
            if other[0] == num_id and other[1] > index:
                del self.counters[other]
        return index, f"{current}."

    def render_table(self, table: ET.Element) -> str:
        rows = []
        active = {}
        for row in table.findall("w:tr", NS):
            cells = []
            before = row.find("w:trPr/w:gridBefore", NS)
            col = int(before.get(w("val"), "0")) if before is not None else 0
            if col:
                raise ExportError("表格存在缺失的起始网格，需人工确认后导出")
            next_active = {}
            for cell in row.findall("w:tc", NS):
                span = cell.find("w:tcPr/w:gridSpan", NS)
                width = int(span.get(w("val"), "1")) if span is not None else 1
                merge = cell.find("w:tcPr/w:vMerge", NS)
                if merge is not None and merge.get(w("val")) != "restart":
                    original = active.get(col)
                    if original is None or original["colspan"] != width or text_of(cell).strip():
                        raise ExportError("表格纵向合并不完整或会丢失内容，停止导出")
                    original["rowspan"] += 1
                    next_active[col] = original
                else:
                    rendered = self.render_blocks(list(blocks(cell)), html_mode=True)
                    entry = {"content": rendered, "colspan": width, "rowspan": 1,
                             "header": row.find("w:trPr/w:tblHeader", NS) is not None}
                    cells.append(entry)
                    if merge is not None:
                        next_active[col] = entry
                col += width
            rows.append(cells)
            active = next_active
        result = ["<table>", "<tbody>"]
        for row in rows:
            result.append("<tr>")
            for cell in row:
                tag = "th" if cell["header"] else "td"
                attrs = "".join(f' {attr}="{cell[attr]}"' for attr in ("colspan", "rowspan") if cell[attr] > 1)
                result.append(f"<{tag}{attrs}>{cell['content']}</{tag}>")
            result.append("</tr>")
        result.extend(("</tbody>", "</table>"))
        return "\n".join(result)

    def render_blocks(self, selected, html_mode=False) -> str:
        rendered = []
        code_lines = []

        def flush_code():
            if not code_lines:
                return
            content = "\n".join(code_lines)
            if html_mode:
                rendered.append(f"<pre><code>{html.escape(content)}</code></pre>")
            else:
                fence = "`" * max(3, max((len(x) for x in re.findall(r"`+", content)), default=0) + 1)
                rendered.append(f"{fence}\n{content}\n{fence}")
            code_lines.clear()

        for node in selected:
            if node.tag == w("tbl"):
                flush_code()
                rendered.append(self.render_table(node))
                continue
            plain = text_of(node)
            if "code" in self.style(node).casefold():
                if any(item.tag in (w("hyperlink"), w("fldSimple")) for item in node.iter()):
                    raise ExportError("代码段内包含链接或域，不能将其无损转换为纯代码块")
                code_lines.append(plain)
                continue
            flush_code()
            if not plain.strip():
                continue
            content = self.inline(node, html_mode).strip()
            level = self.heading_level(node)
            prefix = self.list_prefix(node)
            if html_mode:
                if level:
                    content = f"<h{level}>{content}</h{level}>"
                elif prefix:
                    # A separate one-item list preserves numbering and semantic list type.
                    depth, marker = prefix
                    if depth:
                        raise ExportError("表格中的嵌套列表需补充转换支持，停止导出以免丢失层级")
                    content = f'<ul><li>{content}</li></ul>' if marker == "-" else f'<ol start="{marker[:-1]}"><li>{content}</li></ol>'
                else:
                    content = f"<p>{content}</p>"
            elif level:
                content = "#" * level + " " + content
            elif prefix:
                depth, marker = prefix
                content = "    " * depth + marker + " " + content
            rendered.append(content)
        flush_code()
        return ("\n" if html_mode else "\n\n").join(rendered)


def validate_issue(reader: DocxReader, selected):
    paragraphs = [node for block in selected for node in block.iter(w("p"))]
    points = []
    for index, paragraph in enumerate(paragraphs):
        value = normalized(text_of(paragraph))
        match = POINT_RE.match(value)
        if match and (value.startswith("知识点") or reader.heading_level(paragraph) is not None):
            points.append((int(match.group(1)), index))
    if [number for number, _ in points] != list(range(1, 7)):
        raise ExportError(f"本期必须包含且仅包含按顺序编号的 6 个知识点，实际为：{[p[0] for p in points]}")
    labels = {
        "讲解": r"^(?:知识讲解|讲解)\s*:\s*\S",
        "案例": r"^(?:食品制造案例|实际案例|案例)\s*:\s*\S",
        "标准做法或示例答案": r"^(?:示例答案\s*/\s*标准做法|标准做法|示例答案|参考答案)\s*:\s*\S",
        "练习": r"^(?:可选练习|练习|练习题)\s*:\s*\S",
        "答案": r"^(?:参考答案|练习答案|答案)\s*:\s*\S",
    }
    for position, (number, start) in enumerate(points):
        end = points[position + 1][1] if position < 5 else len(paragraphs)
        values = [normalized(text_of(p)) for p in paragraphs[start + 1:end]]
        matches = {name: [i for i, value in enumerate(values) if re.match(pattern, value)] for name, pattern in labels.items()}
        missing = [name for name, indices in matches.items() if not indices]
        if missing:
            raise ExportError(f"知识点 {number} 缺少非空内容：{'、'.join(missing)}")
        if not any(answer > exercise for answer in matches["答案"] for exercise in matches["练习"]):
            raise ExportError(f"知识点 {number} 的练习后缺少参考答案")
    return [re.sub(r"^(?:知识点\s*)?[1-6１-６]\s*[.:：、)）．]\s*", "", text_of(paragraphs[start]).strip())
            for _, start in points]


def export(docx: Path, requested: str):
    source_bytes = docx.read_bytes()
    source_hash = hashlib.sha256(source_bytes).hexdigest()
    with ZipFile(docx) as archive:
        reader = DocxReader(archive)
        document = reader.xml("word/document.xml")
        body = document.find("w:body", NS)
        if body is None:
            raise ExportError("DOCX 缺少正文")
        contents = list(blocks(body))
        issues = [(i, issue_of(block)) for i, block in enumerate(contents)]
        issues = [(i, issue) for i, issue in issues if issue is not None]
        matches = [(i, issue) for i, issue in issues if issue[1] == requested]
        if len(matches) != 1:
            raise ExportError(f"日期 {requested} 必须匹配恰好一个期标题，实际匹配 {len(matches)} 个")
        start, (number, issued, theme) = matches[0]
        end = next((i for i, _ in issues if i > start), len(contents))
        selected = contents[start:end]
        reader.check_supported(selected)
        topics = validate_issue(reader, selected)
        title = text_of(selected[0]).strip()
        paragraphs = [node for block in selected for node in block.iter(w("p"))]
        target = next((text_of(p).strip() for p in paragraphs[1:] if normalized(text_of(p)).startswith("本期目标:")), "")
        if not target:
            raise ExportError("本期缺少明确的本期目标，停止生成文章摘要")
        description = re.sub(r"^本期目标\s*[:：]\s*", "", target)
        description = description[:137] + "…" if len(description) > 138 else description
        cover = "/covers/ai-pair-programming.jpg"
        if not (Path(__file__).resolve().parents[1] / "public" / cover.lstrip("/")).is_file():
            raise ExportError(f"文章封面文件不存在：{cover}")
        body_markdown = reader.render_blocks(selected) + "\n"
        content_hash = hashlib.sha256(body_markdown.encode("utf-8")).hexdigest()
        meta = {
            "title": title,
            "description": description,
            "date": issued,
            "category": "ai",
            "cover": cover,
            "tags": ["食品制造", "AI产品架构师", "每日学习"],
            "learningContentSha256": content_hash,
        }
        # JSON string/array syntax is a YAML subset and quotes all dynamic values.
        frontmatter = "\n".join(f"{key}: {json.dumps(value, ensure_ascii=False)}" for key, value in meta.items())
        markdown = f"---\n{frontmatter}\n---\n\n{body_markdown}"
    if hashlib.sha256(docx.read_bytes()).hexdigest() != source_hash:
        raise ExportError("提取过程中 Word 文档发生变化，请等待本期写入完成后重试")
    return {
        "date": issued, "issue": number, "title": title, "description": description,
        "slug": f"ai-learning-{issued}", "markdown": markdown,
        "sha256": hashlib.sha256(markdown.encode("utf-8")).hexdigest(),
        "sourceSha256": source_hash, "contentSha256": content_hash, "topics": topics,
    }


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", newline="\n")
        sys.stderr.reconfigure(encoding="utf-8", newline="\n")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--docx", type=Path, default=DEFAULT_DOCX)
    parser.add_argument("--date", required=True, help="北京时间日期，格式 YYYY-MM-DD")
    args = parser.parse_args()
    try:
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", args.date):
            raise ExportError("--date 必须为 YYYY-MM-DD")
        requested = date.fromisoformat(args.date).isoformat()
        result = export(args.docx, requested)
    except (ExportError, OSError, ValueError, BadZipFile, ET.ParseError, KeyError) as exc:
        print(f"export-learning: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
