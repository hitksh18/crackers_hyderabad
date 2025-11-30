import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { collection, getDocs, doc, updateDoc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Link } from 'react-router-dom';
import { 
  FaArrowLeft, FaSearch, FaUserShield, FaUserTie, FaUser, FaEdit, FaTimes, FaSave, 
  FaUsers, FaGoogle, FaEnvelope, FaKey, FaBan, FaTrash, FaCheck, FaExclamationTriangle,
  FaSync, FaClock, FaCalendar, FaCheckCircle, FaTimesCircle, FaCopy
} from 'react-icons/fa';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const roleOptions = ['admin', 'sales', 'customer'];

const roleConfig = {
  admin: {
    icon: FaUserShield,
    color: 'purple',
    bgColor: 'bg-purple-100',
    textColor: 'text-purple-800',
    borderColor: 'border-purple-500',
    activeBg: 'bg-purple-600',
    description: 'Full access to all features'
  },
  sales: {
    icon: FaUserTie,
    color: 'blue',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-800',
    borderColor: 'border-blue-500',
    activeBg: 'bg-blue-600',
    description: 'Access to Billing and Price List only'
  },
  customer: {
    icon: FaUser,
    color: 'green',
    bgColor: 'bg-green-100',
    textColor: 'text-green-800',
    borderColor: 'border-green-500',
    activeBg: 'bg-green-600',
    description: 'Standard customer access'
  }
};

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [authUsers, setAuthUsers] = useState([]);
  const [roles, setRoles] = useState({});
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [editingUser, setEditingUser] = useState(null);
  const [newRole, setNewRole] = useState('');
  const [actionModal, setActionModal] = useState(null);
  const [resetLink, setResetLink] = useState(null);
  const [apiError, setApiError] = useState(null);
  const { user: currentUser } = useAuth();

  useEffect(() => {
    fetchUsersAndRoles();
    fetchAuthUsers();
  }, []);

  const fetchAuthUsers = async () => {
    setAuthLoading(true);
    try {
      const response = await fetch('/api/admin/users');
      const data = await response.json();
      
      if (data.setupRequired) {
        setApiError('Firebase Admin SDK not configured. Please add the service account key.');
        setAuthUsers([]);
      } else if (data.error) {
        setApiError(data.error);
        setAuthUsers([]);
      } else {
        setAuthUsers(data.users || []);
        setApiError(null);
      }
    } catch (error) {
      console.error('Error fetching auth users:', error);
      setApiError('Cannot connect to admin API');
      setAuthUsers([]);
    } finally {
      setAuthLoading(false);
    }
  };

  const fetchUsersAndRoles = async () => {
    try {
      const rolesSnapshot = await getDocs(collection(db, 'roles'));
      const rolesData = {};
      rolesSnapshot.docs.forEach(doc => {
        rolesData[doc.id] = doc.data().role || 'customer';
      });
      setRoles(rolesData);
    } catch (error) {
      console.error('Error fetching roles:', error);
    } finally {
      setLoading(false);
    }
  };

  const mergedUsers = authUsers.map(authUser => {
    const role = roles[authUser.uid] || 'customer';
    return {
      ...authUser,
      id: authUser.uid,
      name: authUser.displayName,
      email: authUser.email,
      role: role
    };
  });

  const startEditingRole = (user) => {
    setEditingUser(user);
    setNewRole(roles[user.uid] || 'customer');
  };

  const cancelEditing = () => {
    setEditingUser(null);
    setNewRole('');
  };

  const saveRole = async () => {
    if (!editingUser || !newRole) return;

    if (editingUser.uid === currentUser?.uid && newRole !== 'admin') {
      toast.error('You cannot remove your own admin privileges');
      return;
    }

    const loadingToast = toast.loading('Updating role...');

    try {
      const roleRef = doc(db, 'roles', editingUser.uid);
      const roleDoc = await getDoc(roleRef);

      if (roleDoc.exists()) {
        await updateDoc(roleRef, { role: newRole });
      } else {
        await setDoc(roleRef, { role: newRole });
      }

      setRoles(prev => ({ ...prev, [editingUser.uid]: newRole }));
      toast.success(`Role updated to ${newRole} successfully!`, { id: loadingToast });
      cancelEditing();
    } catch (error) {
      console.error('Error updating role:', error);
      toast.error('Failed to update role', { id: loadingToast });
    }
  };

  const handleResetPassword = async (user) => {
    const loadingToast = toast.loading('Generating password reset link...');
    try {
      const response = await fetch(`/api/admin/users/${user.uid}/reset-password`, {
        method: 'POST'
      });
      const data = await response.json();
      
      if (data.success) {
        setResetLink(data.resetLink);
        setActionModal({ type: 'resetSuccess', user, link: data.resetLink });
        toast.success('Password reset link generated!', { id: loadingToast });
      } else {
        toast.error(data.error || 'Failed to generate reset link', { id: loadingToast });
      }
    } catch (error) {
      toast.error('Failed to generate reset link', { id: loadingToast });
    }
  };

  const handleDisableUser = async (user, disable) => {
    const loadingToast = toast.loading(disable ? 'Disabling account...' : 'Enabling account...');
    try {
      const response = await fetch(`/api/admin/users/${user.uid}/disable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disabled: disable })
      });
      const data = await response.json();
      
      if (data.success) {
        setAuthUsers(prev => prev.map(u => 
          u.uid === user.uid ? { ...u, disabled: disable } : u
        ));
        toast.success(disable ? 'Account disabled' : 'Account enabled', { id: loadingToast });
        setActionModal(null);
      } else {
        toast.error(data.error || 'Failed to update account', { id: loadingToast });
      }
    } catch (error) {
      toast.error('Failed to update account', { id: loadingToast });
    }
  };

  const handleDeleteUser = async (user) => {
    const loadingToast = toast.loading('Deleting user...');
    try {
      const response = await fetch(`/api/admin/users/${user.uid}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      
      if (data.success) {
        setAuthUsers(prev => prev.filter(u => u.uid !== user.uid));
        toast.success('User deleted successfully', { id: loadingToast });
        setActionModal(null);
      } else {
        toast.error(data.error || 'Failed to delete user', { id: loadingToast });
      }
    } catch (error) {
      toast.error('Failed to delete user', { id: loadingToast });
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard!');
  };

  const usersByRole = {
    admin: mergedUsers.filter(u => u.role === 'admin'),
    sales: mergedUsers.filter(u => u.role === 'sales'),
    customer: mergedUsers.filter(u => u.role === 'customer')
  };

  const getDisplayedUsers = () => {
    let filtered = activeTab === 'all' ? mergedUsers : usersByRole[activeTab] || [];
    
    if (searchQuery.trim()) {
      filtered = filtered.filter(user => 
        (user.displayName?.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (user.email?.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (user.uid?.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }
    
    return filtered;
  };

  const displayedUsers = getDisplayedUsers();
  const isLoading = loading || authLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading users from Firebase Authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 md:px-8">
      <div className="max-w-7xl mx-auto">
        <Link to="/admin/dashboard" className="inline-flex items-center text-purple-600 hover:text-purple-800 mb-6">
          <FaArrowLeft className="mr-2" />
          Back to Dashboard
        </Link>

        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-4"
        >
          <div>
            <h1 className="text-4xl font-bold text-purple-900 mb-2">User Management</h1>
            <p className="text-gray-600">
              {apiError ? (
                <span className="text-orange-600">{apiError}</span>
              ) : (
                `${mergedUsers.length} users from Firebase Authentication`
              )}
            </p>
          </div>
          <button
            onClick={() => { fetchAuthUsers(); fetchUsersAndRoles(); }}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
          >
            <FaSync />
            Refresh
          </button>
        </motion.div>

        {apiError && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-orange-50 border border-orange-200 rounded-xl p-6 mb-6"
          >
            <div className="flex items-start gap-4">
              <FaExclamationTriangle className="text-orange-500 text-2xl flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-bold text-orange-800 mb-2">Firebase Admin SDK Setup Required</h3>
                <p className="text-orange-700 mb-4">
                  To access all Firebase Authentication users, you need to add your Firebase service account key.
                </p>
                <div className="bg-white rounded-lg p-4 border border-orange-200">
                  <p className="font-semibold text-gray-800 mb-2">How to get your service account key:</p>
                  <ol className="list-decimal list-inside text-gray-700 space-y-1 text-sm">
                    <li>Go to Firebase Console &gt; Project Settings &gt; Service Accounts</li>
                    <li>Click "Generate new private key"</li>
                    <li>Download the JSON file</li>
                    <li>Copy the entire JSON content</li>
                    <li>Add it as a secret named <code className="bg-gray-100 px-2 py-0.5 rounded">FIREBASE_SERVICE_ACCOUNT_KEY</code></li>
                  </ol>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Tab Navigation */}
        <div className="bg-white rounded-xl shadow-md p-2 mb-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <button
              onClick={() => setActiveTab('all')}
              className={`flex items-center justify-center gap-3 px-4 py-4 rounded-lg font-semibold transition-all ${
                activeTab === 'all'
                  ? 'bg-gray-800 text-white shadow-lg'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <FaUsers className="text-xl" />
              <div className="text-left">
                <span className="block text-sm md:text-base">All Users</span>
                <span className={`text-xs ${activeTab === 'all' ? 'text-gray-300' : 'text-gray-500'}`}>
                  {mergedUsers.length} total
                </span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('admin')}
              className={`flex items-center justify-center gap-3 px-4 py-4 rounded-lg font-semibold transition-all ${
                activeTab === 'admin'
                  ? 'bg-purple-600 text-white shadow-lg'
                  : 'bg-purple-50 text-purple-800 hover:bg-purple-100'
              }`}
            >
              <FaUserShield className="text-xl" />
              <div className="text-left">
                <span className="block text-sm md:text-base">Admins</span>
                <span className={`text-xs ${activeTab === 'admin' ? 'text-purple-200' : 'text-purple-600'}`}>
                  {usersByRole.admin.length} users
                </span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('sales')}
              className={`flex items-center justify-center gap-3 px-4 py-4 rounded-lg font-semibold transition-all ${
                activeTab === 'sales'
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'bg-blue-50 text-blue-800 hover:bg-blue-100'
              }`}
            >
              <FaUserTie className="text-xl" />
              <div className="text-left">
                <span className="block text-sm md:text-base">Sales</span>
                <span className={`text-xs ${activeTab === 'sales' ? 'text-blue-200' : 'text-blue-600'}`}>
                  {usersByRole.sales.length} users
                </span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('customer')}
              className={`flex items-center justify-center gap-3 px-4 py-4 rounded-lg font-semibold transition-all ${
                activeTab === 'customer'
                  ? 'bg-green-600 text-white shadow-lg'
                  : 'bg-green-50 text-green-800 hover:bg-green-100'
              }`}
            >
              <FaUser className="text-xl" />
              <div className="text-left">
                <span className="block text-sm md:text-base">Customers</span>
                <span className={`text-xs ${activeTab === 'customer' ? 'text-green-200' : 'text-green-600'}`}>
                  {usersByRole.customer.length} users
                </span>
              </div>
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="bg-white rounded-xl shadow-md p-4 mb-6">
          <div className="relative">
            <FaSearch className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, email, or UID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-lg focus:border-purple-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Section Title */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-800">
            {activeTab === 'all' ? 'All Users' : `${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}s`}
            <span className="text-gray-500 font-normal ml-2">({displayedUsers.length})</span>
          </h2>
        </div>

        {/* Users List */}
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {displayedUsers.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-white rounded-xl shadow-md p-12 text-center"
              >
                <div className="text-gray-400 text-6xl mb-4 flex justify-center">
                  {activeTab === 'admin' ? <FaUserShield /> : 
                   activeTab === 'sales' ? <FaUserTie /> : 
                   activeTab === 'customer' ? <FaUser /> : <FaUsers />}
                </div>
                <p className="text-gray-500 text-lg">
                  {searchQuery 
                    ? 'No users found matching your search' 
                    : apiError 
                      ? 'Configure Firebase Admin SDK to see users'
                      : `No ${activeTab === 'all' ? 'users' : activeTab + 's'} found`}
                </p>
              </motion.div>
            ) : (
              displayedUsers.map((user, index) => (
                <UserCard
                  key={user.uid}
                  user={user}
                  role={user.role}
                  onEditRole={() => startEditingRole(user)}
                  onResetPassword={() => handleResetPassword(user)}
                  onDisable={() => setActionModal({ type: 'disable', user })}
                  onEnable={() => handleDisableUser(user, false)}
                  onDelete={() => setActionModal({ type: 'delete', user })}
                  isCurrentUser={user.uid === currentUser?.uid}
                  index={index}
                />
              ))
            )}
          </AnimatePresence>
        </div>

        {/* Edit Role Modal */}
        <AnimatePresence>
          {editingUser && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
              onClick={cancelEditing}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="bg-gradient-to-r from-purple-600 to-purple-800 text-white p-6">
                  <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold">Change User Role</h2>
                    <button onClick={cancelEditing} className="p-2 hover:bg-white/20 rounded-lg transition">
                      <FaTimes />
                    </button>
                  </div>
                </div>

                <div className="p-6">
                  <div className="mb-6">
                    <p className="text-gray-600 mb-1">User</p>
                    <p className="font-semibold text-lg">{editingUser.displayName || 'No name'}</p>
                    <p className="text-gray-500 text-sm">{editingUser.email}</p>
                  </div>

                  <div className="mb-6">
                    <label className="block text-gray-600 mb-2">Select Role</label>
                    <div className="space-y-3">
                      {roleOptions.map(role => {
                        const config = roleConfig[role];
                        const RoleIcon = config.icon;
                        return (
                          <label
                            key={role}
                            className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                              newRole === role
                                ? `${config.borderColor} ${config.bgColor}`
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <input
                              type="radio"
                              name="role"
                              value={role}
                              checked={newRole === role}
                              onChange={(e) => setNewRole(e.target.value)}
                              className="sr-only"
                            />
                            <RoleIcon className={`text-xl ${config.textColor}`} />
                            <div className="flex-1">
                              <p className="font-semibold capitalize">{role}</p>
                              <p className="text-sm text-gray-500">{config.description}</p>
                            </div>
                            {newRole === role && (
                              <div className={`w-5 h-5 rounded-full ${config.activeBg} flex items-center justify-center`}>
                                <div className="w-2 h-2 rounded-full bg-white" />
                              </div>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={cancelEditing}
                      className="flex-1 px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveRole}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition"
                    >
                      <FaSave />
                      Save Role
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action Confirmation Modal */}
        <AnimatePresence>
          {actionModal && actionModal.type !== 'resetSuccess' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
              onClick={() => setActionModal(null)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className={`p-6 ${actionModal.type === 'delete' ? 'bg-red-600' : 'bg-orange-500'} text-white`}>
                  <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold">
                      {actionModal.type === 'delete' ? 'Delete User' : 'Disable Account'}
                    </h2>
                    <button onClick={() => setActionModal(null)} className="p-2 hover:bg-white/20 rounded-lg transition">
                      <FaTimes />
                    </button>
                  </div>
                </div>

                <div className="p-6">
                  <div className="flex items-center gap-4 mb-6">
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center ${actionModal.type === 'delete' ? 'bg-red-100' : 'bg-orange-100'}`}>
                      {actionModal.type === 'delete' ? (
                        <FaTrash className="text-3xl text-red-600" />
                      ) : (
                        <FaBan className="text-3xl text-orange-600" />
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-lg">{actionModal.user.displayName || 'No name'}</p>
                      <p className="text-gray-500">{actionModal.user.email}</p>
                    </div>
                  </div>

                  <p className="text-gray-700 mb-6">
                    {actionModal.type === 'delete' 
                      ? 'Are you sure you want to permanently delete this user? This action cannot be undone.'
                      : 'Are you sure you want to disable this account? The user will not be able to sign in.'}
                  </p>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setActionModal(null)}
                      className="flex-1 px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => actionModal.type === 'delete' 
                        ? handleDeleteUser(actionModal.user)
                        : handleDisableUser(actionModal.user, true)
                      }
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-white rounded-lg font-semibold transition ${
                        actionModal.type === 'delete' 
                          ? 'bg-red-600 hover:bg-red-700' 
                          : 'bg-orange-500 hover:bg-orange-600'
                      }`}
                    >
                      {actionModal.type === 'delete' ? <FaTrash /> : <FaBan />}
                      {actionModal.type === 'delete' ? 'Delete User' : 'Disable Account'}
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Reset Password Success Modal */}
        <AnimatePresence>
          {actionModal && actionModal.type === 'resetSuccess' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
              onClick={() => setActionModal(null)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="bg-green-600 text-white p-6">
                  <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold">Password Reset Link Generated</h2>
                    <button onClick={() => setActionModal(null)} className="p-2 hover:bg-white/20 rounded-lg transition">
                      <FaTimes />
                    </button>
                  </div>
                </div>

                <div className="p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                      <FaCheckCircle className="text-2xl text-green-600" />
                    </div>
                    <div>
                      <p className="font-semibold">{actionModal.user.displayName || 'User'}</p>
                      <p className="text-gray-500 text-sm">{actionModal.user.email}</p>
                    </div>
                  </div>

                  <p className="text-gray-700 mb-4">
                    Share this link with the user to reset their password:
                  </p>

                  <div className="bg-gray-100 rounded-lg p-3 mb-4 flex items-center gap-2">
                    <input
                      type="text"
                      value={actionModal.link}
                      readOnly
                      className="flex-1 bg-transparent text-sm text-gray-700 outline-none"
                    />
                    <button
                      onClick={() => copyToClipboard(actionModal.link)}
                      className="p-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
                    >
                      <FaCopy />
                    </button>
                  </div>

                  <button
                    onClick={() => setActionModal(null)}
                    className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg font-semibold hover:bg-gray-900 transition"
                  >
                    Done
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

const UserCard = ({ user, role, onEditRole, onResetPassword, onDisable, onEnable, onDelete, isCurrentUser, index }) => {
  const config = roleConfig[role] || roleConfig.customer;
  const RoleIcon = config.icon;

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getProviderIcon = (providers) => {
    if (!providers || providers.length === 0) return <FaEnvelope className="text-gray-500" />;
    if (providers.includes('google.com')) return <FaGoogle className="text-red-500" />;
    if (providers.includes('password')) return <FaEnvelope className="text-blue-500" />;
    return <FaUser className="text-gray-500" />;
  };

  const getProviderName = (providers) => {
    if (!providers || providers.length === 0) return 'Unknown';
    if (providers.includes('google.com')) return 'Google';
    if (providers.includes('password')) return 'Email/Password';
    return providers[0];
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ delay: index * 0.02 }}
      className={`bg-white rounded-xl shadow-md overflow-hidden border-l-4 ${config.borderColor} ${user.disabled ? 'opacity-60' : ''}`}
    >
      <div className="p-4 md:p-5">
        {/* Header Row */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-4">
            {user.photoURL ? (
              <img src={user.photoURL} alt="" className="w-12 h-12 rounded-full object-cover" />
            ) : (
              <div className={`w-12 h-12 rounded-full ${config.bgColor} flex items-center justify-center flex-shrink-0`}>
                <RoleIcon className={`text-xl ${config.textColor}`} />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-gray-800">{user.displayName || 'No name'}</p>
                {isCurrentUser && (
                  <span className="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full">You</span>
                )}
                {user.disabled && (
                  <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Disabled</span>
                )}
              </div>
              <p className="text-sm text-gray-600">{user.email || 'No email'}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-gray-400 font-mono">{user.uid}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${config.bgColor} ${config.textColor}`}>
              {role.charAt(0).toUpperCase() + role.slice(1)}
            </span>
            <div className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 rounded-full">
              {getProviderIcon(user.providers)}
              <span className="text-xs text-gray-600 ml-1">{getProviderName(user.providers)}</span>
            </div>
            {user.emailVerified ? (
              <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
                <FaCheckCircle /> Verified
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded-full">
                <FaTimesCircle /> Not Verified
              </span>
            )}
          </div>
        </div>

        {/* Info Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4 text-sm">
          <div className="flex items-center gap-2 text-gray-500">
            <FaCalendar className="text-gray-400" />
            <span>Created: {formatDate(user.creationTime)}</span>
          </div>
          <div className="flex items-center gap-2 text-gray-500">
            <FaClock className="text-gray-400" />
            <span>Last Sign-in: {formatDate(user.lastSignInTime)}</span>
          </div>
        </div>

        {/* Actions Row */}
        <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-100">
          <button
            onClick={onEditRole}
            className="flex items-center gap-2 px-3 py-2 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg text-sm font-medium transition"
          >
            <FaEdit />
            Change Role
          </button>
          
          {user.providers?.includes('password') && (
            <button
              onClick={onResetPassword}
              className="flex items-center gap-2 px-3 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg text-sm font-medium transition"
            >
              <FaKey />
              Reset Password
            </button>
          )}

          {!isCurrentUser && (
            <>
              {user.disabled ? (
                <button
                  onClick={onEnable}
                  className="flex items-center gap-2 px-3 py-2 bg-green-100 hover:bg-green-200 text-green-700 rounded-lg text-sm font-medium transition"
                >
                  <FaCheck />
                  Enable
                </button>
              ) : (
                <button
                  onClick={onDisable}
                  className="flex items-center gap-2 px-3 py-2 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded-lg text-sm font-medium transition"
                >
                  <FaBan />
                  Disable
                </button>
              )}

              <button
                onClick={onDelete}
                className="flex items-center gap-2 px-3 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm font-medium transition"
              >
                <FaTrash />
                Delete
              </button>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default UserManagement;
