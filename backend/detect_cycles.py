import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
from neo4j import GraphDatabase

URI = os.getenv("NEO4J_URI"); USER = os.getenv("NEO4J_USER"); PW = os.getenv("NEO4J_PASSWORD")
driver = GraphDatabase.driver(URI, auth=(USER, PW))

with driver.session() as s:
    rows = s.run(
        """
        MATCH (rel:Relation)-[:MAN|WOMAN]->(parent:Person)
        MATCH (rel)-[:CHILD]->(child:Person)
        RETURN coalesce(parent.user_id,'?') AS uid,
               parent.id AS p, child.id AS c
        """
    ).data()

from collections import defaultdict
trees = defaultdict(lambda: defaultdict(set))
counts = defaultdict(int)
for r in rows:
    trees[r['uid']][r['p']].add(r['c'])
    counts[r['uid']] += 1

print(f"Arbori (user_id) gasiti: {len(trees)}")
for uid, ch in trees.items():
    print(f"  uid={uid}  muchii_parinte_copil={counts[uid]}  parinti={len(ch)}")

def find_cycle(adj):
    WHITE, GRAY, BLACK = 0, 1, 2
    color = {}
    stack_path = []
    def dfs(u):
        color[u] = GRAY
        stack_path.append(u)
        for v in adj.get(u, ()):
            if color.get(v, WHITE) == GRAY:
                i = stack_path.index(v)
                return stack_path[i:] + [v]
            if color.get(v, WHITE) == WHITE:
                r = dfs(v)
                if r: return r
        stack_path.pop()
        color[u] = BLACK
        return None
    nodes = set(adj.keys())
    for vs in adj.values():
        nodes |= vs
    sys.setrecursionlimit(100000)
    for n in nodes:
        if color.get(n, WHITE) == WHITE:
            r = dfs(n)
            if r: return r
    return None

print("\n=== Cautare cicluri (cineva e propriul stramos) ===")
gasit = False
for uid, adj in trees.items():
    cyc = find_cycle(adj)
    if cyc:
        gasit = True
        print(f"!!! CICLU in arborele uid={uid}:")
        print("    " + " -> ".join(str(x) for x in cyc))
if not gasit:
    print("Niciun ciclu parinte->copil gasit.")

driver.close()
