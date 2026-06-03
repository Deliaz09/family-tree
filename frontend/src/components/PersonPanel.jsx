import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { supabase } from '../supabaseClient';
import { usePermissions } from '../treeAccess';
import SearchBar from './SearchBar';
import { salveazaCuConfirmare } from '../utils/confirmSave';
import { API_BASE } from '../utils/apiBase';
const API = API_BASE;

const KIND_LABEL = { biological: 'biologic', adopted: 'adoptiv', step: 'vitreg' };
const REL_TYPE_LABEL = {
  married: 'căsătorit/ă', divorced: 'divorțat/ă', separated: 'separat/ă',
  partner: 'partener/ă', engaged: 'logodit/ă',
};
const relTypeLabel = (t) => REL_TYPE_LABEL[t] || (t ? String(t) : 'căsătorit/ă');

function resolvePhotoUrl(photo_url, photo) {
  if (photo_url) {

    if (photo_url.startsWith('http') || photo_url.startsWith('data:')) {
      return photo_url;
    }

    return `${API}${photo_url}`;
  }
  if (photo) {
    return `${API}/photos/${photo}`;
  }
  return null;
}

export default function PersonPanel({ personId, persons, onClose, onSaved, onFocus, onHighlightPath }) {
  const { canWrite, canOwner } = usePermissions();
  const [person, setPerson] = useState(null);
  const [parents, setParents] = useState([]);
  const [parentRelations, setParentRelations] = useState([]);
  const [spouses, setSpouses] = useState([]);
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeAction, setActiveAction] = useState(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!personId) return;
    setLoading(true);
    setActiveAction(null);
    axios.get(`${API}/api/persons/${personId}`)
      .then(res => {
        const d = res.data;
        setPerson(d.person);
        setParents([
          ...(d.parents?.biological || []).map(p => ({ ...p, kind: 'biological' })),
          ...(d.parents?.step || []).map(p => ({ ...p, kind: 'step' })),
          ...(d.parents?.adopted || []).map(p => ({ ...p, kind: 'adopted' })),
        ]);
        setParentRelations(d.parent_relations || []);
        setSpouses(d.spouses || []);
        setChildren([
          ...(d.children?.biological || []).map(c => ({ ...c, kind: 'biological' })),
          ...(d.children?.step || []).map(c => ({ ...c, kind: 'step' })),
          ...(d.children?.adopted || []).map(c => ({ ...c, kind: 'adopted' })),
        ]);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [personId]);

  if (loading) return <div className="person-panel"><div className="loader"></div></div>;
  if (!person) return null;

  if (collapsed) {
    return (
      <button
        className="pp-expand pp-expand-floating"
        title="Arată detaliile persoanei"
        onClick={() => setCollapsed(false)}
      >
        <span>‹</span>
        <small>Detalii</small>
      </button>
    );
  }

  const photoUrl = resolvePhotoUrl(person.photo_url, person.photo);
  const initials = (person.full_name || 'NN').split(' ').map(w => w[0]).join('').slice(0, 2);

  return (
    <>
      <button
        className="pp-hide-tab"
        title="Ascunde panoul de detalii"
        onClick={() => setCollapsed(true)}
      >
        <span>›</span>
        <small>Ascunde</small>
      </button>
      <div className="person-panel">
      <div className="pp-header">
        <h2>{person.full_name}</h2>
        <div className="pp-header-actions">
          <button className="pp-collapse" title="Restrânge panoul" onClick={() => setCollapsed(true)}>›</button>
          <button className="pp-close" title="Închide" onClick={onClose}>✕</button>
        </div>
      </div>

      <div className="pp-profile">
        {photoUrl
          ? <img src={photoUrl} alt={person.full_name} className="pp-photo" />
          : <div className={`pp-avatar gender-bg-${(person.gender || 'u').toLowerCase()}`}>{initials}</div>
        }

        {canWrite && <PhotoUpload personId={personId} onDone={onSaved} />}
      </div>

      <div className="pp-info">
        {person.surname && <p>Numele la naștere: <strong>{person.surname}</strong></p>}
        <p>Gen: <strong>{person.gender === 'M' ? 'Masculin' : person.gender === 'F' ? 'Feminin' : '—'}</strong></p>
        {person.birth && <p>Anul nașterii: <strong>{person.birth}</strong></p>}
        {person.death && <p>Anul decesului: <strong>{person.death}</strong></p>}
        {person.address && <p>📍 {person.address}</p>}
        {person.tel && <p>📞 {person.tel}</p>}
        {(person.email_addr || person.email) && <p>✉️ {person.email_addr || person.email}</p>}
        {person.note && <p>📝 {person.note}</p>}
      </div>

      <div className="pp-section">
        {parents.length > 0 && (
          <div className="pp-family-group">
            <h4>Părinți</h4>
            {parents.map(p => (
              <span key={`${p.id}-${p.kind}`} className="pp-tag">
                {p.full_name}
                <em className="pp-tag-rel">{KIND_LABEL[p.kind] || 'biologic'}</em>
              </span>
            ))}
            {parentRelations.map(r => (
              r.father && r.mother
                ? <p key={r.rel_id} className="pp-rel-note">Părinții între ei: <strong>{relTypeLabel(r.rel_type)}</strong></p>
                : null
            ))}
          </div>
        )}
        {spouses.length > 0 && (
          <div className="pp-family-group">
            <h4>Partener/ă</h4>
            {spouses.map(s => (
              <span key={s.id} className="pp-tag">
                {s.full_name}
                <em className="pp-tag-rel">{relTypeLabel(s.rel_type)}</em>
              </span>
            ))}
          </div>
        )}
        {children.length > 0 && (
          <div className="pp-family-group">
            <h4>Copii</h4>
            {children.map(c => (
              <span key={`${c.id}-${c.kind}`} className="pp-tag">
                {c.full_name}
                <em className="pp-tag-rel">{KIND_LABEL[c.kind] || 'biologic'}</em>
              </span>
            ))}
          </div>
        )}
      </div>

      {onFocus && (
        <button className="pp-action-btn pp-focus-btn" onClick={() => onFocus(personId)}>
          🔍 Arată familia
        </button>
      )}

      <button className="pp-action-btn" onClick={() => setActiveAction(activeAction === 'relationship' ? null : 'relationship')}>
        🔗 Rudenie cu…
      </button>
      {activeAction === 'relationship' && (
        <ShowRelationship
          personId={personId}
          personName={person.full_name}
          persons={persons}
          onHighlightPath={onHighlightPath}
        />
      )}

      {canWrite && (person.email_addr || person.email) && (
        <>
          <button className="pp-action-btn" onClick={() => setActiveAction(activeAction === 'email' ? null : 'email')}>
            ✉️ Trimite email
          </button>
          {activeAction === 'email' && (
            <SendEmailToMember
              toEmail={person.email_addr || person.email}
              toName={person.full_name}
            />
          )}
        </>
      )}

      {canWrite && (
        <>
          <button className="pp-action-btn" onClick={() => setActiveAction(activeAction === 'edit' ? null : 'edit')}>
            ✏️ Editează datele
          </button>
          {activeAction === 'edit' && (
            <EditForm person={person} onSaved={onSaved} />
          )}

          <div className="pp-section">
            <p className="pp-section-title">Adaugă o rudă:</p>

            <button className="pp-action-btn" onClick={() => setActiveAction(activeAction === 'partner' ? null : 'partner')}>
              💍 Adaugă partener/ex
            </button>
            {activeAction === 'partner' && (
              <AddRelative type="partner" personId={personId} person={person} persons={persons} spouses={spouses} onSaved={onSaved} />
            )}

            <button className="pp-action-btn" onClick={() => setActiveAction(activeAction === 'sibling' ? null : 'sibling')}>
              👫 Adaugă frate/soră
            </button>
            {activeAction === 'sibling' && (
              <AddRelative type="sibling" personId={personId} person={person} persons={persons} parentRelations={parentRelations} onSaved={onSaved} />
            )}

            <button className="pp-action-btn" onClick={() => setActiveAction(activeAction === 'child' ? null : 'child')}>
              👶 Adaugă copil
            </button>
            {activeAction === 'child' && (
              <AddRelative type="child" personId={personId} person={person} persons={persons} spouseIds={spouses.map(s => s.id)} onSaved={onSaved} />
            )}

            <button className="pp-action-btn" onClick={() => setActiveAction(activeAction === 'parents' ? null : 'parents')}>
              👨‍👩‍👧 Adaugă părinți
            </button>
            {activeAction === 'parents' && (
              <AddRelative type="parents" personId={personId} person={person} persons={persons} existingParents={parents} onSaved={onSaved} />
            )}
          </div>
        </>
      )}

      {canOwner && (spouses.length > 0 || parentRelations.length > 0 || children.length > 0) && (
        <div className="pp-section">
          <p className="pp-section-title">Șterge o legătură:</p>
          <button className="pp-action-btn" onClick={() => setActiveAction(activeAction === 'remove-link' ? null : 'remove-link')}>
            ✂️ Șterge o relație existentă
          </button>
          {activeAction === 'remove-link' && (
            <RemoveRelations
              personId={personId}
              spouses={spouses}
              parentRelations={parentRelations}
              childrenList={children}
              onSaved={onSaved}
            />
          )}
        </div>
      )}

      {canOwner && (
        <DeletePerson personId={personId} personName={person.full_name} onDeleted={() => { onSaved(); onClose(); }} />
      )}
      {canWrite && !canOwner && (
        <RequestDeletePerson personId={personId} personName={person.full_name} />
      )}
      </div>
    </>
  );
}

function PhotoUpload({ personId, onDone }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {

      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr || !user) throw new Error('Trebuie să fii autentificat');

      const ext = file.name.split('.').pop().toLowerCase();
      const fileName = `${user.id}/${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('photos')
        .upload(fileName, file, { cacheControl: '3600', upsert: false });

      if (uploadErr) throw new Error('Upload eșuat: ' + uploadErr.message);

      const { data: { publicUrl } } = supabase.storage
        .from('photos')
        .getPublicUrl(fileName);

      const fd = new FormData();
      fd.append('photo_url', publicUrl);

      await axios.put(`${API}/api/persons/${personId}`, fd);

      if (onDone) onDone();
    } catch (err) {
      alert('Eroare la upload: ' + (err.response?.data?.detail || err.message));
    }
    setUploading(false);
  }

  return (
    <label className="pp-photo-btn">
      {uploading ? 'Se încarcă...' : '📷 Schimbă poza'}
      <input type="file" accept="image/*" onChange={handleFile} ref={fileRef} hidden />
    </label>
  );
}

function SendEmailToMember({ toEmail, toName }) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function trimite(e) {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      setMsg({ ok: false, text: 'Completează subiectul și mesajul.' });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await axios.post(`${API}/api/email/send`, {
        to_email: toEmail,
        to_name: toName,
        subject: subject.trim(),
        message: message.trim(),
      });
      setMsg({ ok: true, text: `Email trimis către ${toEmail}.` });
      setSubject('');
      setMessage('');
    } catch (err) {
      setMsg({ ok: false, text: err.response?.data?.detail || 'Emailul nu a putut fi trimis.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="pp-email-form" onSubmit={trimite}>
      <p className="pp-email-to">Către: <strong>{toName}</strong> ({toEmail})</p>
      <input
        className="pp-input"
        placeholder="Subiect"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
      />
      <textarea
        className="pp-input"
        rows={4}
        placeholder="Mesaj..."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <button type="submit" className="pp-action-btn" disabled={busy}>
        {busy ? 'Se trimite...' : 'Trimite'}
      </button>
      {msg && <p className={msg.ok ? 'pp-email-ok' : 'pp-email-err'}>{msg.text}</p>}
    </form>
  );
}

function ShowRelationship({ personId, personName, persons, onHighlightPath }) {
  const [target, setTarget] = useState(null);
  const [result, setResult] = useState(null);
  const [searching, setSearching] = useState(false);
  const [errMsg, setErrMsg] = useState('');

  async function findRelationship(person) {
    if (!person) return;
    if (String(person.id) === String(personId)) {
      setErrMsg('Selectează o persoană diferită.'); setResult(null); setTarget(null);
      return;
    }
    setTarget(person);
    setSearching(true); setErrMsg(''); setResult(null);
    try {
      const res = await axios.get(`${API}/api/relationship`, {
        params: { from: personId, to: person.id },
      });
      setResult(res.data);
      if (res.data.found && res.data.path_ids?.length > 1 && onHighlightPath) {
        onHighlightPath({
          ids: res.data.path_ids,
          label: `${person.full_name} este ${res.data.label} pentru ${personName}`,
        });
      }
    } catch (err) {
      setErrMsg(err.response?.data?.detail || 'Eroare la căutare.');
    } finally {
      setSearching(false);
    }
  }

  const otherPersons = (persons || []).filter(p => String(p.id) !== String(personId));

  return (
    <div className="pp-sub-form">
      <p className="pp-section-title">Rudenie cu…</p>
      <SearchBar persons={otherPersons} onSelect={findRelationship} />
      {errMsg && <p className="pp-error">⚠ {errMsg}</p>}
      {searching && <p className="pp-relatie-drum"><small>Se caută…</small></p>}
      {result && (
        <div className="pp-result">
          {!result.found
            ? <p className="pp-none">{result.label}</p>
            : (
              <>
                <div className="pp-relatie-titlu">
                  <strong>{target?.full_name}</strong> este{' '}
                  <span className="pp-relatie-tip">{result.label}</span>{' '}
                  pentru <strong>{personName}</strong>
                </div>
                {result.chain && result.chain.length > 1 && (
                  <div className="pp-relatie-drum">
                    <small>
                      {result.chain
                        .map((c, i) => (i === 0 ? c.full_name : `${c.step_ro} — ${c.full_name}`))
                        .join(' → ')}
                    </small>
                  </div>
                )}
              </>
            )
          }
        </div>
      )}
    </div>
  );
}

function EditForm({ person, onSaved }) {
  const [form, setForm] = useState({
    full_name: person.full_name || '',
    given_name: person.given_name || '',
    surname: person.surname || '',
    gender: person.gender || 'M',
    birth: person.birth || '',
    death: person.death || '',
    note: person.note || '',
    tel: person.tel || '',
    email: person.email_addr || person.email || '',
    address: person.address || '',
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSave() {
    setSaving(true); setMsg('');
    try {

      await salveazaCuConfirmare((confirm) => {
        const fd = new FormData();
        Object.entries(form).forEach(([k, v]) => fd.append(k, v || ''));
        if (confirm) fd.set('confirm', 'true');
        return axios.put(`${API}/api/persons/${person.id}`, fd);
      });
      setMsg('Salvat!');
      if (onSaved) onSaved();
    } catch (err) {
      setMsg(err.anulat ? 'Salvare anulată.' : 'Eroare: ' + (err.response?.data?.detail || err.message));
    }
    setSaving(false);
  }

  return (
    <div className="pp-sub-form">
      <label>Nume complet<input name="full_name" value={form.full_name} onChange={handleChange} className="pp-input" /></label>
      <label>Prenume<input name="given_name" value={form.given_name} onChange={handleChange} className="pp-input" /></label>
      <label>Nume la naștere<input name="surname" value={form.surname} onChange={handleChange} className="pp-input" /></label>
      <label>Gen
        <select name="gender" value={form.gender} onChange={handleChange} className="pp-input">
          <option value="M">Masculin</option>
          <option value="F">Feminin</option>
        </select>
      </label>
      <div className="pp-row">
        <label>An naștere<input name="birth" type="number" value={form.birth} onChange={handleChange} className="pp-input" /></label>
        <label>An deces<input name="death" type="number" value={form.death} onChange={handleChange} className="pp-input" /></label>
      </div>
      <label>Adresă<input name="address" value={form.address} onChange={handleChange} className="pp-input" /></label>
      <label>Telefon<input name="tel" value={form.tel} onChange={handleChange} className="pp-input" /></label>
      <label>Email<input name="email" value={form.email} onChange={handleChange} className="pp-input" /></label>
      <label>Notă<textarea name="note" value={form.note} onChange={handleChange} className="pp-input" rows={2} /></label>
      <button onClick={handleSave} disabled={saving} className="pp-submit-btn">
        {saving ? 'Se salvează...' : 'Salvează'}
      </button>
      {msg && <p className={msg.startsWith('Eroare') ? 'pp-error' : 'pp-success'}>{msg}</p>}
    </div>
  );
}

function AddRelative({ type, personId, person, persons, onSaved, parentRelations, spouseIds, existingParents }) {
  const [mode, setMode] = useState('existing');
  const [selectedId, setSelectedId] = useState('');
  const [newName, setNewName] = useState('');
  const [newGender, setNewGender] = useState('M');
  const [newBirth, setNewBirth] = useState('');
  const [relType, setRelType] = useState('married');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const [childFiliation,  setChildFiliation]  = useState('birth');
  const [parentFiliation, setParentFiliation] = useState('birth');

  const [siblingKind,           setSiblingKind]           = useState('full');
  const [siblingPairIdx,        setSiblingPairIdx]        = useState(0);
  const [siblingSharedParentId, setSiblingSharedParentId] = useState('');

  const [childCoParent, setChildCoParent] = useState((spouseIds && spouseIds[0]) || '__none__');
  const [childOtherId,  setChildOtherId]  = useState('');

  const [childOtherMode,   setChildOtherMode]   = useState('existing');
  const [childOtherName,   setChildOtherName]   = useState('');
  const [childOtherGender, setChildOtherGender] = useState('F');
  const [childOtherBirth,  setChildOtherBirth]  = useState('');

  const ownParents = (parentRelations || [])
    .flatMap(rel => [rel.father, rel.mother])
    .filter(Boolean)
    .filter((p, i, arr) => arr.findIndex(x => String(x.id) === String(p.id)) === i);

  async function creeazaPersoanaRapid(name, gender, birth) {
    const fd = new FormData();
    fd.append('full_name', name);
    fd.append('gender', gender);
    fd.append('birth', birth || '');
    fd.append('death', '');
    fd.append('father_id', '');
    fd.append('mother_id', '');
    fd.append('partner_id', '');
    const res = await axios.post(`${API}/api/persons`, fd);
    return res.data.id;
  }

  const labels = {
    partner: { title: 'Adaugă partener/ex', existing: 'Selectează partener/a' },
    sibling: { title: 'Adaugă frate/soră',  existing: 'Selectează frate/soră' },
    child:   { title: 'Adaugă copil',        existing: 'Selectează copil' },
    parents: { title: 'Adaugă părinți',      existing: 'Selectează părinte' },
  };

  const putCuConfirmare = (url, fd) => salveazaCuConfirmare((confirm) => {
    if (confirm) fd.set('confirm', 'true');
    return axios.put(url, fd);
  });

  async function handleSave() {
    setSaving(true); setMsg('');
    try {
      let targetId = selectedId;

      if (mode === 'new' && newName.trim()) {
        const fd = new FormData();
        fd.append('full_name', newName.trim());
        fd.append('gender', newGender);
        fd.append('birth', newBirth || '');
        fd.append('death', '');
        fd.append('father_id', '');
        fd.append('mother_id', '');
        fd.append('partner_id', '');
        const res = await axios.post(`${API}/api/persons`, fd);
        targetId = res.data.id;
      }

      if (!targetId) { setMsg('Selectează sau creează o persoană'); setSaving(false); return; }

      if (type === 'partner') {
        const fd = new FormData();
        fd.append('full_name', '');
        fd.append('partner_id', personId);
        fd.append('partner_type', relType);
        await putCuConfirmare(`${API}/api/persons/${targetId}`, fd);

      } else if (type === 'sibling') {
        const pairs = parentRelations || [];
        if (!pairs.length) {
          setMsg('Persoana nu are părinți — adaugă-i întâi părinți ca să poți adăuga frați.');
          setSaving(false); return;
        }

        if (siblingKind === 'full') {
          const pair = pairs[Math.min(siblingPairIdx, pairs.length - 1)];
          const fd = new FormData();
          fd.append('child_id', targetId);
          fd.append('kind', 'birth');
          await salveazaCuConfirmare((confirm) => {
            if (confirm) fd.set('confirm', 'true');
            return axios.post(`${API}/api/relations/${pair.rel_id}/children`, fd);
          });
        } else {
          const shared = ownParents.find(p => String(p.id) === String(siblingSharedParentId));
          if (!shared) {
            setMsg('Alege părintele comun pentru fratele vitreg.');
            setSaving(false); return;
          }
          let otherId = '', otherGender = childOtherGender;
          if (childOtherMode === 'new') {
            if (childOtherName.trim()) {
              otherId = await creeazaPersoanaRapid(childOtherName.trim(), childOtherGender, childOtherBirth);
            }
          } else if (childOtherId) {
            otherId = childOtherId;
            otherGender = persons?.find(p => String(p.id) === String(otherId))?.gender;
          }
          let fatherId = '', motherId = '';
          const aseaza = (id, g) => {
            if (!id) return;
            if (g === 'M' && !fatherId) fatherId = id;
            else if (g === 'F' && !motherId) motherId = id;
            else if (!fatherId) fatherId = id; else if (!motherId) motherId = id;
          };
          aseaza(shared.id, shared.gender);
          aseaza(otherId, otherGender);
          const fd = new FormData();
          fd.append('full_name', '');
          fd.append('father_id', fatherId);
          fd.append('mother_id', motherId);
          fd.append('partner_id', '');
          fd.append('parent_kind', 'birth');
          await putCuConfirmare(`${API}/api/persons/${targetId}`, fd);
        }

      } else if (type === 'child') {
        const fd = new FormData();
        fd.append('full_name', '');
        const me = person || persons?.find(p => String(p.id) === String(personId));

        let coParent = '';
        if (childCoParent === '__none__') {
          coParent = '';
        } else if (childCoParent === '__other__') {
          if (childOtherMode === 'new') {
            if (!childOtherName.trim()) {
              setMsg('Completează numele celuilalt părinte sau alege „Fără partener".');
              setSaving(false); return;
            }
            coParent = await creeazaPersoanaRapid(childOtherName.trim(), childOtherGender, childOtherBirth);
          } else {
            if (!childOtherId) {
              setMsg('Selectează celălalt părinte sau alege „Fără partener".');
              setSaving(false); return;
            }
            coParent = childOtherId;
          }
        } else {
          coParent = childCoParent;
        }

        if (me?.gender === 'M') {
          fd.append('father_id', personId);
          fd.append('mother_id', coParent || '');
        } else {
          fd.append('mother_id', personId);
          fd.append('father_id', coParent || '');
        }
        fd.append('partner_id', '');
        fd.append('parent_kind', childFiliation);
        await putCuConfirmare(`${API}/api/persons/${targetId}`, fd);

      } else if (type === 'parents') {
        const fd = new FormData();
        fd.append('full_name', '');
        const target = persons?.find(p => String(p.id) === String(targetId));
        const newParentGender = (mode === 'new') ? newGender : target?.gender;
        const existFather = existingParents?.find(p => p.gender === 'M');
        const existMother = existingParents?.find(p => p.gender === 'F');
        if (newParentGender === 'M') {
          fd.append('father_id', targetId);
          fd.append('mother_id', existMother?.id || '');
        } else {
          fd.append('mother_id', targetId);
          fd.append('father_id', existFather?.id || '');
        }
        fd.append('partner_id', '');
        fd.append('parent_kind', parentFiliation);
        await putCuConfirmare(`${API}/api/persons/${personId}`, fd);
      }

      setMsg('Adăugat cu succes!');
      setSelectedId(''); setNewName(''); setNewBirth('');
      if (onSaved) onSaved();
    } catch (err) {
      setMsg(err.anulat ? 'Salvare anulată.' : 'Eroare: ' + (err.response?.data?.detail || err.message));
    }
    setSaving(false);
  }

  const otherPersons = (persons || []).filter(p => String(p.id) !== String(personId));

  return (
    <div className="pp-sub-form">
      <div className="pp-toggle">
        <button className={mode === 'existing' ? 'active' : ''} onClick={() => setMode('existing')}>Din existenți</button>
        <button className={mode === 'new' ? 'active' : ''} onClick={() => setMode('new')}>Persoană nouă</button>
      </div>

      {mode === 'existing' ? (
        <select value={selectedId} onChange={e => setSelectedId(e.target.value)} className="pp-input">
          <option value="">— {labels[type].existing} —</option>
          {otherPersons.map(p => (
            <option key={p.id} value={p.id}>
              {p.gender === 'M' ? '♂' : p.gender === 'F' ? '♀' : '•'} {p.full_name} {p.birth ? `(${p.birth})` : ''}
            </option>
          ))}
        </select>
      ) : (
        <>
          <input placeholder="Nume complet" value={newName} onChange={e => setNewName(e.target.value)} className="pp-input" />
          <div className="pp-row">
            <select value={newGender} onChange={e => setNewGender(e.target.value)} className="pp-input">
              <option value="M">♂ Masculin</option>
              <option value="F">♀ Feminin</option>
            </select>
            <input type="number" placeholder="An naștere" value={newBirth} onChange={e => setNewBirth(e.target.value)} className="pp-input" />
          </div>
        </>
      )}

      {type === 'partner' && (
        <label>Tip relație
          <select value={relType} onChange={e => setRelType(e.target.value)} className="pp-input">
            <option value="married">Căsătorit/ă</option>
            <option value="partner">Necăsătorit/ă (partener/ă)</option>
            <option value="engaged">Logodit/ă</option>
            <option value="divorced">Divorțat/ă</option>
            <option value="separated">Separat/ă</option>
          </select>
        </label>
      )}

      {type === 'sibling' && (
        <div className="pp-child-options">
          {(parentRelations || []).length === 0 ? (
            <p className="pp-error">Persoana nu are părinți încă. Adaugă-i întâi părinți ca să poți adăuga frați/surori.</p>
          ) : (
            <>
              <div className="pp-toggle">
                <button type="button" className={siblingKind === 'full' ? 'active' : ''} onClick={() => setSiblingKind('full')}>Frate bun</button>
                <button type="button" className={siblingKind === 'half' ? 'active' : ''} onClick={() => setSiblingKind('half')}>Frate vitreg</button>
              </div>

              {siblingKind === 'full' ? (
                <label>Sub care părinți
                  <select value={siblingPairIdx} onChange={e => setSiblingPairIdx(Number(e.target.value))} className="pp-input">
                    {(parentRelations || []).map((rel, i) => {
                      const f = rel.father?.full_name || '—';
                      const m = rel.mother?.full_name || '—';
                      return <option key={rel.rel_id || i} value={i}>{f} &amp; {m}</option>;
                    })}
                  </select>
                </label>
              ) : (
                <>
                  <label>Părinte comun
                    <select value={siblingSharedParentId} onChange={e => setSiblingSharedParentId(e.target.value)} className="pp-input">
                      <option value="">— Alege părintele comun —</option>
                      {ownParents.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.gender === 'M' ? '♂' : p.gender === 'F' ? '♀' : '•'} {p.full_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="pp-section-title">Celălalt părinte</p>
                  <div className="pp-toggle">
                    <button type="button" className={childOtherMode === 'existing' ? 'active' : ''} onClick={() => setChildOtherMode('existing')}>Din existenți</button>
                    <button type="button" className={childOtherMode === 'new' ? 'active' : ''} onClick={() => setChildOtherMode('new')}>Persoană nouă</button>
                  </div>
                  {childOtherMode === 'existing' ? (
                    <select value={childOtherId} onChange={e => setChildOtherId(e.target.value)} className="pp-input">
                      <option value="">— Fără / necunoscut —</option>
                      {otherPersons.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.gender === 'M' ? '♂' : p.gender === 'F' ? '♀' : '•'} {p.full_name} {p.birth ? `(${p.birth})` : ''}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <>
                      <input placeholder="Nume complet celălalt părinte" value={childOtherName} onChange={e => setChildOtherName(e.target.value)} className="pp-input" />
                      <div className="pp-row">
                        <select value={childOtherGender} onChange={e => setChildOtherGender(e.target.value)} className="pp-input">
                          <option value="M">♂ Masculin</option>
                          <option value="F">♀ Feminin</option>
                        </select>
                        <input type="number" placeholder="An naștere" value={childOtherBirth} onChange={e => setChildOtherBirth(e.target.value)} className="pp-input" />
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}

      {type === 'child' && (
        <div className="pp-child-options">
          <label>Celălalt părinte
            <select value={childCoParent} onChange={e => setChildCoParent(e.target.value)} className="pp-input">
              {(spouseIds || []).map(id => {
                const sp = persons?.find(p => String(p.id) === String(id));
                return <option key={id} value={id}>Cu {sp?.full_name || 'partener existent'}</option>;
              })}
              <option value="__other__">Cu alt partener…</option>
              <option value="__none__">Fără partener (un singur părinte)</option>
            </select>
          </label>

          {childCoParent === '__other__' && (
            <>
              <div className="pp-toggle">
                <button
                  type="button"
                  className={childOtherMode === 'existing' ? 'active' : ''}
                  onClick={() => setChildOtherMode('existing')}
                >Din existenți</button>
                <button
                  type="button"
                  className={childOtherMode === 'new' ? 'active' : ''}
                  onClick={() => setChildOtherMode('new')}
                >Persoană nouă</button>
              </div>

              {childOtherMode === 'existing' ? (
                <select value={childOtherId} onChange={e => setChildOtherId(e.target.value)} className="pp-input">
                  <option value="">— Selectează celălalt părinte —</option>
                  {otherPersons
                    .filter(p => String(p.id) !== String(personId))
                    .map(p => (
                      <option key={p.id} value={p.id}>
                        {p.gender === 'M' ? '♂' : p.gender === 'F' ? '♀' : '•'} {p.full_name} {p.birth ? `(${p.birth})` : ''}
                      </option>
                    ))}
                </select>
              ) : (
                <>
                  <input
                    placeholder="Nume complet celălalt părinte"
                    value={childOtherName}
                    onChange={e => setChildOtherName(e.target.value)}
                    className="pp-input"
                  />
                  <div className="pp-row">
                    <select value={childOtherGender} onChange={e => setChildOtherGender(e.target.value)} className="pp-input">
                      <option value="M">♂ Masculin</option>
                      <option value="F">♀ Feminin</option>
                    </select>
                    <input
                      type="number" placeholder="An naștere"
                      value={childOtherBirth}
                      onChange={e => setChildOtherBirth(e.target.value)}
                      className="pp-input"
                    />
                  </div>
                </>
              )}
            </>
          )}

          <label>Tip filiație
            <select value={childFiliation} onChange={e => setChildFiliation(e.target.value)} className="pp-input">
              <option value="birth">Biologic</option>
              <option value="adoptive">Adoptat</option>
            </select>
          </label>
        </div>
      )}

      {type === 'parents' && (
        <label>Tip relație părinte-copil
          <select value={parentFiliation} onChange={e => setParentFiliation(e.target.value)} className="pp-input">
            <option value="birth">Biologic</option>
            <option value="adoptive">Adoptiv</option>
            <option value="step">Vitreg</option>
          </select>
        </label>
      )}

      <button
        onClick={handleSave}
        disabled={saving || (!selectedId && !newName.trim())}
        className="pp-submit-btn"
      >
        {saving ? 'Se adaugă...' : 'Adaugă'}
      </button>
      {msg && <p className={msg.startsWith('Eroare') ? 'pp-error' : 'pp-success'}>{msg}</p>}
    </div>
  );
}

function RemoveRelations({ personId, spouses, parentRelations, childrenList, onSaved }) {
  const [busyKey, setBusyKey] = useState(null);
  const [confirmKey, setConfirmKey] = useState(null);
  const [removed, setRemoved] = useState(() => new Set());
  const [msg, setMsg] = useState('');

  const childrenByRel = {};
  (childrenList || []).forEach(c => {
    if (c.rel_id) childrenByRel[c.rel_id] = (childrenByRel[c.rel_id] || 0) + 1;
  });

  async function run(key, action, okMsg) {
    setBusyKey(key); setMsg('');
    try {
      await action();
      setRemoved(prev => new Set(prev).add(key));
      setConfirmKey(null);
      setMsg(okMsg);
      if (onSaved) onSaved();
    } catch (err) {
      setMsg('Eroare: ' + (err.response?.data?.detail || err.message));
    } finally {
      setBusyKey(null);
    }
  }

  const rows = [];

  (spouses || []).forEach(s => {
    const nCopii = childrenByRel[s.rel_id] || 0;
    rows.push({
      key: `couple-${s.rel_id}`,
      icon: '💍',
      label: `Relație de cuplu cu ${s.full_name}`,
      warn: nCopii > 0
        ? `Atenție: această relație are ${nCopii === 1 ? 'un copil' : nCopii + ' copii'}; se va elimina și legătura lor de filiație cu acest cuplu.`
        : null,
      action: () => axios.delete(`${API}/api/relations/${s.rel_id}`),
      okMsg: `Relația de cuplu cu ${s.full_name} a fost ștearsă.`,
    });
  });

  (parentRelations || []).forEach(rel => {
    const nume = [rel.father?.full_name, rel.mother?.full_name].filter(Boolean).join(' & ') || 'părinți necunoscuți';
    rows.push({
      key: `parent-${rel.rel_id}`,
      icon: '👪',
      label: `Filiație cu ${nume}`,
      warn: null,
      action: () => axios.delete(`${API}/api/relations/${rel.rel_id}/children/${personId}`),
      okMsg: `Legătura de filiație cu ${nume} a fost ștearsă.`,
    });
  });

  (childrenList || []).forEach(c => {
    if (!c.rel_id) return;
    rows.push({
      key: `child-${c.rel_id}-${c.id}`,
      icon: '👶',
      label: `Filiație cu ${c.full_name}`,
      warn: null,
      action: () => axios.delete(`${API}/api/relations/${c.rel_id}/children/${c.id}`),
      okMsg: `Legătura de filiație cu ${c.full_name} a fost ștearsă.`,
    });
  });

  const visibleRows = rows.filter(r => !removed.has(r.key));

  if (visibleRows.length === 0) {
    return (
      <div className="pp-sub-form">
        <p className="pp-none">Nu mai există relații de șters.</p>
        {msg && <p className={msg.startsWith('Eroare') ? 'pp-error' : 'pp-success'}>{msg}</p>}
      </div>
    );
  }

  return (
    <div className="pp-sub-form">
      {visibleRows.map(row => (
        <div key={row.key} className="pp-remove-row">
          <span className="pp-remove-label">{row.icon} {row.label}</span>
          {confirmKey === row.key ? (
            <div className="pp-remove-confirm">
              {row.warn && <p className="pp-error">{row.warn}</p>}
              <div className="pp-row">
                <button
                  type="button"
                  className="pp-submit-btn pp-danger"
                  disabled={busyKey === row.key}
                  onClick={() => run(row.key, row.action, row.okMsg)}
                >
                  {busyKey === row.key ? 'Se șterge...' : 'Da, șterge'}
                </button>
                <button type="button" className="pp-submit-btn" onClick={() => setConfirmKey(null)}>
                  Anulează
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="pp-remove-btn" onClick={() => { setConfirmKey(row.key); setMsg(''); }}>
              ✕ Șterge
            </button>
          )}
        </div>
      ))}
      {msg && <p className={msg.startsWith('Eroare') ? 'pp-error' : 'pp-success'}>{msg}</p>}
    </div>
  );
}

function DeletePerson({ personId, personName, onDeleted }) {
  const [confirm, setConfirm] = useState(false);

  async function handleDelete() {
    try {
      await axios.delete(`${API}/api/persons/${personId}`);
      if (onDeleted) onDeleted();
    } catch (err) {
      alert('Eroare la ștergere: ' + (err.response?.data?.detail || err.message));
    }
  }

  if (confirm) {
    return (
      <div className="pp-delete-confirm">
        <p>Ești sigur/ă că vrei să ștergi pe <strong>{personName}</strong>?</p>
        <div className="pp-row">
          <button className="pp-submit-btn pp-danger" onClick={handleDelete}>Da, șterge</button>
          <button className="pp-submit-btn" onClick={() => setConfirm(false)}>Anulează</button>
        </div>
      </div>
    );
  }

  return (
    <button className="pp-delete-btn" onClick={() => setConfirm(true)}>
      🗑️ Șterge {personName}
    </button>
  );
}

function RequestDeletePerson({ personId, personName }) {
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  async function handleRequest() {
    const reason = window.prompt(`Motiv pentru stergerea lui ${personName}:`, '');
    if (reason === null) return;
    setSending(true);
    try {
      await axios.post(`${API}/api/change-requests/person-delete/${personId}`, { reason });
      setSent(true);
    } catch (err) {
      alert('Eroare la trimiterea cererii: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSending(false);
    }
  }

  return (
    <button className="pp-delete-btn" onClick={handleRequest} disabled={sending || sent}>
      {sent ? 'Cerere trimisa' : sending ? 'Se trimite...' : `Solicita stergerea ${personName}`}
    </button>
  );
}
