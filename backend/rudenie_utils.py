PARINTE = ("MAN", "WOMAN")

def decodeaza_drum(noduri: list, muchii: list):
    pasi = []
    i = 0
    while i + 2 < len(noduri):
        if (noduri[i].get("este_relatie")
                or not noduri[i + 1].get("este_relatie")
                or noduri[i + 2].get("este_relatie")):
            return None
        in_e  = muchii[i]     if i     < len(muchii) else {}
        out_e = muchii[i + 1] if i + 1 < len(muchii) else {}
        in_t, out_t = in_e.get("type"), out_e.get("type")

        if in_t == "CHILD" and out_t in PARINTE:
            kind, adopted = "up", bool(in_e.get("adopted"))
        elif in_t in PARINTE and out_t == "CHILD":
            kind, adopted = "down", bool(out_e.get("adopted"))
        elif in_t == "CHILD" and out_t == "CHILD":
            kind = "sibling"
            adopted = bool(in_e.get("adopted")) or bool(out_e.get("adopted"))
        elif in_t in PARINTE and out_t in PARINTE:
            kind, adopted = "partner", False
        else:
            return None
        pasi.append({"kind": kind, "person": noduri[i + 2], "adopted": adopted})
        i += 2
    return pasi

def numara_alianta(pasi: list) -> int:
    return sum(1 for p in pasi if p["kind"] == "partner")

def _gen3(gender, m, f, neutru):
    g = (gender or "").upper()
    return m if g == "M" else f if g == "F" else neutru

def _stra(n: int) -> str:
    if n <= 0:
        return ""
    return "stră-" * (n - 1) + "stră"

def eticheta_rudenie(pasi: list, gen_tinta: str) -> str:
    g = gen_tinta
    if not pasi:
        return "aceeași persoană"

    ups   = sum(1 for p in pasi if p["kind"] == "up")
    downs = sum(1 for p in pasi if p["kind"] == "down")
    sibs  = sum(1 for p in pasi if p["kind"] == "sibling")
    part  = numara_alianta(pasi)
    adoptiv = any(p["adopted"] for p in pasi)

    a = ups + sibs
    b = downs + sibs

    label = None

    if part == 0 and sibs <= 1:
        if sibs == 1 and ups == 0 and downs == 0:
            label = _gen3(g, "fratele bun", "sora bună", "frate/soră bun(ă)")
        elif sibs == 0 and ups == 1 and downs == 1:
            label = _gen3(g, "fratele vitreg", "sora vitregă", "frate/soră vitreg(ă)")
        elif b == 0 and a >= 1:
            if a == 1:   label = _gen3(g, "tatăl", "mama", "părintele")
            elif a == 2: label = _gen3(g, "bunicul", "bunica", "bunicul/bunica")
            else:        label = _stra(a - 2) + _gen3(g, "bunicul", "bunica", "bunicul/bunica")
        elif a == 0 and b >= 1:
            if b == 1:   label = _gen3(g, "fiul", "fiica", "copilul")
            elif b == 2: label = _gen3(g, "nepotul de bunic", "nepoata de bunic", "nepotul/nepoata de bunic")
            else:        label = _stra(b - 2) + _gen3(g, "nepotul", "nepoata", "nepotul/nepoata")
        elif a == 2 and b == 1:
            label = _gen3(g, "unchiul", "mătușa", "unchiul/mătușa")
        elif a == 1 and b == 2:
            label = _gen3(g, "nepotul de frate", "nepoata de frate", "nepotul/nepoata de frate")
        elif a == 3 and b == 1:
            label = _gen3(g, "unchiul mare", "mătușa mare", "unchiul/mătușa mare")
        elif a == 1 and b == 3:
            label = _gen3(g, "strănepotul de frate", "strănepoata de frate", "strănepot de frate")
        elif a >= 2 and b >= 2:
            grad = min(a, b) - 1
            dist = abs(a - b)
            if grad == 1:   label = _gen3(g, "vărul primar", "vara primară", "văr primar")
            elif grad == 2: label = _gen3(g, "vărul de-al doilea", "vara de-a doua", "văr de-al doilea")
            else:           label = _gen3(g, f"vărul de gradul {grad}", f"vara de gradul {grad}", f"văr de gradul {grad}")
            if dist == 1:   label += " (la o generație distanță)"
            elif dist > 1:  label += f" (la {dist} generații distanță)"

    elif part == 1:
        primul  = pasi[0]["kind"] == "partner"
        ultimul = pasi[-1]["kind"] == "partner"
        if len(pasi) == 1:
            label = _gen3(g, "soțul", "soția", "partenerul/partenera")
        elif a == 1 and b == 0 and primul:
            label = _gen3(g, "socrul", "soacra", "socrul/soacra")
        elif a == 0 and b == 1 and ultimul:
            label = _gen3(g, "ginerele", "nora", "ginerele/nora")
        elif a == 1 and b == 1 and (primul or ultimul):
            label = _gen3(g, "cumnatul", "cumnata", "cumnatul/cumnata")
        elif a == 2 and b == 1 and ultimul:
            label = _gen3(g, "unchiul prin alianță", "mătușa prin alianță", "unchiul/mătușa prin alianță")
        elif a == 1 and b == 2 and primul:
            label = _gen3(g, "nepotul de frate prin alianță", "nepoata de frate prin alianță",
                          "nepot de frate prin alianță")
        elif a >= 2 and b >= 2 and (primul or ultimul):
            grad = min(a, b) - 1
            if grad == 1:
                label = _gen3(g, "vărul prin alianță", "vara prin alianță", "văr prin alianță")

    elif part == 2 and a <= 1 and b <= 1 and a == b:
        if a == 0:
            label = None
        else:
            label = _gen3(g, "cuscrul", "cuscra", "cuscrul/cuscra")

    if label is None:

        grad = a + b + part
        detalii = f"{a} generații în sus, {b} în jos"
        if part:
            detalii += ", prin alianță"
        label = f"rudă de gradul {grad} ({detalii})"

    if adoptiv:
        label += " (linie adoptivă)"
    return label

def pas_in_cuvinte(pas: dict) -> str:
    g = pas["person"].get("gender")
    kind = pas["kind"]
    if kind == "up":
        txt = _gen3(g, "tatăl", "mama", "părintele")
        if pas["adopted"]:
            txt += _gen3(g, " adoptiv", " adoptivă", " adoptiv(ă)")
    elif kind == "down":
        txt = _gen3(g, "fiul", "fiica", "copilul")
        if pas["adopted"]:
            txt += _gen3(g, " adoptiv", " adoptivă", " adoptiv(ă)")
    elif kind == "sibling":
        txt = _gen3(g, "fratele", "sora", "fratele/sora")
    else:
        txt = _gen3(g, "soțul", "soția", "partenerul/partenera")
    return txt

def construieste_raspuns(noduri: list, muchii: list, pasi: list) -> dict:
    persoane = [n for n in noduri if not n.get("este_relatie")]
    tinta = persoane[-1] if persoane else {}
    label = eticheta_rudenie(pasi, tinta.get("gender"))

    chain = []
    if persoane:
        chain.append({
            "person_id": persoane[0].get("id"),
            "full_name": persoane[0].get("full_name"),
            "step_ro": "",
        })
    for pas in pasi:
        chain.append({
            "person_id": pas["person"].get("id"),
            "full_name": pas["person"].get("full_name"),
            "step_ro": pas_in_cuvinte(pas),
        })

    return {
        "label": label,
        "chain": chain,
        "path_ids": [p.get("id") for p in persoane],
    }
