import { useState, useRef, useEffect } from 'react';

export default function SearchBar({ persons, onSelect, onSearch }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    if (val.trim().length > 0 && persons) {
      const filtered = persons.filter(p =>
        (p.full_name || '').toLowerCase().includes(val.toLowerCase())
      );
      setResults(filtered.slice(0, 8));
      setOpen(true);
    } else {
      setResults([]);
      setOpen(false);
    }
    if (onSearch) onSearch(val);
  };

  const handleSelect = (person) => {
    setQuery(person.full_name || '');
    setOpen(false);
    if (onSelect) onSelect(person);
  };

  const genderIcon = (g) => {
    if (g === 'M') return '♂';
    if (g === 'F') return '♀';
    return '•';
  };

  return (
    <div className="search-bar" ref={wrapperRef}>
      <div className="search-input-wrapper">
        <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          type="text"
          placeholder="Caută o persoană..."
          value={query}
          onChange={handleChange}
          onFocus={() => query.trim() && results.length > 0 && setOpen(true)}
        />
        {query && (
          <button className="search-clear" onClick={() => { setQuery(''); setResults([]); setOpen(false); if (onSearch) onSearch(''); }}>
            ✕
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <ul className="search-results">
          {results.map(p => (
            <li key={p.id} onClick={() => handleSelect(p)}>
              <span className={`gender-badge gender-${(p.gender || '').toLowerCase()}`}>
                {genderIcon(p.gender)}
              </span>
              <div>
                <span className="result-name">{p.full_name}</span>
                {p.birth && <span className="result-meta">{p.birth}{p.death ? ` – ${p.death}` : ''}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
