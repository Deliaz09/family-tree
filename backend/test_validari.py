import sys

from validari_utils import (
    eroare_deces_inainte_nastere, avertismente_varste_parinte,
    este_descendent, linie_directa, gaseste_cicluri,
    normalizeaza_nume, perechi_duplicate,
)

esecuri = []

def check(nume, cond, detaliu=""):
    print(f"{'PASS' if cond else 'FAIL'}  {nume}" + (f"  ({detaliu})" if detaliu else ""))
    if not cond:
        esecuri.append(nume)

check("deces înainte de naștere → eroare", eroare_deces_inainte_nastere(1980, 1970) is not None)
check("deces după naștere → ok", eroare_deces_inainte_nastere(1950, 2020) is None)
check("ani lipsă → ok", eroare_deces_inainte_nastere(None, 1990) is None)

check("părinte de 10 ani → avertisment",
      len(avertismente_varste_parinte({"full_name": "Ion", "birth": 1990, "gender": "M"}, 2000)) == 1)
check("mamă de 65 de ani → avertisment",
      len(avertismente_varste_parinte({"full_name": "Ana", "birth": 1900, "gender": "F"}, 1965)) == 1)
check("tată de 65 de ani → fără avertisment (limita e doar pentru mame)",
      avertismente_varste_parinte({"full_name": "Ion", "birth": 1900, "gender": "M"}, 1965) == [])
check("părinte de 30 de ani → ok",
      avertismente_varste_parinte({"full_name": "Ion", "birth": 1970, "gender": "M"}, 2000) == [])
check("an lipsă → ok", avertismente_varste_parinte({"full_name": "Ion"}, 2000) == [])

copii = {"b": ["c", "f"], "c": ["d"], "f": ["v"]}
check("descendent direct detectat", este_descendent(copii, "b", "d"))
check("nu e descendent invers", not este_descendent(copii, "d", "b"))
check("linie directă ascendent", linie_directa(copii, "b", "d") == "ascendent")
check("linie directă descendent", linie_directa(copii, "d", "b") == "descendent")
check("VERII nu sunt linie directă (căsătoria între veri e sprijinită)",
      linie_directa(copii, "d", "v") is None)
check("frații nu sunt linie directă", linie_directa(copii, "c", "f") is None)

check("graf aciclic → fără cicluri", gaseste_cicluri(copii) == [])
ciclic = {"a": ["b"], "b": ["c"], "c": ["a"], "x": ["y"]}
cicluri = gaseste_cicluri(ciclic)
check("ciclu a→b→c→a detectat", len(cicluri) == 1 and set(cicluri[0]) == {"a", "b", "c"},
      str(cicluri))

check("normalizare nume (diacritice/spații/majuscule)",
      normalizeaza_nume("  Ștefan   ȚĂRANU ") == "stefan taranu")
persoane = [
    {"id": "1", "full_name": "Ion Popescu", "birth": 1950},
    {"id": "2", "full_name": "ion popescu", "birth": 1950},
    {"id": "3", "full_name": "Ion Popescu", "birth": None},
    {"id": "4", "full_name": "Ion Popescu", "birth": 1980},
    {"id": "5", "full_name": "Maria Enescu", "birth": 1960},
]
per = perechi_duplicate(persoane)
chei = {tuple(sorted((a["id"], b["id"]))) for a, b in per}
check("duplicat pe an identic", ("1", "2") in chei)
check("duplicat pe an lipsă", ("1", "3") in chei and ("2", "3") in chei)
check("an diferit nu e duplicat", ("1", "4") not in chei and ("2", "4") not in chei)
check("nume diferit nu e duplicat", not any("5" in k for k in chei))
check("anul lipsă se împerechează și cu 1980", ("3", "4") in chei)

print()
if esecuri:
    print(f"{len(esecuri)} verificări eșuate: {esecuri}")
    sys.exit(1)
print("Toate verificările de validare au trecut")
