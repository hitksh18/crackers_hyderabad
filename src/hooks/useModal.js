import { useState } from 'react';

export const useModal = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [modalConfig, setModalConfig] = useState({
    title: '',
    message: '',
    type: 'confirm',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    requiresInput: false,
    inputPlaceholder: '',
    expectedInput: '',
    onConfirm: () => {},
  });

  const openModal = (config) => {
    setModalConfig({
      title: config.title || 'Confirm',
      message: config.message || '',
      type: config.type || 'confirm',
      confirmText: config.confirmText || 'Confirm',
      cancelText: config.cancelText || 'Cancel',
      requiresInput: config.requiresInput || false,
      inputPlaceholder: config.inputPlaceholder || '',
      expectedInput: config.expectedInput || '',
      onConfirm: config.onConfirm || (() => {}),
    });
    setIsOpen(true);
  };

  const closeModal = () => {
    setIsOpen(false);
  };

  const handleConfirm = (inputValue) => {
    modalConfig.onConfirm(inputValue);
    closeModal();
  };

  return {
    isOpen,
    modalConfig,
    openModal,
    closeModal,
    handleConfirm,
  };
};
