import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { supabase } from '../supabaseClient';
import { salveazaCuConfirmare } from '../utils/confirmSave';
import { usePermissions } from '../treeAccess';
import { API_BASE } from '../utils/apiBase';
import { cropToFace, warmUpFaceModel } from '../utils/faceCrop';

async function uploadPhotoToSupabase(file, userId) {
  if (!file) return null;

  const ext = file.name.split('.').pop().toLowerCase();
  const fileName = `${userId}/${Date.now()}.${ext}`;

  const { data, error } = await supabase.storage
    .from('photos')
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) throw new Error('Upload poză eșuat: ' + error.message);

  const { data: { publicUrl } } = supabase.storage
    .from('photos')
    .getPublicUrl(fileName);

  return publicUrl;
}

export default function AddEditPanel({ persons, editPerson, onClose, onSaved }) {
  const isEdit = !!editPerson;
  const { canOwner } = usePermissions();
  const fileRef = useRef(null);

  const [form, setForm] = useState({
    full_name: '', given_name: '', surname: '', gender: 'M',
    birth: '', death: '', note: '', tel: '', email: '', address: '',
    father_id: '', mother_id: '', partner_id: '', partner_type: 'married',
  });

  const [newFather, setNewFather] = useState({ active: false, name: '', birth: '' });
  const [newMother, setNewMother] = useState({ active: false, name: '', birth: '' });
  const [newPartner, setNewPartner] = useState({ active: false, name: '', gender: 'M', birth: '' });

  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [faceProcessing, setFaceProcessing] = useState(false);
  const pendingCropRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    if (editPerson) {
      setForm({
        full_name: editPerson.full_name || '',
        given_name: editPerson.given_name || '',
        surname: editPerson.surname || '',
        gender: editPerson.gender || 'M',
        birth: editPerson.birth || '',
        death: editPerson.death || '',
        note: editPerson.note || '',
        tel: editPerson.tel || '',
        email: editPerson.email || '',
        address: editPerson.address || '',
        father_id: '', mother_id: '', partner_id: '', partner_type: 'married',
      });
      setNewFather({ active: false, name: '', birth: '' });
      setNewMother({ active: false, name: '', birth: '' });
      setNewPartner({ active: false, name: '', gender: 'M', birth: '' });
      axios.get(`${API_BASE}/api/persons/${editPerson.id}`).then(res => {
        const d = res.data;
        const father = (d.parents?.biological || []).find(p => p.gender === 'M');
        const mother = (d.parents?.biological || []).find(p => p.gender === 'F');
        const spouse = (d.spouses || [])[0];
        setForm(f => ({
          ...f,
          father_id: father?.id || '',
          mother_id: mother?.id || '',
          partner_id: spouse?.id || '',
        }));
      }).catch(() => {});
      if (editPerson.photo_url) {
        setPhotoPreview(
          editPerson.photo_url.startsWith('http') || editPerson.photo_url.startsWith('data:')
            ? editPerson.photo_url
            : `${API_BASE}${editPerson.photo_url}`
        );
      }
    } else {
      resetForm();
    }
  }, [editPerson]);

  function resetForm() {
    setForm({
      full_name: '', given_name: '', surname: '', gender: 'M',
      birth: '', death: '', note: '', tel: '', email: '', address: '',
      father_id: '', mother_id: '', partner_id: '', partner_type: 'married',
    });
    setNewFather({ active: false, name: '', birth: '' });
    setNewMother({ active: false, name: '', birth: '' });
    setNewPartner({ active: false, name: '', gender: 'M', birth: '' });
    setPhotoFile(null); setPhotoPreview(null);
    setFaceProcessing(false);
    pendingCropRef.current = null;
    setError(null); setSuccess(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
  }

  function handlePhotoChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setFaceProcessing(true);
    const promise = cropToFace(file);
    pendingCropRef.current = promise;
    promise
      .then(cropped => {
        if (pendingCropRef.current !== promise) return;
        if (cropped && cropped !== file) setPhotoPreview(URL.createObjectURL(cropped));
      })
      .catch(() => {})
      .finally(() => {
        if (pendingCropRef.current === promise) setFaceProcessing(false);
      });
  }

  async function createQuickPerson(name, gender, birth) {
    const fd = new FormData();
    fd.append('full_name', name);
    fd.append('gender', gender);
    fd.append('birth', birth || '');
    fd.append('death', '');
    fd.append('father_id', '');
    fd.append('mother_id', '');
    fd.append('partner_id', '');
    const res = await axios.post(`${API_BASE}/api/persons`, fd);
    return res.data.id;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.full_name.trim()) { setError('Numele complet este obligatoriu'); return; }

    setSaving(true);
    setError(null); setSuccess(null);

    try {

      let fatherId = form.father_id;
      let motherId = form.mother_id;
      let partnerId = form.partner_id;

      if (newFather.active && newFather.name.trim()) {
        fatherId = await createQuickPerson(newFather.name.trim(), 'M', newFather.birth);
      }
      if (newMother.active && newMother.name.trim()) {
        motherId = await createQuickPerson(newMother.name.trim(), 'F', newMother.birth);
      }
      if (newPartner.active && newPartner.name.trim()) {
        partnerId = await createQuickPerson(newPartner.name.trim(), newPartner.gender, newPartner.birth);
      }

      let photoUrl = null;
      if (photoFile) {
        try {

          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw new Error('Trebuie să fii autentificat pentru a încărca poze');
          const fileToUpload = (pendingCropRef.current && await pendingCropRef.current) || photoFile;
          photoUrl = await uploadPhotoToSupabase(fileToUpload, user.id);
        } catch (uploadErr) {
          setError(uploadErr.message);
          setSaving(false);
          return;
        }
      }

      const fd = new FormData();
      fd.append('full_name', form.full_name || '');
      fd.append('given_name', form.given_name || '');
      fd.append('surname', form.surname || '');
      fd.append('gender', form.gender || 'M');
      fd.append('birth', form.birth ? String(form.birth) : '');
      fd.append('death', form.death ? String(form.death) : '');
      fd.append('note', form.note || '');
      fd.append('tel', form.tel || '');
      fd.append('email', form.email || '');
      fd.append('address', form.address || '');
      fd.append('father_id', fatherId || '');
      fd.append('mother_id', motherId || '');
      fd.append('partner_id', partnerId || '');
      fd.append('partner_type', form.partner_type || 'married');

      if (photoUrl) fd.append('photo_url', photoUrl);

      if (isEdit) {
        await salveazaCuConfirmare((confirm) => {
          if (confirm) fd.set('confirm', 'true');
          return axios.put(`${API_BASE}/api/persons/${editPerson.id}`, fd);
        });
        setSuccess('Persoana a fost actualizată!');
      } else {
        await salveazaCuConfirmare((confirm) => {
          if (confirm) fd.set('confirm', 'true');
          return axios.post(`${API_BASE}/api/persons`, fd);
        });
        setSuccess('Persoana a fost adăugată!');
        resetForm();
      }
      if (onSaved) onSaved();
    } catch (err) {
      setError(err.anulat ? 'Salvare anulată.' : (err.response?.data?.detail || err.message || 'Eroare la salvare'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editPerson) return;
    if (!window.confirm(`Ești sigur/ă că vrei să ștergi pe ${editPerson.full_name}?`)) return;
    setSaving(true);
    try {
      await axios.delete(`${API_BASE}/api/persons/${editPerson.id}`);
      setSuccess('Persoana a fost ștearsă');
      if (onSaved) onSaved();
      if (onClose) onClose();
    } catch (err) {
      setError(err.response?.data?.detail || 'Eroare la ștergere');
    } finally { setSaving(false); }
  }

  const personOptions = (persons || []).filter(p => !editPerson || String(p.id) !== String(editPerson.id));

  function RelationField({ label, value, onChange, filterGender, newState, setNewState, newGender }) {
    const options = filterGender
      ? personOptions.filter(p => p.gender === filterGender)
      : personOptions;

    if (newState.active) {
      return (
        <div className="aep-relation-new">
          <div className="aep-relation-header">
            <span className="aep-field-label">{label} (persoană nouă)</span>
            <button type="button" className="aep-link-btn" onClick={() => setNewState({ ...newState, active: false })}>
              ← Din existenți
            </button>
          </div>
          <input
            placeholder="Nume complet"
            value={newState.name}
            onChange={e => setNewState({ ...newState, name: e.target.value })}
            className="aep-input"
          />
          <div className="aep-row-sm">
            {!filterGender && (
              <select value={newState.gender} onChange={e => setNewState({ ...newState, gender: e.target.value })} className="aep-input">
                <option value="M">♂ Masculin</option>
                <option value="F">♀ Feminin</option>
              </select>
            )}
            <input
              type="number" placeholder="An naștere"
              value={newState.birth}
              onChange={e => setNewState({ ...newState, birth: e.target.value })}
              className="aep-input"
            />
          </div>
        </div>
      );
    }

    return (
      <div className="aep-relation-field">
        <div className="aep-relation-header">
          <span className="aep-field-label">{label}</span>
          <button type="button" className="aep-link-btn" onClick={() => setNewState({ ...newState, active: true, name: '', birth: '' })}>
            + Creează nou
          </button>
        </div>
        <select value={value} onChange={onChange} className="aep-input">
          <option value="">— Fără —</option>
          {options.map(p => (
            <option key={p.id} value={p.id}>
              {p.gender === 'M' ? '♂' : p.gender === 'F' ? '♀' : '•'} {p.full_name} {p.birth ? `(${p.birth})` : ''}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="add-edit-panel">
      <div className="aep-header">
        <h2>{isEdit ? '✏️ Editare' : '➕ Adaugă persoană'}</h2>
        <button className="aep-close" onClick={onClose}>✕</button>
      </div>

      {error && <div className="aep-error">{error}</div>}
      {success && <div className="aep-success">{success}</div>}

      <div className="aep-form-scroll">
        <form onSubmit={handleSubmit}>

          <div className="aep-photo-section">
            <div className="aep-photo-preview-wrap">
              {photoPreview ? (
                <img src={photoPreview} alt="Preview" className="aep-photo-preview" />
              ) : (
                <div className="aep-photo-placeholder">📷</div>
              )}
              {faceProcessing && (
                <div className="aep-photo-processing">
                  <span className="aep-spinner" /> Se focalizează pe față…
                </div>
              )}
            </div>
            <label className="aep-photo-btn">
              {photoPreview ? 'Schimbă poza' : 'Adaugă poză'}
              <input type="file" accept="image/*" onChange={handlePhotoChange}
                onClick={warmUpFaceModel} ref={fileRef} hidden />
            </label>
            <p className="aep-photo-hint">Poza se decupează automat, centrată pe față.</p>
          </div>

          <div className="aep-section">
            <h3>Date personale</h3>
            <label className="aep-field">
              <span>Nume complet *</span>
              <input name="full_name" value={form.full_name} onChange={handleChange} placeholder="ex: Ion Popescu" required />
            </label>
            <div className="aep-row">
              <label className="aep-field">
                <span>Prenume</span>
                <input name="given_name" value={form.given_name} onChange={handleChange} placeholder="Ion" />
              </label>
              <label className="aep-field">
                <span>Nume la naștere</span>
                <input name="surname" value={form.surname} onChange={handleChange} placeholder="Popescu" />
              </label>
            </div>
            <div className="aep-row">
              <label className="aep-field">
                <span>Gen</span>
                <select name="gender" value={form.gender} onChange={handleChange}>
                  <option value="M">♂ Masculin</option>
                  <option value="F">♀ Feminin</option>
                </select>
              </label>
              <label className="aep-field">
                <span>An naștere</span>
                <input name="birth" type="number" value={form.birth} onChange={handleChange} placeholder="1980" />
              </label>
              <label className="aep-field">
                <span>An deces</span>
                <input name="death" type="number" value={form.death} onChange={handleChange} placeholder="—" />
              </label>
            </div>
          </div>

          <div className="aep-section">
            <h3>Relații de familie</h3>

            <RelationField
              label="Tată"
              value={form.father_id}
              onChange={e => setForm(f => ({ ...f, father_id: e.target.value }))}
              filterGender="M"
              newState={newFather}
              setNewState={setNewFather}
            />

            <RelationField
              label="Mamă"
              value={form.mother_id}
              onChange={e => setForm(f => ({ ...f, mother_id: e.target.value }))}
              filterGender="F"
              newState={newMother}
              setNewState={setNewMother}
            />

            <RelationField
              label="Partener/ă"
              value={form.partner_id}
              onChange={e => setForm(f => ({ ...f, partner_id: e.target.value }))}
              filterGender={null}
              newState={newPartner}
              setNewState={setNewPartner}
            />

            {(form.partner_id || newPartner.active) && (
              <label className="aep-field">
                <span>Tip relație</span>
                <select name="partner_type" value={form.partner_type} onChange={handleChange}>
                  <option value="married">Căsătorit/ă</option>
                  <option value="partner">Necăsătorit/ă (partener/ă)</option>
                  <option value="engaged">Logodit/ă</option>
                  <option value="divorced">Divorțat/ă</option>
                  <option value="separated">Separat/ă</option>
                </select>
              </label>
            )}
          </div>

          <div className="aep-section">
            <h3>Contact & Detalii</h3>
            <label className="aep-field">
              <span>Adresă</span>
              <input name="address" value={form.address} onChange={handleChange} placeholder="ex: Brașov" />
            </label>
            <div className="aep-row">
              <label className="aep-field">
                <span>Telefon</span>
                <input name="tel" value={form.tel} onChange={handleChange} placeholder="07xx..." />
              </label>
              <label className="aep-field">
                <span>Email</span>
                <input name="email" value={form.email} onChange={handleChange} placeholder="email@..." />
              </label>
            </div>
            <label className="aep-field">
              <span>Notă</span>
              <textarea name="note" value={form.note} onChange={handleChange} placeholder="Observații..." rows={3} />
            </label>
          </div>

          <div className="aep-actions">
            <button type="submit" className="aep-btn-save" disabled={saving}>
              {saving ? 'Se salvează...' : isEdit ? 'Salvează modificările' : 'Adaugă persoana'}
            </button>
            {isEdit && canOwner && (
              <button type="button" className="aep-btn-delete" onClick={handleDelete} disabled={saving}>
                🗑️ Șterge persoana
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
