import {
  Flag,
  Grip,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  Mail,
  Megaphone,
  Package,
  PanelBottom,
  Percent,
  ShieldCheck,
  Star,
  Store,
} from 'lucide-react';

/**
 * Vertical section navigation for the visual Canvas editor.
 *
 * Presentational only: the active section id, per-section enabled flags and
 * the select handler all come from Canvas.jsx, so this adds no state and no
 * persistence of its own. Grouping mirrors CANVAS_SECTIONS in Canvas.jsx —
 * keep the two in sync when sections are added or removed.
 */

const SIDEBAR_GROUPS = [
  {
    title: 'Home',
    items: [
      { id: 'hero', label: 'Hero', icon: ImageIcon },
      { id: 'messages', label: 'Messages', icon: Megaphone },
      { id: 'sections', label: 'Sections', icon: Layers },
      { id: 'categories', label: 'Categories', icon: LayoutGrid },
      { id: 'featured', label: 'Featured Products', icon: Star },
      { id: 'bestSellers', label: 'Best Sellers', icon: Package },
      { id: 'promos', label: 'Banners', icon: Flag },
      { id: 'deals', label: 'Deals', icon: Percent },
      { id: 'trust', label: 'Trust', icon: ShieldCheck },
      { id: 'newsletter', label: 'Newsletter', icon: Mail },
      { id: 'wholesale', label: 'Wholesale', icon: Store },
      { id: 'footer', label: 'Footer', icon: PanelBottom },
    ],
  },
];

const FALLBACK_ICON = Grip;

export default function CanvasSidebar({ active, onSelect, enabledById = {} }) {
  return (
    <nav className="cv-side-nav" aria-label="Canvas sections">
      {SIDEBAR_GROUPS.map((group) => (
        <div key={group.title} className="cv-side-group">
          <p className="cv-side-group-title">{group.title}</p>
          <ul className="cv-side-list">
            {group.items.map((item) => {
              const Icon = item.icon || FALLBACK_ICON;
              const isActive = active === item.id;
              const enabled = enabledById[item.id];
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(item.id)}
                    aria-current={isActive ? 'true' : undefined}
                    className={`cv-side-item${isActive ? ' is-active' : ''}`}
                  >
                    <Icon aria-hidden="true" className="cv-side-item-icon" />
                    <span className="cv-side-item-label">{item.label}</span>
                    {enabled !== undefined && (
                      <span
                        className={`cv-side-dot${enabled ? ' is-on' : ''}`}
                        title={enabled ? 'Shown on homepage' : 'Hidden on homepage'}
                        aria-label={enabled ? `${item.label} shown` : `${item.label} hidden`}
                      >
                        <i aria-hidden="true" />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
