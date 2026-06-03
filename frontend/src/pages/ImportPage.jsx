import { useState, useRef } from 'react';
import axios from 'axios';
import { supabase } from '../supabaseClient';
import { slugFilename } from '../utils/slugFilename';
import { API_BASE } from '../utils/apiBase';
const PHOTOS_BUCKET = import.meta.env.VITE_SUPABASE_PHOTOS_BUCKET || 'photos';

function MesajSucces({ result, type }) {
  if (!result) return null;

  if (type === 'excel') {
    const { persons_created, persons_updated, relations_created,
            relations_updated, children_linked, total_persons } = result;
    return (
      <div className="import-success">
        <p className="import-success-title">✅ Import Excel reușit!</p>
        <div className="import-stats">
          <div className="import-stat">
            <span className="import-stat-num">{persons_created ?? 0}</span>
            <span className="import-stat-label">persoane noi</span>
          </div>
          {persons_updated > 0 && (
            <div className="import-stat">
              <span className="import-stat-num">{persons_updated}</span>
              <span className="import-stat-label">actualizate</span>
            </div>
          )}
          <div className="import-stat">
            <span className="import-stat-num">{relations_created ?? 0}</span>
            <span className="import-stat-label">relații noi</span>
          </div>
          {relations_updated > 0 && (
            <div className="import-stat">
              <span className="import-stat-num">{relations_updated}</span>
              <span className="import-stat-label">relații actualizate</span>
            </div>
          )}
          <div className="import-stat">
            <span className="import-stat-num">{children_linked ?? 0}</span>
            <span className="import-stat-label">copii legați</span>
          </div>
        </div>
        {total_persons > 0 && (
          <p className="import-success-sub">
            Total procesat: {total_persons} persoane din fișier.
          </p>
        )}
      </div>
    );
  }

  const { persons_created, persons_updated, relations_created,
          relations_updated, children_linked } = result;
  return (
    <div className="import-success">
      <p className="import-success-title">✅ Import GEDCOM reușit!</p>
      <div className="import-stats">
        <div className="import-stat">
          <span className="import-stat-num">{persons_created ?? 0}</span>
          <span className="import-stat-label">persoane noi</span>
        </div>
        {persons_updated > 0 && (
          <div className="import-stat">
            <span className="import-stat-num">{persons_updated}</span>
            <span className="import-stat-label">actualizate</span>
          </div>
        )}
        <div className="import-stat">
          <span className="import-stat-num">{relations_created ?? 0}</span>
          <span className="import-stat-label">familii (FAM)</span>
        </div>
        <div className="import-stat">
          <span className="import-stat-num">{children_linked ?? 0}</span>
          <span className="import-stat-label">copii legați</span>
        </div>
      </div>
    </div>
  );
}

export default function ImportPage({ onBack, onImported }) {

  const [importing, setImporting]   = useState(false);
  const [importType, setImportType] = useState(null);
  const [result, setResult]         = useState(null);
  const [error, setError]           = useState(null);
  const [importProgress, setImportProgress] = useState(null);
  const excelRef  = useRef(null);
  const gedcomRef = useRef(null);

  const photosRef          = useRef(null);
  const [photoFiles,       setPhotoFiles]       = useState([]);
  const [photoUploading,   setPhotoUploading]   = useState(false);
  const [photoProgress,    setPhotoProgress]    = useState({ done: 0, total: 0 });
  const [photoResult,      setPhotoResult]      = useState(null);
  const [photoError,       setPhotoError]       = useState(null);

  const asteapta = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  async function urmaresteImport(jobId) {
    while (true) {
      const res = await axios.get(`${API_BASE}/api/import/jobs/${jobId}`);
      const job = res.data;
      setImportProgress(job);

      if (job.status === 'done') return job.result;
      if (job.status === 'failed') {
        throw new Error(job.error || 'Importul a eșuat');
      }

      await asteapta(900);
    }
  }

  async function handleImport(file, type) {
    setImporting(true);
    setImportType(type);
    setError(null);
    setResult(null);
    setImportProgress(null);

    try {
      const fd = new FormData();
      fd.append('file', file);
      const endpoint = type === 'excel' ? '/api/import/excel/job' : '/api/import/gedcom/job';
      const res = await axios.post(`${API_BASE}${endpoint}`, fd);
      const importResult = res.data?.job_id ? await urmaresteImport(res.data.job_id) : res.data;
      setResult(importResult);
      if (onImported) onImported();
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Eroare la import');
    } finally {
      setImporting(false);
    }
  }

  const handleExcelChange  = (e) => { const f = e.target.files[0]; if (f) handleImport(f, 'excel');  };
  const handleGedcomChange = (e) => { const f = e.target.files[0]; if (f) handleImport(f, 'gedcom'); };

  async function handleDownloadTemplate() {
    try {
      const res = await axios.get(`${API_BASE}/api/export/template`, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'sablon_arbore_genealogic.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError('Nu s-a putut descărca șablonul: ' + (err.message || 'eroare necunoscută'));
    }
  }

  function handlePhotosSelected(e) {
    const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
    setPhotoFiles(files);
    setPhotoResult(null);
    setPhotoError(null);
  }

  async function handleUploadPhotos() {
    if (!photoFiles.length) return;

    setPhotoUploading(true);
    setPhotoError(null);
    setPhotoResult(null);
    setPhotoProgress({ done: 0, total: photoFiles.length });

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Trebuie să fii autentificat');

      const errors = [];
      let done = 0;

      for (const file of photoFiles) {
        const path = `${user.id}/${slugFilename(file.name)}`;
        const { error: uploadErr } = await supabase.storage
          .from(PHOTOS_BUCKET)
          .upload(path, file, { cacheControl: '3600', upsert: true });

        if (uploadErr) errors.push(`${file.name}: ${uploadErr.message}`);
        done++;
        setPhotoProgress({ done, total: photoFiles.length });
      }

      setPhotoResult({
        uploaded: photoFiles.length - errors.length,
        total: photoFiles.length,
        errors,
      });
    } catch (err) {
      setPhotoError(err.message || 'Eroare la upload fotografii');
    } finally {
      setPhotoUploading(false);
    }
  }

  return (
    <div className="import-page">
      <div className="import-card">
        <button className="import-back" onClick={onBack}>← Înapoi la arbore</button>

        <h1>📥 Import date</h1>
        <p className="import-desc">
          Importă datele familiei dintr-un fișier Excel sau GEDCOM.
          Datele existente vor fi actualizate, cele noi vor fi adăugate —
          nicio înregistrare nu se șterge la reimport.
        </p>

        <div className="import-step">
          <div className="import-step-header">
            <span className="import-step-num">1</span>
            <h3>Descarcă șablonul Excel</h3>
          </div>
          <p className="import-step-desc">
            Completează șablonul cu datele familiei. Coloana <strong>Photo</strong> acceptă
            numele fișierului fotografiei (ex: <code>ion_popescu.jpg</code>).
          </p>
          <button className="import-template-btn" onClick={handleDownloadTemplate}>
            ⬇ Descarcă șablon Excel
          </button>
        </div>

        <div className="import-step">
          <div className="import-step-header">
            <span className="import-step-num">2</span>
            <h3>Încarcă fotografiile (opțional)</h3>
          </div>
          <p className="import-step-desc">
            Selectează toate fotografiile dintr-un folder. Denumirile trebuie să
            corespundă exact cu valorile din coloana <strong>Photo</strong> din Excel.
          </p>

          <div className="import-photos-zone">
            <label className="import-photos-label" htmlFor="photos-input">
              📂 Selectează fotografii
            </label>
            <input
              id="photos-input"
              type="file"
              accept="image/*"
              multiple
              ref={photosRef}
              onChange={handlePhotosSelected}
              hidden
            />

            {photoFiles.length > 0 && !photoUploading && !photoResult && (
              <div className="import-photos-selected">
                <span>{photoFiles.length} fișier{photoFiles.length !== 1 ? 'e' : ''} selectat{photoFiles.length !== 1 ? 'e' : ''}</span>
                <div className="import-photos-names">
                  {photoFiles.slice(0, 5).map(f => (
                    <span key={f.name} className="import-photo-chip">{f.name}</span>
                  ))}
                  {photoFiles.length > 5 && (
                    <span className="import-photo-chip import-photo-chip-more">
                      +{photoFiles.length - 5} altele
                    </span>
                  )}
                </div>
                <button className="import-btn-upload-photos" onClick={handleUploadPhotos}>
                  ⬆ Încarcă în Supabase Storage
                </button>
              </div>
            )}

            {photoUploading && (
              <div className="import-photos-progress">
                <div className="loader"></div>
                <span>
                  Se încarcă {photoProgress.done} / {photoProgress.total} fotografii...
                </span>
                <div className="import-progress-bar">
                  <div
                    className="import-progress-fill"
                    style={{ width: `${(photoProgress.done / photoProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {photoResult && (
              <div className={photoResult.errors.length ? 'import-photos-partial' : 'import-photos-done'}>
                <p>
                  ✅ {photoResult.uploaded} din {photoResult.total} fotografii încărcate cu succes.
                </p>
                {photoResult.errors.length > 0 && (
                  <details className="import-photos-errors">
                    <summary>⚠ {photoResult.errors.length} erori</summary>
                    <ul>
                      {photoResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </details>
                )}
                <button
                  className="import-photos-again"
                  onClick={() => { setPhotoFiles([]); setPhotoResult(null); if (photosRef.current) photosRef.current.value = ''; }}
                >
                  Selectează alt folder
                </button>
              </div>
            )}

            {photoError && <div className="import-error">⚠ {photoError}</div>}
          </div>
        </div>

        <div className="import-step">
          <div className="import-step-header">
            <span className="import-step-num">3</span>
            <h3>Importă datele</h3>
          </div>

          {error && <div className="import-error">⚠ {error}</div>}
          <MesajSucces result={result} type={importType} />

          {importing && (
            <div className="import-loading">
              <div className="loader"></div>
              {importProgress && (
                <div className="import-photos-progress">
                  <span>{importProgress.message || importProgress.stage || 'import'} - {importProgress.progress || 0}%</span>
                  <div className="import-progress-bar">
                    <div
                      className="import-progress-fill"
                      style={{ width: `${Math.max(0, Math.min(100, importProgress.progress || 0))}%` }}
                    />
                  </div>
                </div>
              )}
              <p>Se importă datele, te rog așteaptă...</p>
            </div>
          )}

          {!importing && (
            <div className="import-options">

              <div className="import-option" onClick={() => excelRef.current?.click()}>
                <div className="import-icon">📊</div>
                <h3>Excel (.xlsx)</h3>
                <span className="import-btn">Alege fișier Excel</span>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  ref={excelRef}
                  onChange={handleExcelChange}
                  hidden
                />
              </div>

              <div className="import-option" onClick={() => gedcomRef.current?.click()}>
                <div className="import-icon">📄</div>
                <h3>GEDCOM (.ged)</h3>
                <span className="import-btn">Alege fișier GEDCOM</span>
                <input
                  type="file"
                  accept=".ged"
                  ref={gedcomRef}
                  onChange={handleGedcomChange}
                  hidden
                />
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
