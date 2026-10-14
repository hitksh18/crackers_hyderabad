import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaExclamationTriangle, FaTimes, FaCheckCircle, FaInfoCircle } from 'react-icons/fa';

const CustomModal = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message, 
  type = 'confirm',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  requiresInput = false,
  inputPlaceholder = '',
  expectedInput = ''
}) => {
  const [inputValue, setInputValue] = useState('');

  const handleConfirm = () => {
    if (requiresInput) {
      if (inputValue === expectedInput) {
        onConfirm(inputValue);
        setInputValue('');
      }
    } else {
      onConfirm();
    }
  };

  const handleCancel = () => {
    setInputValue('');
    onClose();
  };

  const getIcon = () => {
    switch (type) {
      case 'warning':
        return <FaExclamationTriangle className="text-yellow-500 text-5xl" />;
      case 'danger':
        return <FaExclamationTriangle className="text-red-500 text-5xl" />;
      case 'success':
        return <FaCheckCircle className="text-green-500 text-5xl" />;
      case 'info':
        return <FaInfoCircle className="text-blue-500 text-5xl" />;
      default:
        return <FaExclamationTriangle className="text-orange-500 text-5xl" />;
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleCancel}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', duration: 0.5 }}
            className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-primary-600 to-accent-600 p-6 text-white relative">
              <button
                onClick={handleCancel}
                className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors"
              >
                <FaTimes className="text-xl" />
              </button>
              <h3 className="text-2xl font-bold pr-8">{title}</h3>
            </div>

            {/* Body */}
            <div className="p-6">
              <div className="flex flex-col items-center text-center space-y-4">
                {getIcon()}
                <p className="text-gray-700 text-lg whitespace-pre-line">{message}</p>

                {requiresInput && (
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder={inputPlaceholder}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-primary-500 focus:outline-none text-center font-medium"
                    autoFocus
                  />
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="bg-gray-50 px-6 py-4 flex gap-3 justify-end">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleCancel}
                className="px-6 py-2.5 rounded-lg font-semibold text-gray-700 bg-white border-2 border-gray-300 hover:bg-gray-50 transition-colors"
              >
                {cancelText}
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleConfirm}
                disabled={requiresInput && inputValue !== expectedInput}
                className={`px-6 py-2.5 rounded-lg font-semibold text-white transition-colors ${
                  type === 'danger'
                    ? 'bg-red-600 hover:bg-red-700'
                    : type === 'success'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-primary-600 hover:bg-primary-700'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {confirmText}
              </motion.button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default CustomModal;
