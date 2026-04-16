"""
Report Document Generator
=========================
Produces branded .docx or .pdf from AI-generated markdown report content.

Word:  python-docx (already in requirements)
PDF:   reportlab  (add: reportlab>=4.0.0 to requirements.txt)
"""
from __future__ import annotations

import io
import os
import re

# ---------------------------------------------------------------------------
# python-docx
# ---------------------------------------------------------------------------
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

# ---------------------------------------------------------------------------
# reportlab
# ---------------------------------------------------------------------------
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib.colors import HexColor, black
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    PageTemplate,
    Paragraph,
    Spacer,
    HRFlowable,
    PageBreak,
    NextPageTemplate,
    Image,
    KeepTogether,
)
from reportlab.platypus.flowables import HRFlowable  # noqa: F811

# ---------------------------------------------------------------------------
# Brand colours
# ---------------------------------------------------------------------------
TEAL_RGB = RGBColor(0x4A, 0x8B, 0x8C)
NEAR_BLACK_RGB = RGBColor(0x1A, 0x1A, 0x1A)
GREY_RGB = RGBColor(0x80, 0x80, 0x80)

TEAL_RL = HexColor("#4A8B8C")
NEAR_BLACK_RL = HexColor("#1A1A1A")
GREY_RL = HexColor("#808080")

# ---------------------------------------------------------------------------
# Logo resolution
# ---------------------------------------------------------------------------
_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.normpath(os.path.join(_HERE, "..", ".."))

_LOGO_CANDIDATES = [
    os.path.join(_ROOT, "roundtable-logo light mode.jpg"),
    os.path.join(_ROOT, "web", "public", "icon-light.png"),
]


def _get_logo_path() -> str | None:
    for p in _LOGO_CANDIDATES:
        if os.path.exists(p):
            return p
    return None


# ===========================================================================
# Shared markdown parser
# ===========================================================================

def _parse_md(md: str) -> list[tuple[str, str]]:
    """
    Parse AI markdown into (kind, text) tuples.
    Kinds: h1  h2  bullet  para  empty
    """
    elements: list[tuple[str, str]] = []
    for raw in md.splitlines():
        line = raw.rstrip()
        if line.startswith("## "):
            elements.append(("h1", line[3:].strip()))
        elif line.startswith("### "):
            elements.append(("h2", line[4:].strip()))
        elif line.startswith("- ") or line.startswith("* "):
            elements.append(("bullet", line[2:].strip()))
        elif line.startswith("  - ") or line.startswith("  * "):
            elements.append(("bullet", line[4:].strip()))
        elif line == "":
            elements.append(("empty", ""))
        else:
            elements.append(("para", line.lstrip("#").strip()))
    return elements


def _split_bold(text: str) -> list[tuple[str, bool]]:
    """Split on **..** → [(segment, is_bold), ...]"""
    parts = re.split(r"\*\*(.+?)\*\*", text)
    return [(p, i % 2 == 1) for i, p in enumerate(parts) if p]


# ===========================================================================
# Word (.docx) generation
# ===========================================================================

def _set_run(run, size_pt: float, bold: bool = False,
             color: RGBColor | None = None, italic: bool = False) -> None:
    run.font.name = "Arial"
    run.font.size = Pt(size_pt)
    run.bold = bold
    run.italic = italic
    if color:
        run.font.color.rgb = color


def _add_para(doc: Document, text: str, size_pt: float = 11,
              bold: bool = False, color: RGBColor | None = None,
              align=WD_ALIGN_PARAGRAPH.LEFT,
              space_before: float = 0, space_after: float = 4) -> object:
    p = doc.add_paragraph()
    p.alignment = align
    pf = p.paragraph_format
    pf.space_before = Pt(space_before)
    pf.space_after = Pt(space_after)
    pf.line_spacing = 1.15
    for seg, is_bold in _split_bold(text):
        run = p.add_run(seg)
        _set_run(run, size_pt, bold=(bold or is_bold), color=color)
    return p


def _teal_rule(doc: Document) -> None:
    """Thin teal bottom border on an empty paragraph — used below H1."""
    p = doc.add_paragraph()
    pf = p.paragraph_format
    pf.space_before = Pt(0)
    pf.space_after = Pt(4)
    pPr = p._p.get_or_add_pPr()
    pBdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), "6")       # 0.75 pt
    bottom.set(qn("w:space"), "1")
    bottom.set(qn("w:color"), "4A8B8C")
    pBdr.append(bottom)
    pPr.append(pBdr)


def _add_page_num_field(paragraph) -> None:
    """Insert 'Page <PAGE>' into paragraph using a Word field."""
    run = paragraph.add_run("Page ")
    run.font.name = "Arial"
    run.font.size = Pt(9)
    run.font.color.rgb = NEAR_BLACK_RGB

    def _field_char(type_: str):
        fc = OxmlElement("w:fldChar")
        fc.set(qn("w:fldCharType"), type_)
        r = OxmlElement("w:r")
        r.append(fc)
        return r

    instr_r = OxmlElement("w:r")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = " PAGE "
    instr_r.append(instr)

    paragraph._p.append(_field_char("begin"))
    paragraph._p.append(instr_r)
    paragraph._p.append(_field_char("end"))


def generate_docx(
    content: str,
    title: str,
    room_name: str,
    user_name: str,
    date: str,
) -> bytes:
    doc = Document()

    # ---- Page setup --------------------------------------------------------
    section = doc.sections[0]
    section.page_width = Cm(21)
    section.page_height = Cm(29.7)
    section.left_margin = Cm(2.5)
    section.right_margin = Cm(2.5)
    section.top_margin = Cm(2.5)
    section.bottom_margin = Cm(2.5)
    section.different_first_page_header_footer = True

    logo_path = _get_logo_path()

    # ---- Body header: logo right-aligned -----------------------------------
    header = section.header
    h_para = header.paragraphs[0]
    h_para.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    h_para.paragraph_format.space_after = Pt(0)
    if logo_path:
        h_para.add_run().add_picture(logo_path, width=Cm(2.5))
    else:
        run = h_para.add_run("Roundtable")
        _set_run(run, 10, bold=True, color=TEAL_RGB)

    # ---- Body footer: page number right-aligned ----------------------------
    footer = section.footer
    f_para = footer.paragraphs[0]
    f_para.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    _add_page_num_field(f_para)

    # ---- Cover footer: Private & Confidential ------------------------------
    cf_para = section.first_page_footer.paragraphs[0]
    run = cf_para.add_run("Private & Confidential")
    _set_run(run, 9, color=GREY_RGB)

    # ========================================================================
    # COVER PAGE
    # ========================================================================

    # Logo — top right
    if logo_path:
        lp = doc.add_paragraph()
        lp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        lp.paragraph_format.space_before = Pt(0)
        lp.paragraph_format.space_after = Pt(0)
        lp.add_run().add_picture(logo_path, width=Cm(3.5))

    # Whitespace
    for _ in range(7):
        sp = doc.add_paragraph()
        sp.paragraph_format.space_before = Pt(0)
        sp.paragraph_format.space_after = Pt(0)

    # Report title (28pt bold near-black)
    _add_para(doc, title, size_pt=28, bold=True, color=NEAR_BLACK_RGB,
              space_before=0, space_after=6)

    # Subtitle (13pt teal)
    _add_para(doc, "Consult Room Report", size_pt=13, color=TEAL_RGB,
              space_before=0, space_after=4)

    # Teal rule
    _teal_rule(doc)

    # Metadata block
    for line in [
        f"Room: {room_name}",
        f"Prepared for: {user_name}",
        f"Date: {date}",
    ]:
        _add_para(doc, line, size_pt=11, color=NEAR_BLACK_RGB,
                  space_before=2, space_after=2)

    # Page break → body
    doc.add_page_break()

    # ========================================================================
    # REPORT BODY
    # ========================================================================

    for kind, text in _parse_md(content):
        if kind == "h1":
            _add_para(doc, text, size_pt=13, bold=True, color=TEAL_RGB,
                      space_before=14, space_after=0)
            _teal_rule(doc)
        elif kind == "h2":
            _add_para(doc, text, size_pt=11, bold=True, color=TEAL_RGB,
                      space_before=8, space_after=2)
        elif kind == "bullet":
            p = doc.add_paragraph(style="List Bullet")
            p.paragraph_format.space_before = Pt(0)
            p.paragraph_format.space_after = Pt(2)
            p.paragraph_format.line_spacing = 1.15
            for seg, is_bold in _split_bold(text):
                run = p.add_run(seg)
                _set_run(run, 11, bold=is_bold, color=NEAR_BLACK_RGB)
        elif kind == "para" and text:
            _add_para(doc, text, size_pt=11, color=NEAR_BLACK_RGB,
                      space_before=0, space_after=4)
        # empty → skip

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


# ===========================================================================
# PDF generation (reportlab)
# ===========================================================================

def _rl_styles() -> dict[str, ParagraphStyle]:
    """Build the reportlab paragraph styles."""
    base = dict(fontName="Helvetica", fontSize=11, leading=11 * 1.15,
                textColor=NEAR_BLACK_RL, spaceAfter=6)
    return {
        "body": ParagraphStyle("body", **base),
        "h1": ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=13,
                             leading=13 * 1.2, textColor=TEAL_RL,
                             spaceBefore=14, spaceAfter=2),
        "h2": ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=11,
                             leading=11 * 1.2, textColor=TEAL_RL,
                             spaceBefore=8, spaceAfter=2),
        "bullet": ParagraphStyle("bullet", fontName="Helvetica", fontSize=11,
                                 leading=11 * 1.15, textColor=NEAR_BLACK_RL,
                                 leftIndent=18, firstLineIndent=0,
                                 bulletIndent=6, spaceAfter=3),
        "cover_title": ParagraphStyle("cover_title", fontName="Helvetica-Bold",
                                      fontSize=28, leading=32,
                                      textColor=NEAR_BLACK_RL, spaceAfter=8),
        "cover_sub": ParagraphStyle("cover_sub", fontName="Helvetica",
                                    fontSize=13, leading=16,
                                    textColor=TEAL_RL, spaceAfter=6),
        "cover_meta": ParagraphStyle("cover_meta", fontName="Helvetica",
                                     fontSize=11, leading=14,
                                     textColor=NEAR_BLACK_RL, spaceAfter=3),
    }


def _md_to_rl_html(text: str) -> str:
    """Convert **bold** markers to reportlab HTML bold tags."""
    return re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)


class _PDFDoc(BaseDocTemplate):
    """Thin subclass to carry logo_path into page callbacks."""
    logo_path: str | None = None


def generate_pdf(
    content: str,
    title: str,
    room_name: str,
    user_name: str,
    date: str,
) -> bytes:
    buf = io.BytesIO()
    logo_path = _get_logo_path()

    pw, ph = A4
    margin = 2.5 * cm
    text_w = pw - 2 * margin
    text_h = ph - 2 * margin

    doc = _PDFDoc(buf, pagesize=A4,
                  leftMargin=margin, rightMargin=margin,
                  topMargin=margin, bottomMargin=margin)
    doc.logo_path = logo_path

    # ---- Page templates ----------------------------------------------------

    cover_frame = Frame(margin, margin, text_w, text_h, id="cover",
                        leftPadding=0, rightPadding=0,
                        topPadding=0, bottomPadding=0)

    body_top_margin = margin + 1.5 * cm   # room for header
    body_frame = Frame(margin, margin, text_w,
                       ph - body_top_margin - margin,
                       id="body",
                       leftPadding=0, rightPadding=0,
                       topPadding=0, bottomPadding=0)

    def _on_cover(canvas, doc_):
        canvas.saveState()
        canvas.setFont("Helvetica", 9)
        canvas.setFillColor(GREY_RL)
        canvas.drawString(margin, margin * 0.7, "Private & Confidential")
        canvas.restoreState()

    def _on_body(canvas, doc_):
        canvas.saveState()
        # Header: logo (or text) right-aligned
        if doc_.logo_path and os.path.exists(doc_.logo_path):
            logo_h = 1.0 * cm
            logo_w = 2.5 * cm
            canvas.drawImage(
                doc_.logo_path,
                pw - margin - logo_w,
                ph - margin * 0.85 - logo_h,
                width=logo_w, height=logo_h,
                preserveAspectRatio=True, anchor="ne",
                mask="auto",
            )
        else:
            canvas.setFont("Helvetica-Bold", 10)
            canvas.setFillColor(TEAL_RL)
            canvas.drawRightString(pw - margin, ph - margin * 0.75, "Roundtable")

        # Footer: Page N
        canvas.setFont("Helvetica", 9)
        canvas.setFillColor(NEAR_BLACK_RL)
        canvas.drawRightString(pw - margin, margin * 0.7, f"Page {doc_.page}")
        canvas.restoreState()

    doc.addPageTemplates([
        PageTemplate(id="Cover", frames=[cover_frame], onPage=_on_cover),
        PageTemplate(id="Body",  frames=[body_frame],  onPage=_on_body),
    ])

    styles = _rl_styles()
    story = []

    # ========================================================================
    # COVER PAGE
    # ========================================================================

    story.append(NextPageTemplate("Cover"))

    # Logo — right-aligned via a right-aligned paragraph
    if logo_path and os.path.exists(logo_path):
        logo_para_style = ParagraphStyle("logo_right", alignment=TA_RIGHT,
                                         spaceAfter=0)
        img = Image(logo_path, width=3.5 * cm, height=None)
        img.hAlign = "RIGHT"
        story.append(img)
    else:
        story.append(Paragraph("<b>Roundtable</b>",
                                ParagraphStyle("logo_text", fontName="Helvetica-Bold",
                                               fontSize=16, textColor=TEAL_RL,
                                               alignment=TA_RIGHT)))

    # Whitespace before title
    story.append(Spacer(1, 5 * cm))

    # Title
    story.append(Paragraph(title, styles["cover_title"]))

    # Subtitle
    story.append(Paragraph("Consult Room Report", styles["cover_sub"]))

    # Teal rule
    story.append(HRFlowable(width="100%", thickness=1, color=TEAL_RL,
                             spaceAfter=8))

    # Metadata
    for line in [
        f"Room: {room_name}",
        f"Prepared for: {user_name}",
        f"Date: {date}",
    ]:
        story.append(Paragraph(line, styles["cover_meta"]))

    # Switch template + page break
    story.append(NextPageTemplate("Body"))
    story.append(PageBreak())

    # ========================================================================
    # REPORT BODY
    # ========================================================================

    for kind, text in _parse_md(content):
        html = _md_to_rl_html(text)
        if kind == "h1":
            story.append(KeepTogether([
                Paragraph(html, styles["h1"]),
                HRFlowable(width="100%", thickness=1, color=TEAL_RL,
                           spaceBefore=2, spaceAfter=6),
            ]))
        elif kind == "h2":
            story.append(Paragraph(html, styles["h2"]))
        elif kind == "bullet":
            story.append(Paragraph(f"\u2022&nbsp;&nbsp;{html}", styles["bullet"]))
        elif kind == "para" and text:
            story.append(Paragraph(html, styles["body"]))
        # empty → skip

    doc.build(story)
    return buf.getvalue()
