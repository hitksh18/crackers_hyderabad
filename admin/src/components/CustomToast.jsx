import { Toaster } from 'react-hot-toast';

/**
 * Toast surface.
 *
 * Colours come from the token layer so notifications read correctly in both
 * themes; success and error keep their own solid fills because those two carry
 * meaning and must stay unambiguous against any background.
 */
const CustomToast = () => (
  <Toaster
    position="top-center"
    reverseOrder={false}
    gutter={8}
    containerStyle={{ top: 'calc(var(--nav-h, 70px) + 10px)', zIndex: 60 }}
    toastOptions={{
      duration: 2000,
      className: 'react-hot-toast',
      style: {
        background: 'var(--surface-card)',
        color: 'var(--text-strong)',
        padding: '8px 14px',
        borderRadius: '9999px',
        border: '1px solid var(--hairline)',
        boxShadow: 'var(--shadow-lg)',
        fontFamily: 'var(--font-body)',
        fontSize: '13px',
        fontWeight: 600,
        maxWidth: '320px',
      },
      success: {
        duration: 2000,
        iconTheme: { primary: '#FFFFFF', secondary: '#2C7A53' },
        style: {
          background: 'linear-gradient(90deg, #2C7A53, #245F42)',
          border: 'none',
          color: '#FFFFFF',
          fontWeight: 600,
        },
      },
      error: {
        duration: 2000,
        iconTheme: { primary: '#FFFFFF', secondary: '#AA1F1F' },
        style: {
          background: 'linear-gradient(90deg, #CB2A2A, #AA1F1F)',
          border: 'none',
          color: '#FFFFFF',
          fontWeight: 600,
          maxWidth: '380px',
        },
      },
      loading: {
        iconTheme: { primary: '#FFFFFF', secondary: '#9E7029' },
        style: {
          background: 'linear-gradient(90deg, #BE8C36, #9E7029)',
          border: 'none',
          color: '#FFFFFF',
          fontWeight: 600,
        },
      },
    }}
  />
);

export default CustomToast;
