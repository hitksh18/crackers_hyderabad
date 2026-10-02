import { useState, useEffect } from 'react';
import '../admin-portrait.css';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Link } from 'react-router-dom';
import { ArrowLeft, Search, Users, RefreshCw, Mail, User, Check, Ban, Trash2, Key, Pencil, Clock, Calendar, CircleCheck, CircleX } from 'lucide-react';
import toast from '../utils/toast';
import { authFetch, readApiError } from '../utils/apiClient';
import { useAuth } from '../context/AuthContext';
import { roleOptions, roleConfig, configFor, normalizeRole } from '../components/admin/userRoles';
import AccountMenu from '../components/admin/AccountMenu';
import {
  RoleEditorModal,
  ConfirmActionModal,
  ResetLinkModal,
} from '../components/admin/UserAdminModals';

const formatDate = (dateString) => {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const getProviderName = (providers) => {
  if (!providers || providers.length === 0) return '—';
  if (providers.includes('google.com')) return 'Google';
  if (providers.includes('password')) return 'Email';
  return providers[0].replace('.com','');
};

const UserManagement = () => {
  const [authUsers, setAuthUsers] = useState([]);
  const [storeUsers, setStoreUsers] = useState([]);
  const [roles, setRoles] = useState({});
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [editingUser, setEditingUser] = useState(null);
  const [newRole, setNewRole] = useState('');
  const [actionModal, setActionModal] = useState(null);
  const [savingRole, setSavingRole] = useState(false);
  const { user: currentUser } = useAuth();

  useEffect(() => {
    fetchUsersAndRoles();
    fetchAuthUsers();
  }, []);

  const fetchAuthUsers = async () => {
    setAuthLoading(true);
    try {
      const response = await authFetch('/api/admin/users');
      if (!response.ok) {
        toast.error(await readApiError(response, 'Failed to load users'));
        setAuthUsers([]);
        return;
      }
      const data = await response.json();
      if (data.setupRequired || data.error) {
        setAuthUsers([]);
      } else {
        setAuthUsers(data.users || []);
      }
    } catch (error) {
      console.error('Error fetching auth users:', error);
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
        rolesData[doc.id] = normalizeRole(doc.data().role);
      });
      setRoles(rolesData);

      const usersSnapshot = await getDocs(collection(db, 'users'));
      const usersData = usersSnapshot.docs.map(doc => ({
        uid: doc.id,
        displayName: doc.data().name || 'No name',
        email: doc.data().email || '',
        photoURL: '',
        creationTime: doc.data().createdAt?.toDate?.()?.toISOString() || '',
        providers: [],
        fromStore: true
      }));
      setStoreUsers(usersData);
    } catch (error) {
      console.error('Error fetching roles:', error);
    } finally {
      setLoading(false);
    }
  };

  const mergedUsers = [];
  const seenUids = new Set();

  authUsers.forEach(authUser => {
    const role = normalizeRole(roles[authUser.uid]);
    mergedUsers.push({
      ...authUser,
      id: authUser.uid,
      name: authUser.displayName,
      email: authUser.email,
      role: role
    });
    seenUids.add(authUser.uid);
  });

  storeUsers.forEach(storeUser => {
    if (seenUids.has(storeUser.uid)) return;
    const role = normalizeRole(roles[storeUser.uid]);
    mergedUsers.push({
      ...storeUser,
      id: storeUser.uid,
      role: role
    });
    seenUids.add(storeUser.uid);
  });

  const cancelEditing = () => {
    setEditingUser(null);
    setNewRole('');
  };

  const saveRole = async () => {
    if (!editingUser || !newRole || savingRole) return;

    if (editingUser.uid === currentUser?.uid && newRole !== 'admin') {
      toast.error('You cannot remove your own admin privileges');
      return;
    }

    const loadingToast = toast.loading('Updating role...');
    setSavingRole(true);

    try {
      // Role changes go through the API (verified admin token + server-side
      // allow-list) — never a direct Firestore write from the browser.
      const response = await authFetch(`/api/admin/users/${editingUser.uid}/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });

      if (!response.ok) {
        // Keep the modal open so the failure is visible and retryable.
        toast.error(await readApiError(response, 'Failed to update role'), { id: loadingToast });
        return;
      }

      const data = await response.json();

      if (!data.success) {
        toast.error(data.error || 'Failed to update role', { id: loadingToast });
        return;
      }

      setRoles(prev => ({ ...prev, [editingUser.uid]: data.role }));
      toast.success(`Role updated to ${roleConfig[data.role]?.label || data.role} successfully!`, { id: loadingToast });
      cancelEditing();
    } catch (error) {
      console.error('Error updating role:', error.code, error.message);
      toast.error('Failed to update role', { id: loadingToast });
    } finally {
      setSavingRole(false);
    }
  };

  const handleResetPassword = async (user) => {
    const loadingToast = toast.loading('Sending password reset email...');
    try {
      const response = await authFetch(`/api/admin/users/${user.uid}/reset-password`, {
        method: 'POST'
      });

      if (!response.ok) {
        toast.error(await readApiError(response, 'Failed to send reset email'), { id: loadingToast });
        return;
      }

      const data = await response.json();

      if (data.success) {
        setActionModal({ type: 'resetSuccess', user, email: data.email });
        toast.success('Password reset email sent', { id: loadingToast });
      } else {
        toast.error(data.error || 'Failed to send reset email', { id: loadingToast });
      }
    } catch (error) {
      toast.error(error.message || 'Failed to send reset email', { id: loadingToast });
    }
  };

  const handleDisableUser = async (user, disable) => {
    const loadingToast = toast.loading(disable ? 'Disabling account...' : 'Enabling account...');
    try {
      const response = await authFetch(`/api/admin/users/${user.uid}/disable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disabled: disable })
      });

      if (!response.ok) {
        toast.error(await readApiError(response, 'Failed to update account'), { id: loadingToast });
        return;
      }

      const data = await response.json();

      if (data.success) {
        // Update the row in place — no refetch, no stale window.
        setAuthUsers(prev => prev.map(u =>
          u.uid === user.uid ? { ...u, disabled: disable } : u
        ));
        toast.success(disable ? 'Account disabled' : 'Account enabled', { id: loadingToast });
        setActionModal(null);
      } else {
        toast.error(data.error || 'Failed to update account', { id: loadingToast });
      }
    } catch (e) {
      console.error('Disable error:', e.code, e.message);
      toast.error('Failed to update account', { id: loadingToast });
    }
  };

  const handleDeleteUser = async (user) => {
    const loadingToast = toast.loading('Deleting user...');
    try {
      const response = await authFetch(`/api/admin/users/${user.uid}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const msg = await readApiError(response, 'Failed to delete user');
        console.warn('Delete failed:', response.status, msg);
        toast.error(msg, { id: loadingToast });
        return;
      }

      const data = await response.json();

      if (data.success) {
        // Backend removed the auth user plus its roles/users documents; drop
        // every local copy so the row and the role counts disappear at once.
        setAuthUsers(prev => prev.filter(u => u.uid !== user.uid));
        setStoreUsers(prev => prev.filter(u => u.uid !== user.uid));
        setRoles(prev => {
          const next = { ...prev };
          delete next[user.uid];
          return next;
        });
        toast.success('User deleted successfully', { id: loadingToast });
        setActionModal(null);
      } else {
        toast.error(data.error || 'Failed to delete user', { id: loadingToast });
      }
    } catch (e) {
      console.error('Delete error:', e.code, e.message);
      toast.error('Failed to delete user', { id: loadingToast });
    }
  };

  const usersByRole = Object.fromEntries(
    roleOptions.map(role => [role, mergedUsers.filter(u => u.role === role)])
  );

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
      <div className="min-h-screen bg-[var(--surface-page)]">
        <div className="mx-auto w-full max-w-[1600px] px-4 py-6 lg:px-8">
          <div className="h-10 w-64 animate-pulse rounded-full" style={{ background: 'var(--surface-sunken)' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--surface-page)] text-[var(--text-body)] transition-colors duration-200 overflow-x-hidden">
      {/* Dedicated Navbar */}
      <header className="sticky top-0 z-30 flex h-[60px] w-full shrink-0 items-center border-b bg-[var(--surface-card)] px-4 lg:px-8" style={{ borderColor: 'var(--hairline)' }}>
        <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-4">
          <Link to="/dashboard" className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--ember-600)' }}>
            <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Back to Dashboard</span><span className="sm:hidden">Back</span>
          </Link>
          <h1 className="pointer-events-none absolute left-1/2 hidden -translate-x-1/2 text-sm font-bold tracking-tight sm:block" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}>User Management</h1>
          <span className="absolute left-1/2 -translate-x-1/2 text-sm font-bold sm:hidden" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}>Users</span>
          <button type="button" onClick={() => { fetchAuthUsers(); fetchUsersAndRoles(); }} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)', color: 'var(--text-body)' }}>
            <RefreshCw className="h-4 w-4" /> <span className="hidden sm:inline">Refresh</span>
          </button>
          <AccountMenu />
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1600px] px-4 py-3 lg:px-8">
        {/* Role filters - compact pills */}
        <div className="flex flex-wrap gap-1.5">
          {[
            { key: 'all', label: 'All Users', count: mergedUsers.length },
            ...roleOptions.map(r => ({ key: r, label: roleConfig[r]?.label || r, count: (usersByRole[r]||[]).length }))
          ].map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                aria-pressed={isActive}
                onClick={() => setActiveTab(tab.key)}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors duration-200"
                style={isActive ? { background: 'var(--text-strong)', color: 'var(--surface-card)', borderColor: 'var(--text-strong)' } : { background: 'var(--surface-card)', color: 'var(--text-muted)', borderColor: 'var(--hairline)' }}
              >
                {tab.label} <span className="tabular text-[11px] opacity-70">{tab.count}</span>
              </button>
            );
          })}
        </div>

        {/* Search + count */}
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-[380px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-subtle)' }} />
            <input
              type="text"
              placeholder="Search by name, email, or UID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-full rounded-full border bg-[var(--surface-card)] pl-10 pr-4 text-sm placeholder:text-[var(--text-subtle)] focus:outline-none transition-colors duration-200"
              style={{ borderColor: 'var(--hairline)', color: 'var(--text-strong)' }}
            />
          </div>
          <span className="tabular text-xs" style={{ color: 'var(--text-muted)' }}>{displayedUsers.length} users</span>
        </div>

        {/* User list */}
        <div className="users-table-card mt-3 overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
          {/* Header - desktop (column proportions in .users-grid, see admin-portrait.css) */}
          <div className="users-grid hidden items-center gap-2 px-3 py-2.5 text-[11px] font-bold uppercase tracking-widest lg:grid" style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)', borderBottom: '1px solid var(--hairline)' }}>
            <div>User</div>
            <div>Role</div>
            <div>Auth</div>
            <div>Status</div>
            <div>Created</div>
            <div>Last Sign-in</div>
            <div className="text-right">Actions</div>
          </div>

          {/* Rows */}
          <div className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
            {displayedUsers.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <Users className="mx-auto h-8 w-8" style={{ color: 'var(--text-subtle)' }} />
                <p className="mt-2 text-sm font-semibold" style={{ color: 'var(--text-body)' }}>{searchQuery ? 'No users found' : 'No users'}</p>
              </div>
            ) : (
              displayedUsers.map((user) => {
                const cfg = configFor(user.role);
                const RoleIcon = cfg.icon;
                const isCurrent = user.uid === currentUser?.uid;
                return (
                  <div
                    key={user.uid}
                    className="grid items-center gap-2 px-3 py-2.5 transition-colors duration-200 hover:bg-[var(--surface-sunken)]/60 lg:gap-2"
                    style={{ gridTemplateColumns: `repeat(1, minmax(0, 1fr))`, minHeight: '78px' }}
                  >
                    {/* Mobile card */}
                    <div className="lg:hidden">
                      <div className="flex items-start gap-3">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--hairline)' }}>
                          {user.photoURL ? <img src={user.photoURL} alt="" className="h-9 w-9 rounded-full object-cover" /> : <RoleIcon className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>{user.displayName || 'No name'} {isCurrent && <span className="ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={{ background: 'var(--ember-600)', color: '#fff' }}>You</span>}</p>
                          <p className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>{user.email || '—'}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold" style={{ background: 'var(--surface-card)', borderColor: 'var(--hairline)', color: 'var(--text-body)' }}><RoleIcon className="h-3 w-3" />{cfg.label}</span>
                            <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]" style={{ background: 'var(--surface-sunken)', borderColor: 'var(--hairline)', color: 'var(--text-muted)' }}>{getProviderName(user.providers)}</span>
                            {user.emailVerified ? <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: 'rgba(44,122,83,0.12)', color: 'var(--leaf-600)' }}><CircleCheck className="h-3 w-3" />Verified</span> : <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: 'rgba(210,166,79,0.15)', color: 'var(--gold-600)' }}><CircleX className="h-3 w-3" />Not Verified</span>}
                          </div>
                          <p className="mt-1 flex items-center gap-1 text-xs" style={{ color: 'var(--text-subtle)' }}><Calendar className="h-3 w-3" />{formatDate(user.creationTime)} <Clock className="ml-2 h-3 w-3" />{user.lastSignInTime ? formatDate(user.lastSignInTime) : 'Never'}</p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <button type="button" onClick={() => { const u = displayedUsers.find(x=>x.uid===user.uid); if(u) { setEditingUser(u); setNewRole(normalizeRole(roles[u.uid])); } }} className="inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--text-body)' }}><Pencil className="h-3 w-3" />Change Role</button>
                            {user.providers?.includes('password') && <button type="button" onClick={() => handleResetPassword(user)} className="inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}><Key className="h-3 w-3" />Reset</button>}
                            {!isCurrent && (user.disabled ? <button type="button" onClick={() => handleDisableUser(user,false)} className="inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold" style={{ color: 'var(--leaf-600)', borderColor: 'var(--hairline)' }}><Check className="h-3 w-3" />Enable</button> : <button type="button" onClick={() => setActionModal({type:'disable',user})} className="inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold" style={{ color: 'var(--gold-600)', borderColor: 'var(--hairline)' }}><Ban className="h-3 w-3" />Disable</button>)}
                            {!isCurrent && <button type="button" onClick={() => setActionModal({type:'delete',user})} className="inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold" style={{ color: 'var(--crimson-600)', borderColor: 'rgba(203,42,42,0.3)', background: 'rgba(203,42,42,0.08)' }}><Trash2 className="h-3 w-3" />Delete</button>}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Desktop grid */}
                    <div className="users-grid hidden lg:grid lg:items-center lg:gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--hairline)' }}>
                          {user.photoURL ? <img src={user.photoURL} alt="" className="h-8 w-8 rounded-full object-cover" /> : <RoleIcon className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold leading-tight" style={{ color: 'var(--text-strong)' }}>{user.displayName || 'No name'} {isCurrent && <span className="ml-1 rounded-full px-1 py-0.5 text-[10px] font-bold align-middle" style={{ background: 'var(--ember-600)', color: '#fff' }}>You</span>}</p>
                          <p className="truncate text-xs leading-tight" style={{ color: 'var(--text-muted)' }}>{user.email || '—'}</p>
                        </div>
                      </div>
                      <div>
                        <span className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold" style={{ background: 'var(--surface-sunken)', borderColor: 'var(--hairline)', color: 'var(--text-body)' }}><RoleIcon className="h-3 w-3" />{cfg.label}</span>
                      </div>
                      <div className="tabular text-xs" style={{ color: 'var(--text-muted)' }}>{getProviderName(user.providers)}</div>
                      <div>
                        {user.emailVerified ? <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold" style={{ background: 'rgba(44,122,83,0.12)', color: 'var(--leaf-600)' }}><CircleCheck className="h-3 w-3" />Verified</span> : <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold" style={{ background: 'rgba(210,166,79,0.15)', color: 'var(--gold-600)' }}><CircleX className="h-3 w-3" />Not Verified</span>}
                      </div>
                      <div className="tabular text-xs" style={{ color: 'var(--text-muted)' }}>{formatDate(user.creationTime)}</div>
                      <div className="tabular text-xs" style={{ color: 'var(--text-muted)' }}>{user.lastSignInTime ? formatDate(user.lastSignInTime) : 'Never'}</div>
                      <div className="users-actions flex flex-nowrap items-center justify-end gap-1.5 whitespace-nowrap" style={{ whiteSpace: 'nowrap' }}>
                        <button type="button" onClick={() => { setEditingUser(user); setNewRole(normalizeRole(roles[user.uid])); }} className="inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-xs font-semibold" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--text-body)' }}><Pencil className="h-3 w-3" />Change</button>
                        {user.providers?.includes('password') && <button type="button" onClick={() => handleResetPassword(user)} className="inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-xs font-semibold" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}><Key className="h-3 w-3" />Reset</button>}
                        {!isCurrent && (user.disabled ? <button type="button" onClick={() => handleDisableUser(user,false)} className="inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-xs font-semibold" style={{ color: 'var(--leaf-600)', border: '1px solid var(--hairline)', background: 'var(--surface-card)' }}><Check className="h-3 w-3" />Enable</button> : <button type="button" onClick={() => setActionModal({type:'disable',user})} className="inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-xs font-semibold" style={{ color: 'var(--gold-600)', border: '1px solid var(--hairline)', background: 'var(--surface-card)' }}><Ban className="h-3 w-3" />Disable</button>)}
                        {!isCurrent && <button type="button" onClick={() => setActionModal({type:'delete',user})} className="inline-flex h-8 items-center justify-center whitespace-nowrap rounded-full border px-2.5 text-xs font-semibold" style={{ color: 'var(--crimson-600)', borderColor: 'rgba(203,42,42,0.3)', background: 'rgba(203,42,42,0.08)' }}><Trash2 className="h-3.5 w-3.5" /></button>}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <RoleEditorModal
        user={editingUser}
        currentRole={editingUser ? normalizeRole(roles[editingUser.uid]) : 'customer'}
        value={newRole || 'customer'}
        onChange={setNewRole}
        onCancel={cancelEditing}
        onSave={saveRole}
        saving={savingRole}
      />

      <ConfirmActionModal
        action={actionModal && actionModal.type !== 'resetSuccess' ? actionModal : null}
        onCancel={() => setActionModal(null)}
        onConfirm={() =>
          actionModal.type === 'delete'
            ? handleDeleteUser(actionModal.user)
            : handleDisableUser(actionModal.user, true)
        }
      />

      <ResetLinkModal
        action={actionModal && actionModal.type === 'resetSuccess' ? actionModal : null}
        onClose={() => setActionModal(null)}

      />
    </div>
  );
};

export default UserManagement;
