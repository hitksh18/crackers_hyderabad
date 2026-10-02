import { createContext, createElement, useContext, useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import toast from '../utils/toast';
import { useAuth } from '../context/AuthContext';

const NotificationContext = createContext();

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
};

export const NotificationProvider = ({ children }) => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [recentOrders, setRecentOrders] = useState([]);
  const [liveOrderCount, setLiveOrderCount] = useState(0);
  const [serverStatus, setServerStatus] = useState('online');
  // AuthContext exposes `userRole`, not `role`. Destructuring `role` here left
  // it permanently undefined, so the guard below always returned early and the
  // order feed never ran for anyone — including admins.
  const { user, userRole } = useAuth();
  const [lastSeenTimestamp, setLastSeenTimestamp] = useState(() => {
    const saved = localStorage.getItem('notificationsLastSeen');
    return saved ? new Date(saved).getTime() : Date.now();
  });

  useEffect(() => {
    // Only staff may read the unfiltered order feed — Firestore rules enforce
    // the same boundary, so this must stay in step with them.
    if (!user || (userRole !== 'admin' && userRole !== 'sales')) return;

    const ordersRef = collection(db, 'orders');
    const ordersQuery = query(
      ordersRef,
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(ordersQuery, (snapshot) => {
      const orders = [];
      const now = Date.now();
      let newOrdersCount = 0;

      snapshot.forEach((doc) => {
        const orderData = { id: doc.id, ...doc.data() };
        orders.push(orderData);

        const orderDate = orderData.createdAt?.toDate();
        if (orderDate && orderDate.getTime() > lastSeenTimestamp) {
          newOrdersCount++;
          
          if (orderDate.getTime() > now - 5000) {
            // react-hot-toast renders `icon` as a node — a bare string would
            // print the literal word instead of a glyph.
            toast.success(`New order received from ${orderData.customerName || 'Customer'}`, {
              duration: 5000,
              icon: createElement(Bell, { size: 18, strokeWidth: 2.2, 'aria-hidden': 'true' }),
            });
          }
        }
      });

      setRecentOrders(orders);
      setLiveOrderCount(orders.length);
      setUnreadCount(newOrdersCount);
      setServerStatus('online');
    }, (error) => {
      console.error('Error listening to orders:', error);
      setServerStatus('offline');
    });

    return () => unsubscribe();
  }, [user, userRole, lastSeenTimestamp]);

  const markAllAsRead = () => {
    const now = Date.now();
    setLastSeenTimestamp(now);
    setUnreadCount(0);
    localStorage.setItem('notificationsLastSeen', new Date(now).toISOString());
  };

  const value = {
    unreadCount,
    recentOrders,
    liveOrderCount,
    serverStatus,
    markAllAsRead
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};
