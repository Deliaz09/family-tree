import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API_BASE } from '../utils/apiBase';

export function useTree() {
  const [noduri,      setNoduri]     = useState([]);
  const [muchii,      setMuchii]     = useState([]);
  const [statistici,  setStatistici] = useState(null);
  const [seIncarca,   setSeIncarca]  = useState(true);
  const [eroare,      setEroare]     = useState(null);

  const incarcaArborele = useCallback(async (incercari = 3) => {
    setSeIncarca(true);
    setEroare(null);
    for (let i = 0; i < incercari; i++) {
      try {
        const [raspunsArbore, raspunsStatistici] = await Promise.all([
          axios.get(`${API_BASE}/api/tree`),
          axios.get(`${API_BASE}/api/stats`),
        ]);
        setNoduri(raspunsArbore.data.nodes || []);
        setMuchii(raspunsArbore.data.edges || []);
        setStatistici(raspunsStatistici.data);
        setSeIncarca(false);
        return;
      } catch (err) {
        if (err.response?.status === 401 || i === incercari - 1) {
          console.error('Eroare la încărcarea arborelui:', err);
          setEroare(err.response?.data?.detail || err.message || 'Eroare necunoscută');
        } else {
          await new Promise(r => setTimeout(r, 1500 * (i + 1)));
        }
      }
    }
    setSeIncarca(false);
  }, []);

  useEffect(() => {
    incarcaArborele();
  }, [incarcaArborele]);

  return {
    nodes:   noduri,
    edges:   muchii,
    stats:   statistici,
    loading: seIncarca,
    error:   eroare,
    refetch: incarcaArborele,
  };
}

export function usePerson(idPersoana) {
  const [date,      setDate]      = useState(null);
  const [seIncarca, setSeIncarca] = useState(false);
  const [eroare,    setEroare]    = useState(null);

  useEffect(() => {
    if (!idPersoana) {
      setDate(null);
      return;
    }

    let anulat = false;
    setSeIncarca(true);
    setEroare(null);

    axios
      .get(`${API_BASE}/api/persons/${idPersoana}`)
      .then(raspuns => {
        if (!anulat) setDate(raspuns.data);
      })
      .catch(err => {
        if (!anulat) setEroare(err.response?.data?.detail || err.message);
      })
      .finally(() => {
        if (!anulat) setSeIncarca(false);
      });

    return () => { anulat = true; };
  }, [idPersoana]);

  return { data: date, loading: seIncarca, error: eroare };
}
