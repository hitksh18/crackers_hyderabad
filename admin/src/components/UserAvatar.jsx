import { useEffect, useState } from 'react';

const initialsOf = (user) => {
  const name = user?.displayName?.trim() || user?.email?.split('@')[0] || '';
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

/**
 * Avatar for the signed-in user. Renders the Google/profile photo when one is
 * available, and degrades to a generated initials circle when the photo is
 * missing or the URL is broken/expired — never a blank or broken-image glyph.
 *
 * The element fills whatever box the caller gives it (`className`), so it
 * works at navbar size, dropdown size and profile-page size alike.
 */
const UserAvatar = ({ user, className = '', style, initialsSize = 14 }) => {
  const [failed, setFailed] = useState(false);
  const photoURL = user?.photoURL;

  useEffect(() => {
    setFailed(false);
  }, [photoURL]);

  if (photoURL && !failed) {
    return (
      <img
        src={photoURL}
        alt=""
        onError={() => setFailed(true)}
        className={`shrink-0 rounded-full object-cover ${className}`}
        style={style}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full ${className}`}
      style={{ background: 'var(--grad-gold)', ...style }}
    >
      <span
        className="font-bold leading-none"
        style={{ color: 'var(--maroon-900)', fontFamily: 'var(--font-display)', fontSize: initialsSize }}
      >
        {initialsOf(user)}
      </span>
    </span>
  );
};

export default UserAvatar;