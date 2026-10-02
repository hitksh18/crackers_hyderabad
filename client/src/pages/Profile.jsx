import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import {
  UserRound,
  Mail,
  Phone,
  ShieldCheck,
  Pencil,
  Save,
  X,
  Loader2,
  ClipboardList,
  LogIn,
} from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import Seo from '../components/Seo';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import toast from '../utils/toast';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { revealVariants, staggerParent } from '../lib/motion';
import { CornerFiligree } from '../components/ui/Ornaments';
import EmptyState from '../components/ui/EmptyState';
import GoogleMark from '../components/ui/GoogleMark';
import UserAvatar from '../components/UserAvatar';

/** One read-only field row. Icon is decorative; the label carries the meaning. */
const FieldRow = ({ icon: Icon, label, children }) => (
  <div className="flex items-start gap-4">
    <span
      aria-hidden="true"
      className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
      style={{ background: 'var(--surface-sunken)', border: '1px solid var(--hairline)' }}
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} style={{ color: 'var(--gold-600)' }} />
    </span>
    <div className="min-w-0 flex-1">
      <p className="label-caps">{label}</p>
      <div className="mt-1.5">{children}</div>
    </div>
  </div>
);

const Profile = () => {
  const { user, isAdmin, isSales, isBilling, isPacker, isMod, linkWithGoogle } = useAuth();
  const [editing, setEditing] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const reduced = useReducedMotion();

  const loadUserProfile = useCallback(async () => {
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        setPhoneNumber(data.phoneNumber || '');
        setDisplayName(data.displayName || user.displayName || '');
      } else {
        setDisplayName(user.displayName || '');
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadUserProfile();
    }
  }, [user, loadUserProfile]);

  const handleSaveProfile = async () => {
    setLoading(true);
    try {
      await setDoc(doc(db, 'users', user.uid), {
        phoneNumber,
        displayName,
        email: user.email,
        updatedAt: new Date()
      }, { merge: true });

      toast.success('Profile updated successfully!');
      setEditing(false);
    } catch (error) {
      console.error('Error saving profile:', error);
      toast.error('Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
    <div className="min-h-screen" style={{ background: 'var(--surface-page)' }}>
      <Seo title="My Profile | Crackers Hyderabad" noindex />
        <div className="shell-narrow section-pad-sm">
          <EmptyState
            icon={LogIn}
            title="Please login to view your profile"
            description="Sign in to see your account details, saved contact number and order history."
            action={
              <Link to="/login" className="btn-primary">
                <LogIn className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                Go to Login
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  const roleLabel = isAdmin
    ? 'Administrator'
    : isSales
      ? 'Sales'
      : isBilling
        ? 'Billing'
        : isPacker
          ? 'Packer'
          : isMod
            ? 'Moderator'
            : 'Customer';

  const isGoogleLinked = Boolean(user.providerData?.some((p) => p.providerId === 'google.com'));

  return (
    <div className="min-h-screen" style={{ background: 'var(--surface-page)' }}>
      <div className="shell-narrow section-pad-sm">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={staggerParent(reduced, 0.07)}
          className="space-y-6"
        >
          {/* ---------------- Identity header ---------------- */}
          <motion.section variants={revealVariants(reduced, 18)} className="panel-editorial glass-card">
            <div
              className="relative h-32 sm:h-36"
              style={{ background: 'var(--grad-maroon)' }}
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    'radial-gradient(58% 88% at 84% 14%, rgba(210, 166, 79, 0.26) 0%, transparent 100%)',
                }}
              />
              <CornerFiligree position="top-right" />
            </div>

            <div className="px-5 pb-7 sm:px-8">
              <div className="-mt-12 flex flex-col gap-5 sm:-mt-14 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex min-w-0 items-end gap-4">
                  <UserAvatar
                    user={user}
                    className="h-[6.5rem] w-[6.5rem]"
                    initialsSize={30}
                    style={{
                      border: '4px solid var(--surface-card)',
                      boxShadow: 'var(--shadow-md)',
                    }}
                  />

                  <div className="min-w-0 pb-1">
                    <p className="label-caps">My account</p>
                    <h1 className="subsection-title mt-1 truncate">
                      {displayName || user.email?.split('@')[0] || 'My Profile'}
                    </h1>
                  </div>
                </div>

                {!editing ? (
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="btn-outline w-full sm:w-auto"
                  >
                    <Pencil className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                    Edit Profile
                  </button>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleSaveProfile}
                      disabled={loading}
                      aria-busy={loading}
                      className="btn-primary flex-1 sm:flex-none"
                    >
                      {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} aria-hidden="true" />
                      ) : (
                        <Save className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                      )}
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(false);
                        loadUserProfile();
                      }}
                      className="btn-outline flex-1 sm:flex-none"
                    >
                      <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2">
                <span className={`badge ${isAdmin ? 'badge-gold' : 'badge-neutral'}`}>
                  <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                  {roleLabel}
                </span>
                {isGoogleLinked && (
                  <span className="badge badge-neutral">
                    <GoogleMark className="h-3 w-3" />
                    Google linked
                  </span>
                )}
              </div>
            </div>
          </motion.section>

          {/* ---------------- Account information ---------------- */}
          <motion.section variants={revealVariants(reduced, 18)} className="card-premium glass-card p-5 sm:p-8">
            <h2 className="subsection-title">Account Information</h2>
            <hr className="rule-gold mt-3" />

            <div className="mt-7 space-y-7">
              {editing && (
                <FieldRow icon={UserRound} label="Display Name">
                  <label htmlFor="profile-display-name" className="sr-only">
                    Display Name
                  </label>
                  <input
                    id="profile-display-name"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Enter your name"
                    className="input-premium"
                  />
                </FieldRow>
              )}

              <FieldRow icon={Mail} label="Email Address">
                <p className="break-words font-semibold" style={{ color: 'var(--text-strong)' }}>
                  {user.email}
                </p>
                {user.providerData?.[0]?.providerId === 'google.com' && (
                  <p className="mt-1 text-xs" style={{ color: 'var(--text-subtle)' }}>
                    From Google Account
                  </p>
                )}
              </FieldRow>

              <FieldRow icon={Phone} label="Mobile Number">
                {editing ? (
                  <>
                    <label htmlFor="profile-phone" className="sr-only">
                      Mobile Number
                    </label>
                    <input
                      id="profile-phone"
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="+91 1234567890"
                      className="input-premium"
                    />
                  </>
                ) : (
                  <p className="tabular font-semibold" style={{ color: 'var(--text-strong)' }}>
                    {phoneNumber || (
                      <span className="italic font-normal" style={{ color: 'var(--text-subtle)' }}>
                        Not provided
                      </span>
                    )}
                  </p>
                )}
              </FieldRow>

              <FieldRow icon={ShieldCheck} label="Account Role">
                <p className="font-semibold" style={{ color: 'var(--text-strong)' }}>
                  {roleLabel}
                </p>
              </FieldRow>
            </div>

            {!isGoogleLinked && (
              <div
                className="mt-8 rounded-2xl p-5 sm:p-6"
                style={{ background: 'var(--surface-sunken)', border: '1px solid var(--hairline)' }}
              >
                <h3 className="card-title flex items-center gap-2.5">
                  <GoogleMark className="h-[18px] w-[18px]" />
                  Link Google Account
                </h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  Connect your Google account to access your profile information and easily sign in.
                </p>
                <button type="button" onClick={linkWithGoogle} className="btn-outline mt-5 w-full sm:w-auto">
                  <GoogleMark />
                  Link with Google
                </button>
              </div>
            )}
          </motion.section>

          {/* ---------------- Orders shortcut ---------------- */}
          <motion.section variants={revealVariants(reduced, 18)} className="card-premium glass-card p-5 sm:p-8">
            <h2 className="subsection-title">Your Orders</h2>
            <hr className="rule-gold mt-3" />
            <p className="mt-4 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Review past orders, download invoices and check the current status of anything on its way.
            </p>
            <Link to="/my-orders" className="btn-outline mt-5 w-full sm:w-auto">
              <ClipboardList className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              Go to My Orders
            </Link>
          </motion.section>

        </motion.div>
      </div>
    </div>
  );
};

export default Profile;
