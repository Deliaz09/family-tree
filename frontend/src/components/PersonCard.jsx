import { useState } from 'react';
import { API_BASE } from '../utils/apiBase';

function resolvePhotoUrl(photo_url, photo) {
  if (photo_url) {
    if (photo_url.startsWith('http') || photo_url.startsWith('data:')) {
      return photo_url;
    }
    return `${API_BASE}${photo_url}`;
  }
  if (photo) {
    return `${API_BASE}/photos/${photo}`;
  }
  return null;
}

export default function PersonCard({ person, selected, onClick, compact }) {
  const [imgError, setImgError] = useState(false);

  if (!person) return null;

  const {
    id, full_name, given_name, surname, gender,
    birth, death, photo, photo_url, generation,
  } = person;

  const isAlive = !death;
  const years = birth ? `${birth}${death ? ' – ' + death : ''}` : '';
  const photoSrc = resolvePhotoUrl(photo_url, photo);

  const initials = (full_name || 'NN')
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const genderClass = (gender || 'u').toLowerCase();

  if (compact) {
    return (
      <div
        className={`person-card-compact ${selected ? 'selected' : ''} gender-border-${genderClass}`}
        onClick={() => onClick && onClick(person)}
        title={full_name}
      >
        <div className="compact-avatar">
          {photoSrc && !imgError ? (
            <img
              src={photoSrc}
              alt={full_name}
              onError={() => setImgError(true)}
            />
          ) : (
            <span className={`avatar-initials gender-bg-${genderClass}`}>
              {initials}
            </span>
          )}
        </div>
        <span className="compact-name">{given_name || full_name}</span>
      </div>
    );
  }

  return (
    <div
      className={`person-card ${selected ? 'selected' : ''} gender-border-${genderClass}`}
      onClick={() => onClick && onClick(person)}
    >
      <div className="person-photo">
        {photoSrc && !imgError ? (
          <img
            src={photoSrc}
            alt={full_name}
            onError={() => setImgError(true)}
          />
        ) : (
          <div className={`person-avatar gender-bg-${genderClass}`}>
            {initials}
          </div>
        )}
        {!isAlive && <div className="deceased-ribbon" title="Decedat/ă">✝</div>}
      </div>
      <div className="person-info">
        <h3 className="person-name">{full_name || 'Necunoscut'}</h3>
        {years && <p className="person-years">{years}</p>}
        {generation !== undefined && generation !== null && (
          <span className="person-gen">Gen. {generation}</span>
        )}
      </div>
    </div>
  );
}
