import { useState } from 'react';

export const useModal = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [modalConfig, setModalConfig] = useState({
    title: '',
    message: '',
    type: 'confirm',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    requiresInput: false,
    inputPlaceholder: '',
    expectedInput: '',
    pendingText: '',
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
      pendingText: config.pendingText || '',
      onConfirm: config.onConfirm || (() => {}),
    });
    setIsConfirming(false);
    setIsOpen(true);
  };

  const closeModal = () => {
    setIsOpen(false);
    setIsConfirming(false);
  };

  /* Await the action before closing: close on success (resolve / truthy),
     keep the modal open on failure (throw / explicit `false`) so the user
     can retry. Duplicate confirms while the request is in flight are
     ignored. */
  const handleConfirm = async (inputValue) => {
    if (isConfirming) return false;
    setIsConfirming(true);
    let ok = true;
    try {
      const result = await modalConfig.onConfirm(inputValue);
      ok = result !== false;
    } catch (error) {
      console.error('Modal action failed:', error);
      ok = false;
    }
    setIsConfirming(false);
    if (ok) {
      setIsOpen(false);
    }
    return ok;
  };

  return {
    isOpen,
    isConfirming,
    modalConfig,
    openModal,
    closeModal,
    handleConfirm,
  };
};
