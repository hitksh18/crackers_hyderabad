import toast from 'react-hot-toast';
import { Info } from 'lucide-react';
import { createElement } from 'react';

const show = (type, message, options = {}) => {
  if (!options.id) {
    toast.dismiss();
  }
  return toast[type](message, { ...options });
};

const toastApi = {
  success: (message, options) => show('success', message, options),
  error: (message, options) => show('error', message, options),
  loading: (message, options) => show('loading', message, options),
  custom: (message, options) => show('custom', message, options),
  /**
   * Neutral notice. Rendered through the base toast with an explicit Lucide
   * icon so it reads as informational without borrowing success green or
   * error red — and without an emoji.
   */
  info: (message, options = {}) =>
    show('custom', message, {
      icon: createElement(Info, {
        size: 18,
        strokeWidth: 2.2,
        'aria-hidden': 'true',
        style: { color: 'var(--gold-600)', flexShrink: 0 },
      }),
      ...options,
    }),
  dismiss: (id) => toast.dismiss(id),
  remove: (id) => toast.remove(id),
};

export default toastApi;
