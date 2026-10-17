import csv, re, sys, zipfile
import xml.etree.ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}

path = sys.argv[1]
z = zipfile.ZipFile(path)

# shared strings
shared = []
if "xl/sharedStrings.xml" in z.namelist():
    root = ET.fromstring(z.read("xl/sharedStrings.xml"))
    for si in root.findall("m:si", NS):
        shared.append("".join(t.text or "" for t in si.iter(
            "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t")))

# sheet name -> target
rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
rel_map = {r.get("Id"): r.get("Target") for r in rels}
wb = ET.fromstring(z.read("xl/workbook.xml"))

def col_index(ref):
    letters = re.match(r"([A-Z]+)", ref).group(1)
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - 64)
    return n - 1

def col_letters(idx):
    s = ""
    idx += 1
    while idx:
        idx, rem = divmod(idx - 1, 26)
        s = chr(65 + rem) + s
    return s


def sheet_hyperlinks(target):
    """ref -> url, read from the sheet's own .rels part."""
    rels_path = target.replace("xl/worksheets/", "xl/worksheets/_rels/") + ".rels"
    if rels_path not in z.namelist():
        return {}
    rroot = ET.fromstring(z.read(rels_path))
    urls = {r.get("Id"): r.get("Target") for r in rroot}
    xml = z.read(target).decode("utf-8")
    out = {}
    for ref, rid in re.findall(r'<hyperlink ref="([A-Z]+[0-9]+)" r:id="(rId[0-9]+)"', xml):
        if rid in urls:
            out[ref] = urls[rid]
    return out


for sheet in wb.find("m:sheets", NS):
    name = sheet.get("name")
    rid = sheet.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
    target = rel_map[rid].lstrip("/")
    if not target.startswith("xl/"):
        target = "xl/" + target
    print("=" * 70)
    print(f"SHEET: {name}   ({target})")
    print("=" * 70)
    ws = ET.fromstring(z.read(target))
    rows = []
    for row in ws.findall(".//m:row", NS):
        cells = {}
        for c in row.findall("m:c", NS):
            ref = c.get("r")
            t = c.get("t")
            v = c.find("m:v", NS)
            isel = c.find("m:is", NS)
            if t == "s" and v is not None:
                val = shared[int(v.text)]
            elif t == "inlineStr" and isel is not None:
                val = "".join(x.text or "" for x in isel.iter(
                    "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t"))
            elif v is not None:
                val = v.text
            else:
                val = ""
            if val:
                cells[col_index(ref)] = val
        rows.append(cells)
    width = max((max(r) + 1 for r in rows if r), default=0)
    w = csv.writer(sys.stdout, lineterminator="\n")
    for r in rows:
        out = [r.get(i, "") for i in range(width)]
        if any(x.strip() for x in out):
            w.writerow(out)

    links = sheet_hyperlinks(target)
    if links:
        header = {c: (rows[0].get(c, "") if rows else "") for c in range(width)}
        print()
        print(f"--- hyperlinks in '{name}' ({len(links)}) ---")
        wl = csv.writer(sys.stdout, lineterminator="\n")
        wl.writerow(["cell", "column_header", "cell_text", "url"])
        for ref in sorted(links, key=lambda x: (int(re.search(r"[0-9]+", x).group()), x)):
            col = col_index(ref)
            row_i = int(re.search(r"[0-9]+", ref).group()) - 1
            text = rows[row_i].get(col, "") if row_i < len(rows) else ""
            wl.writerow([ref, header.get(col, ""), text, links[ref]])
    print()
