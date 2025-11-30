import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import toast from 'react-hot-toast';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSales, setIsSales] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchUserRole = useCallback(async (currentUser) => {
    if (!currentUser) {
      setUserRole(null);
      setIsAdmin(false);
      setIsSales(false);
      return;
    }

    try {
      console.log('Fetching role for user:', currentUser.uid);
      const roleDoc = await getDoc(doc(db, 'roles', currentUser.uid));
      console.log('Role document exists:', roleDoc.exists());
      
      if (roleDoc.exists()) {
        const role = roleDoc.data().role;
        console.log('User role:', role);
        setUserRole(role);
        setIsAdmin(role === 'admin');
        setIsSales(role === 'sales');
      } else {
        console.log('No role document found, defaulting to customer');
        setUserRole('customer');
        setIsAdmin(false);
        setIsSales(false);
      }
    } catch (error) {
      console.error('Error fetching role:', error);
      setUserRole(null);
      setIsAdmin(false);
      setIsSales(false);
    }
  }, []);

  const refreshRole = useCallback(async () => {
    if (user) {
      await fetchUserRole(user);
    }
  }, [user, fetchUserRole]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
        await fetchUserRole(currentUser);
      } else {
        setUserRole(null);
        setIsAdmin(false);
        setIsSales(false);
      }
      
      setLoading(false);
    });

    return unsubscribe;
  }, [fetchUserRole]);

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      
      const userDocRef = doc(db, 'users', result.user.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (!userDoc.exists()) {
        await setDoc(userDocRef, {
          name: result.user.displayName || '',
          email: result.user.email || '',
          phone: result.user.phoneNumber || '',
          createdAt: new Date(),
        });
      }
      
      await fetchUserRole(result.user);
      
      toast.success('Logged in successfully!');
      return result;
    } catch (error) {
      toast.error(error.message);
      throw error;
    }
  };

  const loginWithEmail = async (email, password) => {
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      
      await fetchUserRole(result.user);
      
      toast.success('Logged in successfully!');
      return result;
    } catch (error) {
      toast.error(error.message);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      setUserRole(null);
      setIsAdmin(false);
      setIsSales(false);
      toast.success('Logged out successfully!');
    } catch (error) {
      toast.error(error.message);
      throw error;
    }
  };

  const value = {
    user,
    isAdmin,
    isSales,
    userRole,
    loading,
    loginWithGoogle,
    loginWithEmail,
    signOut,
    refreshRole,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
