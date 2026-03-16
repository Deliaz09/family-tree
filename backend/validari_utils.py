import unicodedata

VARSTA_MINIMA_PARINTE = 13
VARSTA_MAXIMA_MAMA    = 60

def eroare_deces_inainte_nastere(birth, death):
    if birth is not None and death is not None and death < birth:
        return f"Anul decesului ({death}) este înaintea anului nașterii ({birth})."
    return None

def avertismente_varste_parinte(parinte, copil_birth):
    out = []
    pb = parinte.get("birth")
    if pb is None or copil_birth is None:
        return out
    diferenta = copil_birth - pb
    nume = parinte.get("full_name") or "Părintele"
    if diferenta < VARSTA_MINIMA_PARINTE:
        out.append(
            f"{nume} ar avea {diferenta} ani la nașterea copilului "
            f"(sub {VARSTA_MINIMA_PARINTE} ani)."
        )
    elif (parinte.get("gender") or "").upper() == "F" and diferenta > VARSTA_MAXIMA_MAMA:
        out.append(
            f"{nume} ar avea {diferenta} ani la naștere "
            f"(peste ~{VARSTA_MAXIMA_MAMA} de ani pentru o mamă)."
        )
    return out

def este_descendent(copii_map: dict, stramos, tinta) -> bool:
    stramos, tinta = str(stramos), str(tinta)
    vazut = set()
    coada = [stramos]
    while coada:
        cur = coada.pop()
        for c in copii_map.get(cur, []):
            c = str(c)
            if c == tinta:
                return True
            if c not in vazut:
                vazut.add(c)
                coada.append(c)
    return False

def linie_directa(copii_map: dict, a, b):
    if este_descendent(copii_map, a, b):
        return "ascendent"
    if este_descendent(copii_map, b, a):
        return "descendent"
    return None

def gaseste_cicluri(copii_map: dict):
    ALB, GRI, NEGRU = 0, 1, 2
    culoare = {}
    cicluri = []
    in_ciclu_raportat = set()

    noduri = set(copii_map.keys())
    for kids in copii_map.values():
        noduri.update(str(k) for k in kids)

    def dfs(start):
        stiva = [(str(start), iter(copii_map.get(str(start), [])))]
        culoare[str(start)] = GRI
        drum = [str(start)]
        while stiva:
            nod, it = stiva[-1]
            avans = False
            for vecin in it:
                vecin = str(vecin)
                if culoare.get(vecin, ALB) == ALB:
                    culoare[vecin] = GRI
                    stiva.append((vecin, iter(copii_map.get(vecin, []))))
                    drum.append(vecin)
                    avans = True
                    break
                if culoare.get(vecin) == GRI:

                    idx = drum.index(vecin)
                    ciclu = drum[idx:]
                    cheie = frozenset(ciclu)
                    if cheie not in in_ciclu_raportat:
                        in_ciclu_raportat.add(cheie)
                        cicluri.append(ciclu)
            if not avans:
                culoare[nod] = NEGRU
                stiva.pop()
                drum.pop()
    for n in list(noduri):
        if culoare.get(n, ALB) == ALB:
            dfs(n)
    return cicluri

def normalizeaza_nume(nume: str) -> str:
    if not nume:
        return ""
    nfd = unicodedata.normalize("NFD", str(nume))
    fara_diacritice = "".join(c for c in nfd if not unicodedata.combining(c))
    return " ".join(fara_diacritice.lower().split())

def perechi_duplicate(persoane: list):
    pe_nume = {}
    for p in persoane:
        cheie = normalizeaza_nume(p.get("full_name"))
        if not cheie:
            continue
        pe_nume.setdefault(cheie, []).append(p)

    perechi = []
    for grup in pe_nume.values():
        if len(grup) < 2:
            continue
        grup = sorted(grup, key=lambda p: str(p.get("id")))
        for i in range(len(grup)):
            for j in range(i + 1, len(grup)):
                a, b = grup[i], grup[j]
                ba, bb = a.get("birth"), b.get("birth")
                if ba is None or bb is None or ba == bb:
                    perechi.append((a, b))
    return perechi
