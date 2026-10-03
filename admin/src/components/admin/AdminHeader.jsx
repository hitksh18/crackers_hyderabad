import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import AccountMenu from './AccountMenu';

/**
 * Shared Admin header: Back (browser history) | centered title | controls.
 * Sticky 68px bar that never scrolls; pages render their content below it.
 * `controls` receives page-specific actions (e.g. date range + refresh).
 */
export default function AdminHeader({ title, backFallback = '/dashboard', controls = null, showAvatar = true }) {
  const navigate = useNavigate();

  const goBack = () => {
    const idx = window.history.state && typeof window.history.state.idx === 'number'
      ? window.history.state.idx
      : 0;
    if (idx > 0) navigate(-1);
    else navigate(backFallback, { replace: true });
  };

  return (
    <header className="ax-header">
      <div className="ax-header-inner">
        <div className="ax-header-left">
          <button type="button" onClick={goBack} className="ax-back" aria-label="Go back">
            <ArrowLeft aria-hidden="true" />
            <span>Back</span>
          </button>
        </div>
        <h1 className="ax-header-title">{title}</h1>
        <div className="ax-header-right">
          {controls}
          {showAvatar && <AccountMenu />}
        </div>
      </div>
    </header>
  );
}
