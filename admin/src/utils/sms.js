import { auth } from '../firebase';

/**
 * Ask the server to send an order SMS.
 *
 * Only the order id and the notification type travel over the wire — the
 * recipient number and every word of the message are read from Firestore
 * server-side. Passing the phone number and body from here previously turned
 * this endpoint into an open SMS relay on the shop's account.
 */
export const sendOrderSMS = async ({ orderId, notifyToken, type = 'placed' }) => {
  if (!orderId) return;

  try {
    const headers = { 'Content-Type': 'application/json' };

    // Staff notifying about a status change prove who they are with their ID
    // token. A guest who just placed an order proves it with the single-use
    // notify token the order endpoint handed back.
    const user = auth.currentUser;
    if (user) {
      headers.Authorization = `Bearer ${await user.getIdToken()}`;
    }

    await fetch('/api/orders/sms', {
      method: 'POST',
      headers,
      body: JSON.stringify({ orderId, notifyToken, type }),
    });
  } catch (error) {
    console.error('SMS send failed (non-blocking):', error);
  }
};
