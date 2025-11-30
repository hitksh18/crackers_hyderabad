import { Toaster } from 'react-hot-toast';

const CustomToast = () => {
  return (
    <Toaster
      position="bottom-right"
      reverseOrder={false}
      gutter={12}
      containerStyle={{
        bottom: '25px',
        right: '25px',
      }}
      toastOptions={{
        duration: 3000,
        style: {
          background: '#fff',
          color: '#333',
          padding: '14px 18px',
          borderRadius: '14px',
          boxShadow: '0 8px 20px rgba(0, 0, 0, 0.15)',
          fontSize: '15px',
          fontWeight: '600',
          maxWidth: '380px',
          animation: 'slideUp 0.25s ease-out',
        },
        success: {
          duration: 3000,
          iconTheme: {
            primary: '#FFFFFF',
            secondary: '#39D98A',
          },
          style: {
            background: 'linear-gradient(90deg, #39D98A, #1FBF66)',
            border: 'none',
            color: '#FFFFFF',
            fontWeight: 'bold',
            animation: 'slideUp 0.25s ease-out',
          },
        },
        error: {
          duration: 4000,
          iconTheme: {
            primary: '#FFFFFF',
            secondary: '#ef4444',
          },
          style: {
            background: 'linear-gradient(90deg, #ef4444, #dc2626)',
            border: 'none',
            color: '#FFFFFF',
            fontWeight: 'bold',
            animation: 'slideUp 0.25s ease-out',
          },
        },
        loading: {
          iconTheme: {
            primary: '#FFFFFF',
            secondary: '#f59e0b',
          },
          style: {
            background: 'linear-gradient(90deg, #f59e0b, #d97706)',
            border: 'none',
            color: '#FFFFFF',
            fontWeight: 'bold',
            animation: 'slideUp 0.25s ease-out',
          },
        },
      }}
    />
  );
};

export default CustomToast;
