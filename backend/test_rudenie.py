import sys

from rudenie_utils import (
    decodeaza_drum, eticheta_rudenie, numara_alianta, construieste_raspuns,
)

esecuri = []

def check(nume, cond, detaliu=""):
    print(f"{'PASS' if cond else 'FAIL'}  {nume}" + (f"  ({detaliu})" if detaliu else ""))
    if not cond:
        esecuri.append(nume)

def P(pid, gender="M", name=None):
    return {"id": pid, "full_name": name or pid, "gender": gender, "este_relatie": False}

def R(rid="r"):
    return {"id": rid, "full_name": None, "gender": None, "este_relatie": True}

def drum(*segmente):
    noduri = [segmente[0]]
    muchii = []
    for seg in segmente[1:]:
        in_t, out_t, pers = seg[0], seg[1], seg[2]
        ad_in  = seg[3] if len(seg) > 3 else False
        ad_out = seg[4] if len(seg) > 4 else False
        noduri.append(R())
        noduri.append(pers)
        muchii.append({"type": in_t, "adopted": ad_in})
        muchii.append({"type": out_t, "adopted": ad_out})
    return noduri, muchii

def eticheta(*segmente):
    noduri, muchii = drum(*segmente)
    pasi = decodeaza_drum(noduri, muchii)
    assert pasi is not None, "drum nedecodabil"
    return eticheta_rudenie(pasi, noduri[-1].get("gender"))

eu = P("eu", "F", "Delia")

check("tată",  eticheta(eu, ("CHILD", "MAN", P("t", "M"))) == "tatăl")
check("mamă",  eticheta(eu, ("CHILD", "WOMAN", P("m", "F"))) == "mama")
check("fiu",   eticheta(eu, ("MAN", "CHILD", P("f", "M"))) == "fiul",
      eticheta(P("eu2", "M"), ("MAN", "CHILD", P("f", "M"))))
check("bunic", eticheta(eu, ("CHILD", "MAN", P("t", "M")), ("CHILD", "MAN", P("b", "M"))) == "bunicul")
check("străbunica", eticheta(eu, ("CHILD", "MAN", P("t", "M")), ("CHILD", "MAN", P("b", "M")),
                             ("CHILD", "WOMAN", P("sb", "F"))) == "străbunica")
check("nepot de bunic", eticheta(P("b", "M"), ("MAN", "CHILD", P("t", "M")),
                                 ("MAN", "CHILD", P("n", "M"))) == "nepotul de bunic")

check("frate bun", eticheta(eu, ("CHILD", "CHILD", P("fr", "M"))) == "fratele bun")
check("soră vitregă (părinte comun, relații diferite)",
      eticheta(eu, ("CHILD", "MAN", P("t", "M")), ("MAN", "CHILD", P("s", "F"))) == "sora vitregă")

check("unchi (fratele tatălui)",
      eticheta(eu, ("CHILD", "MAN", P("t", "M")), ("CHILD", "CHILD", P("u", "M"))) == "unchiul")
check("nepoată de frate",
      eticheta(eu, ("CHILD", "CHILD", P("fr", "M")), ("MAN", "CHILD", P("n", "F"))) == "nepoata de frate")
check("văr primar",
      eticheta(eu, ("CHILD", "MAN", P("t", "M")), ("CHILD", "CHILD", P("u", "M")),
               ("MAN", "CHILD", P("v", "M"))) == "vărul primar")
check("vară de-a doua",
      eticheta(eu, ("CHILD", "MAN", P("t")), ("CHILD", "MAN", P("b")),
               ("CHILD", "CHILD", P("fb")), ("MAN", "CHILD", P("x")),
               ("MAN", "CHILD", P("v2", "F"))) == "vara de-a doua")
check("văr primar decalat (la o generație distanță)",
      "la o generație distanță" in eticheta(
          eu, ("CHILD", "MAN", P("t")), ("CHILD", "MAN", P("b")),
          ("CHILD", "CHILD", P("fb")), ("MAN", "CHILD", P("vt", "M"))))

check("soț", eticheta(eu, ("WOMAN", "MAN", P("s", "M"))) == "soțul")
check("soacră", eticheta(eu, ("WOMAN", "MAN", P("s", "M")),
                         ("CHILD", "WOMAN", P("sc", "F"))) == "soacra")
check("ginere", eticheta(eu, ("WOMAN", "CHILD", P("c", "F")),
                         ("WOMAN", "MAN", P("g", "M"))) == "ginerele")
check("cumnat (fratele soțului)",
      eticheta(eu, ("WOMAN", "MAN", P("s", "M")), ("CHILD", "CHILD", P("cm", "M"))) == "cumnatul")
check("cumnată (soția fratelui)",
      eticheta(eu, ("CHILD", "CHILD", P("fr", "M")), ("MAN", "WOMAN", P("cm", "F"))) == "cumnata")
check("mătușă prin alianță (soția unchiului)",
      eticheta(eu, ("CHILD", "MAN", P("t", "M")), ("CHILD", "CHILD", P("u", "M")),
               ("MAN", "WOMAN", P("mt", "F"))) == "mătușa prin alianță")
check("rudă prin alianță generică (fallback cu mențiune)",
      "prin alianță" in eticheta(eu, ("WOMAN", "MAN", P("s", "M")),
                                 ("CHILD", "MAN", P("sc", "M")),
                                 ("CHILD", "MAN", P("x", "M"))))

check("linie adoptivă menționată",
      eticheta(eu, ("CHILD", "MAN", P("t", "M"), True)) == "tatăl (linie adoptivă)")

et = eticheta(eu, ("CHILD", "MAN", P("a")), ("CHILD", "MAN", P("b")),
              ("CHILD", "MAN", P("c")), ("CHILD", "CHILD", P("f4", "M")))
check("fallback rudă de gradul N", et == "rudă de gradul 5 (4 generații în sus, 1 în jos)", et)

drum_sange, m_sange = drum(eu, ("CHILD", "MAN", P("t")), ("CHILD", "CHILD", P("u", "M")))
drum_alianta, m_al = drum(eu, ("WOMAN", "MAN", P("s")), ("CHILD", "CHILD", P("u", "M")))
pasi_s = decodeaza_drum(drum_sange, m_sange)
pasi_a = decodeaza_drum(drum_alianta, m_al)
check("drum de sânge preferat", numara_alianta(pasi_s) < numara_alianta(pasi_a))

noduri, muchii = drum(eu, ("CHILD", "MAN", P("t", "M", "Ion")), ("CHILD", "CHILD", P("u", "M", "Vasile")))
rasp = construieste_raspuns(noduri, muchii, decodeaza_drum(noduri, muchii))
check("chain: pornire fără pas", rasp["chain"][0]["step_ro"] == "" and rasp["chain"][0]["full_name"] == "Delia")
check("chain: pașii verbali", [c["step_ro"] for c in rasp["chain"][1:]] == ["tatăl", "fratele"])
check("path_ids doar persoane", rasp["path_ids"] == ["eu", "t", "u"])
check("eticheta din răspuns", rasp["label"] == "unchiul")

print()
if esecuri:
    print(f"{len(esecuri)} verificări eșuate: {esecuri}")
    sys.exit(1)
print("Toate verificările de rudenie au trecut")
