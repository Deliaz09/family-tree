APP_SOUR = "Arbore Genealogic"

def parseaza_gedcom(linii: list) -> tuple:
    indivizi, familii = {}, {}
    tip_rec = id_curent = sub_tag = famc_curent = None

    for linie in linii:
        linie = linie.strip()
        if not linie:
            continue
        parti = linie.split(" ", 2)
        try:
            nivel = int(parti[0])
        except (ValueError, IndexError):
            continue

        if nivel == 0:
            sub_tag = famc_curent = None
            rest = " ".join(parti[1:])
            if "@" in rest and "INDI" in rest:
                id_curent = rest.split("@")[1]; indivizi[id_curent] = {}; tip_rec = "INDI"
            elif "@" in rest and "FAM" in rest:
                id_curent = rest.split("@")[1]; familii[id_curent] = {"copii": []}; tip_rec = "FAM"
            else:
                tip_rec = None
        elif nivel == 1 and tip_rec == "INDI":
            tag = parti[1] if len(parti) > 1 else ""
            val = parti[2] if len(parti) > 2 else ""
            if tag == "NAME":   indivizi[id_curent]["full_name"] = val.replace("/", "").strip()
            elif tag == "SEX":  indivizi[id_curent]["gender"]    = val.strip()
            elif tag in ("BIRT", "DEAT"): sub_tag = tag
            elif tag == "NOTE": indivizi[id_curent]["note"]      = val
            elif tag == "ADDR": indivizi[id_curent].setdefault("address", val)
            elif tag == "PHON": indivizi[id_curent]["tel"] = val.strip()
            elif tag == "EMAIL": indivizi[id_curent]["email_addr"] = val.strip()
            elif tag == "OBJE": sub_tag = tag
            elif tag == "FAMC":

                famc_curent = val.replace("@", "").strip() or None
        elif nivel == 2 and tip_rec == "INDI":
            tag = parti[1] if len(parti) > 1 else ""
            val = parti[2] if len(parti) > 2 else ""
            if tag == "DATE":
                ani = [x for x in val.split() if x.isdigit() and len(x) == 4]
                if ani:
                    if sub_tag == "BIRT": indivizi[id_curent]["birth"] = int(ani[0])
                    elif sub_tag == "DEAT": indivizi[id_curent]["death"] = int(ani[0])
            elif tag == "GIVN": indivizi[id_curent]["given_name"] = val
            elif tag == "SURN": indivizi[id_curent]["surname"]    = val
            elif tag == "PLAC": indivizi[id_curent].setdefault("address", val)
            elif tag == "FILE" and sub_tag == "OBJE":
                indivizi[id_curent]["photo"] = val.strip()
            elif tag == "PEDI":
                pedi = val.strip().lower()
                if famc_curent and pedi == "adopted":
                    indivizi[id_curent].setdefault("famc_adoptate", []).append(famc_curent)
                elif famc_curent and pedi == "foster":
                    indivizi[id_curent].setdefault("famc_vitrege", []).append(famc_curent)
        elif nivel == 1 and tip_rec == "FAM":
            tag = parti[1] if len(parti) > 1 else ""
            val = (parti[2] if len(parti) > 2 else "").replace("@", "").strip()
            if tag == "HUSB":   familii[id_curent]["sot"]   = val
            elif tag == "WIFE": familii[id_curent]["sotie"] = val
            elif tag == "CHIL": familii[id_curent]["copii"].append(val)
            elif tag == "MARR": familii[id_curent].setdefault("type", "married")
            elif tag == "DIV":  familii[id_curent]["type"] = "divorced"
            elif tag == "_TYPE" and val: familii[id_curent]["type"] = val

    return indivizi, familii

def _text_ged(val) -> str:
    return " ".join(str(val).split()) if val is not None else ""

def _nume_gedcom(full_name, given_name=None, surname=None) -> tuple:
    fn = _text_ged(full_name)
    given = _text_ged(given_name)
    sn = _text_ged(surname)

    if given and sn:
        return f"{given} /{sn}/", given, sn

    if sn:
        rest = fn
        if fn.endswith(sn) and len(fn) > len(sn):
            rest = fn[: -len(sn)].strip()
        elif fn.startswith(sn) and len(fn) > len(sn):
            rest = fn[len(sn):].strip()
        elif fn == sn:
            rest = ""
        name = f"{rest} /{sn}/" if rest else f"/{sn}/"
        return name, rest, sn

    if given:
        return (fn or given), given, ""

    if not fn:
        return "Necunoscut", "", ""
    return fn, "", ""

def genereaza_gedcom(persoane: list, relatii: list) -> str:
    persoane = sorted(persoane, key=lambda p: str(p["id"]))
    relatii  = sorted(relatii,  key=lambda r: str(r["id"]))
    xref_p = {str(p["id"]): f"I{i + 1}" for i, p in enumerate(persoane)}
    xref_f = {str(r["id"]): f"F{i + 1}" for i, r in enumerate(relatii)}

    famc = {}
    fams = {}
    for r in relatii:
        fx = xref_f[str(r["id"])]
        for rol in ("male_id", "female_id"):
            pid = r.get(rol)
            if pid and str(pid) in xref_p:
                fams.setdefault(str(pid), []).append(fx)
        for c in r.get("children") or []:
            cid = str(c["id"])
            if cid in xref_p:
                kind = (c.get("kind") or ("adoptive" if c.get("adopted") else "birth")).strip().lower()
                famc.setdefault(cid, []).append((fx, kind))

    lines = [
        "0 HEAD",
        f"1 SOUR {APP_SOUR}",
        "1 GEDC",
        "2 VERS 5.5.1",
        "2 FORM LINEAGE-LINKED",
        "1 CHAR UTF-8",
    ]

    for p in persoane:
        pid = str(p["id"])
        lines.append(f"0 @{xref_p[pid]}@ INDI")
        name, given, sn = _nume_gedcom(p.get("full_name"), p.get("given_name"), p.get("surname"))
        lines.append(f"1 NAME {name}")
        gv = _text_ged(p.get("given_name")) or given
        if gv: lines.append(f"2 GIVN {gv}")
        if sn: lines.append(f"2 SURN {sn}")
        gen = (p.get("gender") or "").strip().upper()
        if gen in ("M", "F"):
            lines.append(f"1 SEX {gen}")
        if p.get("birth") is not None:
            lines.append("1 BIRT")
            lines.append(f"2 DATE {p['birth']}")
        if p.get("death") is not None:
            lines.append("1 DEAT")
            lines.append(f"2 DATE {p['death']}")
        if _text_ged(p.get("note")):
            lines.append(f"1 NOTE {_text_ged(p.get('note'))}")
        if _text_ged(p.get("tel")):
            lines.append(f"1 PHON {_text_ged(p.get('tel'))}")
        email = p.get("email_addr") or p.get("email")
        if _text_ged(email):
            lines.append(f"1 EMAIL {_text_ged(email)}")
        if _text_ged(p.get("address")):
            lines.append(f"1 ADDR {_text_ged(p.get('address'))}")
        if _text_ged(p.get("photo")):
            lines.append("1 OBJE")
            lines.append(f"2 FILE {_text_ged(p.get('photo'))}")
        for fx, kind in famc.get(pid, []):
            lines.append(f"1 FAMC @{fx}@")
            if kind == "adoptive":
                lines.append("2 PEDI adopted")
            elif kind == "step":
                lines.append("2 PEDI foster")
        for fx in fams.get(pid, []):
            lines.append(f"1 FAMS @{fx}@")

    for r in relatii:
        lines.append(f"0 @{xref_f[str(r['id'])]}@ FAM")
        mid, fid = r.get("male_id"), r.get("female_id")
        if mid and str(mid) in xref_p:
            lines.append(f"1 HUSB @{xref_p[str(mid)]}@")
        if fid and str(fid) in xref_p:
            lines.append(f"1 WIFE @{xref_p[str(fid)]}@")
        for c in r.get("children") or []:
            cid = str(c["id"])
            if cid in xref_p:
                lines.append(f"1 CHIL @{xref_p[cid]}@")
        tip = (r.get("type") or "married").strip().lower()
        if tip == "married":
            lines.append("1 MARR Y")
        elif tip == "divorced":
            lines.append("1 DIV Y")
        else:
            lines.append(f"1 _TYPE {tip}")

    lines.append("0 TRLR")
    return "\n".join(lines) + "\n"
