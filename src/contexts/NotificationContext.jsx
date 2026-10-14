import { createContext, useContext, useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot, where } from 'firebase/firestore';
import { db } from '../firebase';
import toast from 'react-hot-toast';
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
  const { user, role } = useAuth();
  const [lastSeenTimestamp, setLastSeenTimestamp] = useState(() => {
    const saved = localStorage.getItem('notificationsLastSeen');
    return saved ? new Date(saved).getTime() : Date.now();
  });

  useEffect(() => {
    if (!user || (role !== 'admin' && role !== 'sales')) return;

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
            toast.success(`New order received from ${orderData.customerName || 'Customer'}`, {
              duration: 5000,
              icon: '🔔',
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
  }, [user, role, lastSeenTimestamp]);

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
