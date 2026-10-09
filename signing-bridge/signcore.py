"""NyayDwar Sign Bridge — PDF signing core (works on Windows, Linux and macOS).

* Finds where the signature belongs (role keywords such as
  "Locate the Advocate Signature Here", or the hidden marker
  "Locate the Judicial Officer Signature Here" that NyayDwar prints in the
  Judicial Officer's signature block). If nothing is found, the signature
  goes to the bottom-right of the last page.
* Adds a visible signature box there and signs with the signer given
  (a PKCS#11 token signer in normal use).
"""
from __future__ import annotations

import io
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Iterable, Optional

from pdfminer.high_level import extract_pages
from pdfminer.layout import LTChar, LTTextContainer, LTTextLine, LAParams
from pyhanko.pdf_utils.content import RawContent
from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
from pyhanko.pdf_utils.layout import AxisAlignment, BoxConstraints, InnerScaling, SimpleBoxLayoutRule
from pyhanko.pdf_utils.text import TextBoxStyle
from pyhanko.sign import fields, signers
from pyhanko.stamp import TextStampStyle

BOX_W = 175.0   # points
BOX_H = 52.0


@dataclass
class Spot:
    page: int              # 0-based page index
    x0: float
    y0: float
    x1: float
    y1: float
    keyword: str = ""
    page_w: float = 595.0
    page_h: float = 842.0


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def _iter_lines(obj):
    if isinstance(obj, LTTextLine):
        yield obj
        return
    if isinstance(obj, LTTextContainer) or hasattr(obj, "__iter__"):
        try:
            for child in obj:
                yield from _iter_lines(child)
        except TypeError:
            return


def scan(pdf_bytes: bytes, keywords: Iterable[str]):
    """(last matching Spot or None, page count, last page width, last page height)."""
    wanted = [(k, _norm(k)) for k in keywords if _norm(k)]
    found: Optional[Spot] = None
    count, pw, ph = 0, 595.0, 842.0
    for page_no, page in enumerate(extract_pages(io.BytesIO(pdf_bytes), laparams=LAParams(char_margin=4.0))):
        count, pw, ph = page_no + 1, float(page.width), float(page.height)
        if not wanted:
            continue
        for line in _iter_lines(page):
            chars = [c for c in line if isinstance(c, LTChar)]
            if not chars:
                continue
            norm_chars, idx = [], []
            for i, c in enumerate(chars):
                for ch in _norm(c.get_text()):
                    norm_chars.append(ch)
                    idx.append(i)
            text = "".join(norm_chars)
            for raw, key in wanted:
                pos = text.rfind(key)
                if pos < 0:
                    continue
                first, last = chars[idx[pos]], chars[idx[pos + len(key) - 1]]
                found = Spot(page_no, min(first.x0, last.x0), min(first.y0, last.y0), max(first.x1, last.x1),
                             max(first.y1, last.y1), raw, pw, ph)
    return found, count, pw, ph


def signature_box(spot: Optional[Spot], last_page: int, page_w: float, page_h: float):
    """(page, (x1, y1, x2, y2), compact) for the visible signature."""
    if spot is None:
        return last_page, (page_w - 36 - BOX_W, 40, page_w - 36, 40 + BOX_H), False
    width = spot.x1 - spot.x0
    if width < 25:
        # tiny hidden marker (Judicial Officer's signing space): centre the
        # box on it, standing just above it, compact enough for the space
        w, h = 170.0, 38.0
        cx = (spot.x0 + spot.x1) / 2
        x1 = max(10, min(cx - w / 2, spot.page_w - 10 - w))
        y1 = spot.y0 + 1
        compact = True
    else:
        # visible placeholder text: cover it (white box) and grow upwards
        w, h = max(BOX_W, width + 12), BOX_H
        x1 = max(10, min(spot.x0 - 6, spot.page_w - 10 - w))
        y1 = spot.y0 - 1
        compact = False
    y1 = max(10, min(y1, spot.page_h - 10 - h))
    return spot.page, (x1, y1, x1 + w, y1 + h), compact


def _stamp_style(reason: str, box, compact: bool, label: str = "") -> TextStampStyle:
    bw, bh = int(box[2] - box[0]) + 2, int(box[3] - box[1]) + 2
    white = RawContent(b"q 1 1 1 rg 0 0 %d %d re f Q" % (bw, bh), box=BoxConstraints(width=bw, height=bh))
    lines = "Digitally signed by\n%(signer)s\nDate: %(ts)s"
    if label:   # e.g. "Prepared by" for the staff member who prepared a warrant
        lines = label.replace("%", "%%")[:40] + "\n" + lines
    if reason and not compact and not label:
        lines += "\n" + reason.replace("%", "%%")[:60]
    return TextStampStyle(
        stamp_text=lines, timestamp_format="%d-%m-%Y %H:%M:%S",
        background=white, background_opacity=1.0, border_width=1,
        background_layout=SimpleBoxLayoutRule(x_align=AxisAlignment.ALIGN_MID, y_align=AxisAlignment.ALIGN_MID,
                                              inner_content_scaling=InnerScaling.STRETCH_FILL),
        text_box_style=TextBoxStyle(font_size=7 if compact else 8),
    )


def sign_pdf(pdf_bytes: bytes, signer, keywords: Iterable[str] = (), reason: str = "", location: str = "",
             signer_name: str = "", label: str = "") -> tuple[bytes, dict]:
    spot, count, pw, ph = scan(pdf_bytes, keywords)
    if count < 1:
        raise ValueError("The PDF has no pages")
    page, box, compact = signature_box(spot, count - 1, pw, ph)
    field = "NyayDwarSign_" + datetime.now().strftime("%Y%m%d%H%M%S")
    w = IncrementalPdfFileWriter(io.BytesIO(pdf_bytes), strict=False)
    fields.append_signature_field(w, fields.SigFieldSpec(sig_field_name=field, on_page=page, box=box))
    # The visible stamp shows the certificate holder's name (from the DSC itself).
    meta = signers.PdfSignatureMetadata(field_name=field, reason=reason or None, location=location or None)
    out = io.BytesIO()
    signers.PdfSigner(meta, signer=signer, stamp_style=_stamp_style(reason, box, compact, label)).sign_pdf(w, output=out)
    return out.getvalue(), {"page": page + 1, "box": [round(v, 1) for v in box],
                            "placed_at": spot.keyword if spot else "bottom-right of the last page"}
