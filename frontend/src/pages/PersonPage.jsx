import { usePerson } from '../hooks/useTree';
import PersonCard from '../components/PersonCard';
import { API_BASE } from '../utils/apiBase';

export default function PersonPage({ personId, onBack, onNavigate }) {
  const { data, loading, error } = usePerson(personId);

  if (loading) {
    return (
      <div className="page-loading">
        <div className="loader"></div>
        <p>Se încarcă datele...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="page-error">
        <h2>Persoana nu a fost găsită</h2>
        <button className="btn-back" onClick={onBack}>← Înapoi la arbore</button>
      </div>
    );
  }

  const { person, spouses, children, parents } = data;
  const allChildren = [
    ...(children.biological || []).map(c => ({ ...c, relType: 'biologic' })),
    ...(children.step || []).map(c => ({ ...c, relType: 'vitreg' })),
    ...(children.adopted || []).map(c => ({ ...c, relType: 'adoptat' })),
  ];
  const allParents = [
    ...(parents.biological || []).map(p => ({ ...p, relType: 'biologic' })),
    ...(parents.step || []).map(p => ({ ...p, relType: 'vitreg' })),
    ...(parents.adopted || []).map(p => ({ ...p, relType: 'adoptiv' })),
  ];

  const photoSrc = person.photo_url
    ? (person.photo_url.startsWith('http') || person.photo_url.startsWith('data:')
        ? person.photo_url
        : `${API_BASE}${person.photo_url}`)
    : person.photo
      ? `${API_BASE}/photos/${person.photo}`
      : null;

  return (
    <div className="person-page">
      <button className="btn-back" onClick={onBack}>← Înapoi la arbore</button>

      <div className="person-page-header">
        <div className="person-page-photo">
          {photoSrc ? (
            <img src={photoSrc} alt={person.full_name} />
          ) : (
            <div className={`page-avatar gender-bg-${(person.gender || 'u').toLowerCase()}`}>
              {(person.full_name || 'NN').split(' ').map(w => w[0]).join('').slice(0, 2)}
            </div>
          )}
        </div>
        <div className="person-page-info">
          <h1>{person.full_name}</h1>
          {person.surname && <p className="birth-surname">Născut/ă: {person.surname}</p>}
          <p className="life-years">
            {person.birth && `Născut/ă: ${person.birth}`}
            {person.death && ` · Decedat/ă: ${person.death}`}
          </p>
          {person.address && <p className="location">📍 {person.address}</p>}
          {person.tel && <p className="contact">📞 {person.tel}</p>}
          {person.email && <p className="contact">✉️ {person.email}</p>}
          {person.note && <p className="note">📝 {person.note}</p>}
        </div>
      </div>

      <div className="person-page-relations">
        {allParents.length > 0 && (
          <section>
            <h3>Părinți</h3>
            <div className="relation-cards">
              {allParents.map(p => (
                <div key={p.id} className="relation-item">
                  <PersonCard person={p} compact onClick={() => onNavigate(p.id)} />
                  {p.relType !== 'biologic' && (
                    <span className="rel-badge">{p.relType}</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {spouses.length > 0 && (
          <section>
            <h3>Partener/ă</h3>
            <div className="relation-cards">
              {spouses.map(s => (
                <PersonCard key={s.id} person={s} compact onClick={() => onNavigate(s.id)} />
              ))}
            </div>
          </section>
        )}

        {allChildren.length > 0 && (
          <section>
            <h3>Copii</h3>
            <div className="relation-cards">
              {allChildren.map(c => (
                <div key={c.id} className="relation-item">
                  <PersonCard person={c} compact onClick={() => onNavigate(c.id)} />
                  {c.relType !== 'biologic' && (
                    <span className="rel-badge">{c.relType}</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
