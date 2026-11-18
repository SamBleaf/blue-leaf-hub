#!/usr/bin/env python3
"""
Maps the LVL design-guide tables Sam named (HUB 031, 17 Nov 2026) into data the Hub reads:

  ~/Downloads/Smart10-LVL-Design-Guide-2024.pdf          (Smart10 LVL Stud Design Guide, Mar 2024)  -> studs
  ~/Downloads/SmartLVL13-Design-Guide-E1-2021.pdf        (SmartLVL 13 Design Guide, E1 2021)        -> lintels

Output: shared/takeoff/standards/data/smart10-2024.js and smartlvl13-e1-2021.js (ES modules: `export default` of the data). Values come from the PDFs' text
layer (pdftotext -layout), never retyped; each table records the PDF page and the guide's own printed page. A
subscript beside a lintel span (the extra bearing in mm beyond the 35 mm minimum) is glued to the number by the text
layer ("150010" = 1,500 with 10 mm more bearing); spans are multiples of 100 so it is split exactly, and every row is
checked for its cell count. After extraction the numbers were read against the rendered pages (see the SOP's table
record). Run: python3 -I scripts/takeoff/standards/extract-lvl-guides.py
"""
import hashlib, json, os, re, subprocess, sys

HOME = os.path.expanduser("~")
S10 = f"{HOME}/Downloads/Smart10-LVL-Design-Guide-2024.pdf"
L13 = f"{HOME}/Downloads/SmartLVL13-Design-Guide-E1-2021.pdf"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "shared", "takeoff", "standards", "data")

SIZE = re.compile(r"^(?:(\d)/)?(\d{2,3})x(\d{2,3})$")


def page(pdf, n):
    return subprocess.run(["pdftotext", "-layout", "-f", str(n), "-l", str(n), pdf, "-"], capture_output=True, text=True, check=True).stdout.split("\n")


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def size_parts(tok):
    m = SIZE.match(tok)
    if not m:
        return None
    plies = int(m.group(1)) if m.group(1) else 1
    return {"size": tok, "plies": plies, "depthMm": int(m.group(2)), "breadthMm": int(m.group(3))}


def span_cell(tok):
    """'NS' -> (None, 0); '1500' -> (1500, 0); '150010' -> (1500, 10); '27005' -> (2700, 5); '900' -> (900, 0)."""
    if tok == "NS":
        return (None, 0)
    if not tok.isdigit():
        raise ValueError(f"not a cell: {tok}")
    if len(tok) >= 4 and tok[2:4] == "00":
        span, sub = int(tok[:4]), tok[4:]
    elif len(tok) >= 3 and tok[1:3] == "00":
        span, sub = int(tok[:3]), tok[3:]
    else:
        raise ValueError(f"span is not a multiple of 100: {tok}")
    if sub not in ("", "5", "10", "15", "20", "25", "30", "35", "40", "45", "50"):
        raise ValueError(f"odd bearing subscript in {tok}")
    return (span, int(sub or 0))


def plain_cell(tok):
    return None if tok == "NS" else int(tok)


def between(lines, start_pat, end_pat):
    out, on = [], False
    for ln in lines:
        if not on and re.search(start_pat, ln):
            on = True
            continue
        if on and re.search(end_pat, ln):
            break
        if on:
            out.append(ln)
    return out


# ── lintels (both guides): rows of  size  mass(40|90)  10 cells ─────────────────────────────────────────────────────
LINTEL_COLUMNS = [{"rlwMm": r, "spacingMm": s} for r in (1500, 3000, 4500, 6000, 7500) for s in (600, 1200)]


def lintel_rows(lines, size_with_mass_line):
    """size_with_mass_line True (SmartLVL13): the size starts the 40 row. False (Smart10): the size is alone between the 40 and 90 rows."""
    rows, labels, masses = [], [], []
    for ln in lines:
        toks = ln.split()
        if not toks:
            continue
        if size_parts(toks[0]) and len(toks) == 1:
            labels.append(toks[0])
            continue
        lab = None
        if size_parts(toks[0]):
            lab = toks.pop(0)
        if toks and toks[0] in ("40", "90") and len(toks) == 11:
            mass = int(toks.pop(0))
            cells = [span_cell(t) for t in toks]
            masses.append((lab, mass, cells))
    if size_with_mass_line:
        cur = None
        for lab, mass, cells in masses:
            if lab:
                cur = lab
            rows.append((cur, mass, cells))
    else:
        # pairs in order: [40 row, 90 row] share the label that sits between them
        assert len(masses) == 2 * len(labels), f"{len(masses)} mass rows vs {len(labels)} labels"
        for i, (lab, mass, cells) in enumerate(masses):
            rows.append((labels[i // 2], mass, cells))
    out = []
    for lab, mass, cells in rows:
        assert len(cells) == 10, f"{lab} {mass}: {len(cells)} cells"
        sp = size_parts(lab)
        out.append({**sp, "massKgM2": mass, "spansMm": [c[0] for c in cells], "extraBearingMm": [c[1] for c in cells]})
    return out


def l13_lintels():
    rows = []
    for n in (22, 23):
        lines = page(L13, n)
        body = between(lines, r"Member size", r"^NOTES")
        rows += lintel_rows(body, True)
    return rows


# ── SmartLVL 13 lower-storey lintels (guide p. 23 sheet, p. 24 tile): size + 12 cells (4 roof load widths x 3 upper floor load widths) ──
LOWER_COLUMNS = [{"rlwMm": r, "floorLwMm": f} for r in (1500, 3000, 4500, 6000) for f in (1200, 2400, 3600)]


def l13_lower(pdf_page):
    rows = []
    body = between(page(L13, pdf_page), r"Member size", r"^NOTES|SmartLVL 13 Design Guide")
    for ln in body:
        toks = ln.split()
        if len(toks) == 13 and size_parts(toks[0]):
            cells = [span_cell(t) for t in toks[1:]]
            rows.append({**size_parts(toks[0]), "spansMm": [c[0] for c in cells], "extraBearingMm": [c[1] for c in cells]})
    assert len(rows) == 27, f"p{pdf_page}: {len(rows)} rows"
    return rows


def l13_lower_table():
    return {"id": "L13-LINTEL-LOWER", "title": "Single span lintels in lower storey walls (SmartLVL 13), AS 4055 N1-N4 & C1", "member": "lintel", "storey": "lower", "restraintMm": 600, "minBearingMm": 35,
            "wind": ["N1", "N2", "N3", "N4", "C1"], "windNote": "one table covers N1 to N4 and C1; no rafter/truss spacing column (the guide's diagram shows spacing but the table does not use it)",
            "floorLwLabel": "upper floor load width", "columns": LOWER_COLUMNS,
            "roof": {"sheet": {"massKgM2": 40, "citation": {"pdfPage": 26, "guidePage": 23}, "rows": l13_lower(26)},
                     "tile": {"massKgM2": 90, "citation": {"pdfPage": 27, "guidePage": 24}, "rows": l13_lower(27)}}}


def s10_lintels():
    lines = page(S10, 17)
    body = between(lines, r"Wind classification N1-N4", r"Wind classification C1-C3")
    return lintel_rows(body, False)


# ── Smart10 studs: height rows with cells; size labels sit beside the first (or middle) row of a block ───────────────
def height_blocks(lines, ncells, heights):
    rows, labels = [], []
    for ln in lines:
        toks = ln.split()
        if not toks:
            continue
        lab = None
        if size_parts(toks[0]):
            lab = toks.pop(0)
            if lab:
                labels.append(lab)
        if toks and toks[0].isdigit() and int(toks[0]) in heights and len(toks) == ncells + 1:
            h = int(toks.pop(0))
            rows.append((h, [plain_cell(t) for t in toks]))
        elif lab and len(toks) == 0:
            pass
    blocks, cur = [], []
    for h, cells in rows:
        if cur and h <= cur[-1][0]:
            blocks.append(cur)
            cur = []
        cur.append((h, cells))
    if cur:
        blocks.append(cur)
    assert len(blocks) == len(labels), f"{len(blocks)} blocks vs {len(labels)} size labels: {labels}"
    out = []
    for lab, blk in zip(labels, blocks):
        sp = size_parts(lab)
        for h, cells in blk:
            out.append({**sp, "heightMm": h, "cells": cells})
    return out


def s10_jambs():
    lines = page(S10, 11)
    body = between(lines, r"Size DxB", r"^NOTES")
    rows = height_blocks(body, 10, {2400, 2700, 3000, 3600})
    cols = [{"roof": r, "rlwMm": w} for r in ("sheet", "tile") for w in (1500, 3000, 4500, 6000, 7500)]
    return cols, [{"config": r["size"], "plies": r["plies"], "jambsPerSide": r["plies"], "depthMm": r["depthMm"], "breadthMm": r["breadthMm"], "heightMm": r["heightMm"], "maxOpeningMm": r["cells"]} for r in rows]


def s10_studs(pdf_page):
    lines = page(S10, pdf_page)
    out = []
    for spacing in (450, 600):
        pat = rf"Stud spacing {spacing} mm"
        nxt = r"Stud spacing 600 mm" if spacing == 450 else r"^NOTES"
        body = between(lines, pat, nxt)
        for r in height_blocks(body, 8, {2400, 2700, 3000, 3600}):
            out.append({"size": r["size"], "plies": r["plies"], "depthMm": r["depthMm"], "breadthMm": r["breadthMm"], "heightMm": r["heightMm"], "studSpacingMm": spacing, "maxRlwMm": r["cells"]})
    cols = [{"roof": r, "rafterSpacingMm": s} for r in ("sheet", "tile") for s in (450, 600, 900, 1200)]
    return cols, out


def main():
    os.makedirs(OUT, exist_ok=True)
    jcols, jrows = s10_jambs()
    c7, r7 = s10_studs(7)
    c9, r9 = s10_studs(9)
    smart10 = {
        "_about": "Smart10 LVL Stud Design Guide (Tilling Timber, Mar 2024), AS 4055 N1-N4, single/upper storey, tables for Smart10 LVL STUDS. Smart10 is for internal, fully protected walls (guide p. 3). C1-C3 pages, lower storey, concentrated-load and rafter/joist pages are not mapped. Generated by scripts/takeoff/standards/extract-lvl-guides.py: do not hand-edit.",
        "source": {"pdf": "~/Downloads/Smart10-LVL-Design-Guide-2024.pdf", "title": "Smart10 LVL Design Guide", "edition": "Mar 2024", "manufacturer": "Tilling Timber", "product": "Smart10", "wind": ["N1", "N2", "N3", "N4"], "sha256": sha(S10)},
        "tables": {
            "S10-JAMB": {"id": "S10-JAMB", "title": "Jamb Stud - single or upper load bearing walls", "member": "jamb", "storey": "single_upper", "wallMassKgM2": {"sheet": 40, "tile": 90},
                          "citation": {"pdfPage": 11, "guidePage": 9}, "columns": jcols, "rows": jrows},
            "S10-STUD-UN": {"id": "S10-STUD-UN", "title": "Common Stud - single/upper storey walls - un-notched", "member": "stud", "storey": "single_upper", "notched": False,
                             "citation": {"pdfPage": 7, "guidePage": 5}, "columns": c7, "rows": r7},
            "S10-STUD-N20": {"id": "S10-STUD-N20", "title": "Common Stud - single/upper storey walls - 20 mm notched", "member": "stud", "storey": "single_upper", "notched": True,
                              "citation": {"pdfPage": 9, "guidePage": 7}, "columns": c9, "rows": r9},
            "S10-LINTEL": {"id": "S10-LINTEL", "title": "Single span lintels in single/upper storey walls (Smart10)", "member": "lintel", "storey": "single_upper",
                            "citation": {"pdfPage": 17, "guidePage": 15, "note": "the N1-N4 block; the C1-C3 block is not mapped"}, "columns": LINTEL_COLUMNS, "rows": s10_lintels()},
        },
    }
    l13 = {
        "_about": "SmartLVL 13 Design Guide (Tilling Timber, E1 2021), AS 4055 N1-N4, single span lintels in single/upper storey walls. Minimum bearing 35 mm; extraBearingMm is the subscript (extra bearing beyond 35 mm) where the guide gives one. The other member tables (floor joists and bearers, rafters, ridge, verandah and hanging beams, hip, underpurlins, strutting and counter beams, ceiling joists, carport beams), the C1-C3 pages are not mapped. Lower-storey lintels (L13-LINTEL-LOWER, pdf pages 26-27) are mapped. Generated by scripts/takeoff/standards/extract-lvl-guides.py: do not hand-edit.",
        "source": {"pdf": "~/Downloads/SmartLVL13-Design-Guide-E1-2021.pdf", "title": "SmartLVL 13 Design Guide", "edition": "E1 2021", "manufacturer": "Tilling Timber", "product": "SmartLVL13", "wind": ["N1", "N2", "N3", "N4"], "sha256": sha(L13)},
        "tables": {
            "L13-LINTEL": {"id": "L13-LINTEL", "title": "Single span lintels in single/upper storey walls (SmartLVL 13)", "member": "lintel", "storey": "single_upper", "restraintMm": 600, "minBearingMm": 35,
                            "citation": {"pdfPages": [22, 23], "guidePages": [19, 20]}, "columns": LINTEL_COLUMNS, "rows": l13_lintels()},
            "L13-LINTEL-LOWER": l13_lower_table(),
        },
    }
    for fname, d in (("smart10-2024.js", smart10), ("smartlvl13-e1-2021.js", l13)):
        with open(os.path.join(OUT, fname), "w") as f:
            f.write("// GENERATED by scripts/takeoff/standards/extract-lvl-guides.py from the manufacturer's design guide PDF. Do not hand-edit values.\n")
            f.write("export default " + json.dumps(d, indent=1) + ";\n")
    for name, d in (("smart10", smart10), ("smartlvl13", l13)):
        for k, t in d["tables"].items():
            print(f"{name} {k}: {len(t['rows']) if 'rows' in t else {r: len(v['rows']) for r, v in t['roof'].items()}} rows")


if __name__ == "__main__":
    sys.exit(main())
