"""Build the Faceless Creator Kit buyer guide PDF from kit/sales/buyer-guide.md.

Shared by build_guide.py (placeholder code box) and make_access_pdf.py (a
real code per buyer). Needs reportlab (pip install reportlab).

Markdown subset understood: # / ## / ### headings, paragraphs, "- " bullets,
"1. " numbered lists, **bold**, `code`, ![alt](image path relative to the .md),
the line [[ACCESS_CODE]] (the code box) and {{KIT_URL}}.
"""
import os
import re
from xml.sax.saxutils import escape

from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Flowable,
    Frame,
    Image,
    KeepTogether,
    ListFlowable,
    ListItem,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
)

HERE = os.path.dirname(os.path.abspath(__file__))
KIT = os.path.dirname(HERE)
GUIDE_MD = os.path.join(KIT, "sales", "buyer-guide.md")
DEFAULT_URL = "https://plazzers.github.io/channel-studio/kit/"

INK = HexColor("#1C1A27")
CORAL = HexColor("#FF6B4A")
PAPER = HexColor("#F7F3EC")
MUTED = HexColor("#6B6878")
SOFT = HexColor("#FFE6DF")
LINE = HexColor("#E3DFD6")

_fonts_done = False


def register_fonts():
    global _fonts_done
    if _fonts_done:
        return
    d = os.path.join(HERE, "fonts")
    pdfmetrics.registerFont(TTFont("Grotesk", os.path.join(d, "SpaceGrotesk-Bold.ttf")))
    pdfmetrics.registerFont(TTFont("Grotesk-Medium", os.path.join(d, "SpaceGrotesk-Medium.ttf")))
    pdfmetrics.registerFont(TTFont("Inter", os.path.join(d, "Inter-Regular.ttf")))
    pdfmetrics.registerFont(TTFont("Inter-Bold", os.path.join(d, "Inter-SemiBold.ttf")))
    pdfmetrics.registerFont(TTFont("DejaVu", os.path.join(d, "DejaVuSans.ttf")))
    pdfmetrics.registerFontFamily("Inter", normal="Inter", bold="Inter-Bold", italic="Inter", boldItalic="Inter-Bold")
    _fonts_done = True


def styles():
    s = {}
    s["body"] = ParagraphStyle("body", fontName="Inter", fontSize=10.5, leading=15.5, textColor=INK, spaceAfter=7)
    s["h1"] = ParagraphStyle("h1", fontName="Grotesk", fontSize=26, leading=30, textColor=INK, spaceAfter=10)
    s["h2"] = ParagraphStyle("h2", fontName="Grotesk", fontSize=17, leading=21, textColor=INK, spaceBefore=14, spaceAfter=8)
    s["h3"] = ParagraphStyle("h3", fontName="Grotesk", fontSize=12.5, leading=16, textColor=CORAL, spaceBefore=8, spaceAfter=5)
    s["li"] = ParagraphStyle("li", parent=s["body"], spaceAfter=3)
    s["caption"] = ParagraphStyle("caption", parent=s["body"], fontSize=8.5, textColor=MUTED, alignment=TA_CENTER)
    return s


def inline(text, url):
    t = escape(text.replace("{{KIT_URL}}", url))
    t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)
    t = re.sub(r"`([^`]+)`", r'<font face="Courier" backColor="#F0EDE6">\1</font>', t)
    t = re.sub(r"(?<![\w*])\*([^*\s][^*]*?)\*(?![\w*])", r'<font color="#FF6B4A">\1</font>', t)
    t = re.sub(r"(https?://[^\s<]+[^\s<.,)])", r'<link href="\1" color="#E2532F">\1</link>', t)
    # Symbols the bundled Inter subset does not have.
    t = re.sub(r"([→⋮✓])", r'<font face="DejaVu">\1</font>', t)
    return t


class CodeBox(Flowable):
    """The access code box: the real code, or a blank to fill in."""

    def __init__(self, code, width):
        super().__init__()
        self.code = code
        self.width = width
        self.height = 30 * mm

    def wrap(self, aw, ah):
        return self.width, self.height

    def draw(self):
        c = self.canv
        c.setFillColor(SOFT)
        c.setStrokeColor(CORAL)
        c.setLineWidth(1.6)
        c.setDash(4, 3) if not self.code else c.setDash()
        c.roundRect(0, 0, self.width, self.height, 10, fill=1, stroke=1)
        c.setDash()
        c.setFillColor(CORAL)
        c.setFont("Grotesk", 9.5)
        c.drawString(14, self.height - 18, "YOUR ACCESS CODE")
        c.setFillColor(INK)
        if self.code:
            c.setFont("Courier-Bold", 24)
            c.drawString(14, 18, "ACCESS CODE: " + self.code)
        else:
            c.setFont("Courier-Bold", 20)
            c.drawString(14, 20, "ACCESS CODE: ____-____-____")
        c.setFont("Inter", 8.5)
        c.setFillColor(MUTED)
        c.drawRightString(self.width - 14, self.height - 18, "Personal — please don't share it")


def parse_md(md, url, code, frame_w, st):
    flow = []
    lines = md.splitlines()
    i = 0
    para = []

    def flush():
        if para:
            flow.append(Paragraph(inline(" ".join(para), url), st["body"]))
            para.clear()

    while i < len(lines):
        line = lines[i].rstrip()
        if not line.strip():
            flush()
            i += 1
            continue
        if line.strip() == "[[ACCESS_CODE]]":
            flush()
            flow += [Spacer(1, 4), CodeBox(code, frame_w), Spacer(1, 10)]
            i += 1
            continue
        m = re.match(r"^(#{1,3})\s+(.*)$", line)
        if m:
            flush()
            level = len(m.group(1))
            if level == 1:
                i += 1
                continue  # the title is on the cover
            flow.append(Paragraph(inline(m.group(2), url), st["h%d" % level]))
            i += 1
            continue
        m = re.match(r"^!\[(.*?)\]\((.+?)\)$", line.strip())
        if m:
            flush()
            p = os.path.normpath(os.path.join(os.path.dirname(GUIDE_MD), m.group(2)))
            if os.path.exists(p):
                from PIL import Image as PILImage

                w, h = PILImage.open(p).size
                iw = frame_w
                ih = iw * h / w
                max_h = 95 * mm
                if ih > max_h:
                    ih = max_h
                    iw = ih * w / h
                flow.append(KeepTogether([Spacer(1, 4), Image(p, width=iw, height=ih), Paragraph(escape(m.group(1)), st["caption"])]))
            i += 1
            continue
        if re.match(r"^(\d+\.|-)\s+", line):
            flush()
            numbered = bool(re.match(r"^\d+\.", line))
            items = []
            while i < len(lines) and re.match(r"^(\d+\.|-)\s+", lines[i]):
                text = re.sub(r"^(\d+\.|-)\s+", "", lines[i].strip())
                items.append(ListItem(Paragraph(inline(text, url), st["li"]), leftIndent=16))
                i += 1
            flow.append(
                ListFlowable(
                    items,
                    bulletType="1" if numbered else "bullet",
                    start="1" if numbered else None,
                    bulletFontName="Grotesk" if numbered else "Inter",
                    bulletColor=CORAL,
                    bulletFontSize=10 if numbered else 9,
                    leftIndent=16,
                    spaceAfter=6,
                )
            )
            continue
        para.append(line.strip())
        i += 1
    flush()
    return flow


def _cover(canvas, doc):
    w, h = A4
    canvas.saveState()
    canvas.setFillColor(INK)
    canvas.rect(0, 0, w, h, fill=1, stroke=0)
    # Decorative shapes.
    canvas.setFillColor(CORAL)
    canvas.circle(w - 40 * mm, h - 35 * mm, 62 * mm, fill=1, stroke=0)
    canvas.setFillColor(HexColor("#2D2A4A"))
    canvas.circle(18 * mm, 40 * mm, 48 * mm, fill=1, stroke=0)
    # Logo mark.
    x, y = 22 * mm, h - 48 * mm
    canvas.setFillColor(CORAL)
    canvas.roundRect(x, y, 15 * mm, 17 * mm, 3 * mm, fill=1, stroke=0)
    canvas.setFillColor(white)
    p = canvas.beginPath()
    p.moveTo(x + 5.5 * mm, y + 4.5 * mm)
    p.lineTo(x + 5.5 * mm, y + 12.5 * mm)
    p.lineTo(x + 11.5 * mm, y + 8.5 * mm)
    p.close()
    canvas.drawPath(p, fill=1, stroke=0)
    canvas.setFillColor(PAPER)
    canvas.roundRect(x + 12 * mm, y + 3 * mm, 10 * mm, 14 * mm, 2 * mm, fill=1, stroke=0)
    canvas.setFillColor(CORAL)
    canvas.setFont("Grotesk", 11)
    canvas.drawString(22 * mm, h - 108 * mm, "QUICK START GUIDE")
    canvas.setFillColor(white)
    canvas.setFont("Grotesk", 44)
    canvas.drawString(22 * mm, h - 128 * mm, "Faceless")
    canvas.drawString(22 * mm, h - 146 * mm, "Creator Kit")
    canvas.setFont("Inter", 13)
    canvas.setFillColor(HexColor("#D2CFDD"))
    canvas.drawString(22 * mm, h - 162 * mm, "Channel Planner + Pin Factory — in your browser, offline,")
    canvas.drawString(22 * mm, h - 169 * mm, "with your data on your own device.")
    canvas.setFont("Inter", 9)
    canvas.setFillColor(HexColor("#A29FB3"))
    canvas.drawString(22 * mm, 16 * mm, "Open the kit: " + doc.kit_url)
    canvas.restoreState()


def _page(canvas, doc):
    w, h = A4
    canvas.saveState()
    canvas.setFillColor(CORAL)
    canvas.rect(0, h - 6 * mm, w, 6 * mm, fill=1, stroke=0)
    canvas.setFont("Inter", 8.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(20 * mm, 12 * mm, "Faceless Creator Kit — Quick Start Guide")
    canvas.drawRightString(w - 20 * mm, 12 * mm, str(doc.page))
    canvas.setStrokeColor(LINE)
    canvas.line(20 * mm, 17 * mm, w - 20 * mm, 17 * mm)
    canvas.restoreState()


def build_pdf(out_path, code=None, url=DEFAULT_URL):
    """Write the guide to out_path. code=None leaves a blank code box."""
    register_fonts()
    st = styles()
    w, h = A4
    margin = 20 * mm
    frame_w = w - 2 * margin
    doc = BaseDocTemplate(
        out_path,
        pagesize=A4,
        title="Faceless Creator Kit — Quick Start Guide",
        author="Faceless Creator Kit",
        subject="How to open, install and use the Faceless Creator Kit",
    )
    doc.kit_url = url
    cover = Frame(0, 0, w, h, id="cover")
    body = Frame(margin, 22 * mm, frame_w, h - 22 * mm - 16 * mm, id="body")
    doc.addPageTemplates([PageTemplate("cover", [cover], onPage=_cover), PageTemplate("body", [body], onPage=_page)])
    with open(GUIDE_MD, encoding="utf-8") as f:
        md = f.read()
    intro_title = re.search(r"^#\s+(.*)$", md, re.M)
    story = [NextPageTemplate("body"), PageBreak()]
    if intro_title:
        story.append(Paragraph(inline(intro_title.group(1), url), st["h1"]))
    story += parse_md(md, url, code, frame_w, st)
    doc.build(story)
    return out_path
