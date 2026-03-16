import sys

from gedcom_utils import genereaza_gedcom, parseaza_gedcom

PERSOANE = [
    {"id": "u_p_1", "full_name": "Ion Popescu", "given_name": "Ion", "surname": "Popescu",
     "gender": "M", "birth": 1950, "death": 2020, "note": "Notă cu diacritice: ăâîșț",
     "address": "Brașov"},
    {"id": "u_p_2", "full_name": "Maria Popescu", "gender": "F", "birth": 1952},
    {"id": "u_p_3", "full_name": "Andrei Popescu", "gender": "M", "birth": 1978},
    {"id": "u_p_4", "full_name": "Ioana Popescu", "gender": "F", "birth": 1980},
    {"id": "u_p_5", "full_name": "Ștefan Țăranu", "gender": "M", "birth": 1979},
    {"id": "u_p_6", "full_name": "Mădălina", "gender": "F"},
    {"id": "u_p_7", "full_name": "Vasile Ion Georgescu", "gender": "M"},
]

RELATII = [

    {"id": "u_r_1", "type": "married", "male_id": "u_p_1", "female_id": "u_p_2",
     "children": [{"id": "u_p_3", "adopted": False}, {"id": "u_p_4", "adopted": True}]},

    {"id": "u_r_2", "type": "divorced", "male_id": "u_p_5", "female_id": "u_p_6", "children": []},

    {"id": "u_r_3", "type": "unknown", "male_id": "u_p_7", "female_id": None,
     "children": [{"id": "u_p_5", "adopted": False}]},
]

esecuri = []

def check(nume, cond, detaliu=""):
    print(f"{'PASS' if cond else 'FAIL'}  {nume}" + (f"  ({detaliu})" if detaliu else ""))
    if not cond:
        esecuri.append(nume)

text = genereaza_gedcom(PERSOANE, RELATII)
indivizi, familii = parseaza_gedcom(text.splitlines())

check("număr persoane", len(indivizi) == len(PERSOANE), f"{len(indivizi)}")
check("număr familii", len(familii) == len(RELATII), f"{len(familii)}")
check("HEAD/TRLR/CHAR UTF-8",
      text.startswith("0 HEAD") and text.rstrip().endswith("0 TRLR") and "1 CHAR UTF-8" in text)

ids_sortate = sorted(p["id"] for p in PERSOANE)
xref = {pid: f"I{i+1}" for i, pid in enumerate(ids_sortate)}

for p in PERSOANE:
    gx = xref[p["id"]]
    ind = indivizi.get(gx, {})
    check(f"full_name identic {p['id']}", ind.get("full_name") == p["full_name"],
          f"{ind.get('full_name')!r} vs {p['full_name']!r}")
    if p.get("gender"):
        check(f"gender {p['id']}", ind.get("gender") == p["gender"])
    if p.get("birth") is not None:
        check(f"birth {p['id']}", ind.get("birth") == p["birth"])
    if p.get("death") is not None:
        check(f"death {p['id']}", ind.get("death") == p["death"])

rel_sortate = sorted(r["id"] for r in RELATII)
fxref = {rid: f"F{i+1}" for i, rid in enumerate(rel_sortate)}
for r in RELATII:
    fx = fxref[r["id"]]
    fam = familii.get(fx, {})
    check(f"tip relație {r['id']}", fam.get("type", "married") == r["type"],
          f"{fam.get('type')} vs {r['type']}")
    check(f"soț {r['id']}", fam.get("sot") == (xref.get(r["male_id"]) if r["male_id"] else None))
    check(f"soție {r['id']}", fam.get("sotie") == (xref.get(r["female_id"]) if r["female_id"] else None))
    copii_orig = [xref[c["id"]] for c in r["children"]]
    check(f"copii în ordine {r['id']}", fam.get("copii") == copii_orig,
          f"{fam.get('copii')} vs {copii_orig}")
    for c in r["children"]:
        adoptat_rt = fx in (indivizi.get(xref[c["id"]], {}).get("famc_adoptate") or [])
        check(f"adopted {c['id']} în {r['id']}", adoptat_rt == bool(c.get("adopted")),
              f"round-trip={adoptat_rt}")

pers2 = [{"id": gx, **{k: v for k, v in d.items() if k != "famc_adoptate"}}
         for gx, d in indivizi.items()]
rel2 = []
for fx, fam in familii.items():
    rel2.append({
        "id": fx, "type": fam.get("type", "married"),
        "male_id": fam.get("sot"), "female_id": fam.get("sotie"),
        "children": [{"id": cid,
                      "adopted": fx in (indivizi.get(cid, {}).get("famc_adoptate") or [])}
                     for cid in fam.get("copii", [])],
    })
text2 = genereaza_gedcom(pers2, rel2)
check("determinism (export∘import∘export stabil)", text2 == text)

print()
if esecuri:
    print(f"{len(esecuri)} verificări eșuate: {esecuri}")
    sys.exit(1)
print("Toate verificările round-trip au trecut")
