/**
 * Firestore security rules test suite.
 *
 * These assertions encode the access model in firestore.rules. They are the
 * only way to *prove* the rules rather than reason about them — rules are
 * declarative and easy to get subtly wrong, especially `list`, which Firestore
 * evaluates against the query's constraints rather than against documents.
 *
 * Requires the Firebase emulator, which needs Java installed.
 *
 *   npm install --save-dev @firebase/rules-unit-testing firebase-tools vitest
 *   npx firebase emulators:exec --only firestore "npx vitest run tests/"
 */

import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where } from 'firebase/firestore';

const PROJECT_ID = 'crackers-rules-test';

let testEnv;

/** A signed-in context whose role document says `role`. */
const asRole = async (uid, role, email) => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'roles', uid), { role });
  });
  return testEnv.authenticatedContext(uid, email ? { email } : undefined).firestore();
};

const seedOrder = async (id, data) => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'orders', id), {
      customer: { name: 'A', phone: '9876543210', email: 'a@example.com' },
      userId: 'owner-uid',
      total: 1000,
      status: 'Pending',
      ...data,
    });
  });
};

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe('orders — enumeration is the main risk', () => {
  it('lets a customer list only their own orders by userId', async () => {
    await seedOrder('o1', { userId: 'me' });
    const db = testEnv.authenticatedContext('me').firestore();

    await assertSucceeds(getDocs(query(collection(db, 'orders'), where('userId', '==', 'me'))));
  });

  it('lets a customer list their own orders by email', async () => {
    await seedOrder('o1', { customer: { email: 'me@example.com', name: 'A', phone: '1' } });
    const db = testEnv.authenticatedContext('me', { email: 'me@example.com' }).firestore();

    await assertSucceeds(
      getDocs(query(collection(db, 'orders'), where('customer.email', '==', 'me@example.com')))
    );
  });

  it('BLOCKS a signed-in customer from listing the whole orders collection', async () => {
    await seedOrder('o1', {});
    const db = testEnv.authenticatedContext('nosy').firestore();

    await assertFails(getDocs(collection(db, 'orders')));
  });

  it("BLOCKS a customer from listing another customer's orders", async () => {
    await seedOrder('o1', { userId: 'someone-else' });
    const db = testEnv.authenticatedContext('me').firestore();

    await assertFails(
      getDocs(query(collection(db, 'orders'), where('userId', '==', 'someone-else')))
    );
  });

  it('BLOCKS an anonymous visitor from listing orders', async () => {
    await seedOrder('o1', {});
    const db = testEnv.unauthenticatedContext().firestore();

    await assertFails(getDocs(collection(db, 'orders')));
  });

  for (const role of ['admin', 'sales']) {
    it(`lets ${role} list all orders`, async () => {
      await seedOrder('o1', {});
      const db = await asRole(`${role}-uid`, role);

      await assertSucceeds(getDocs(collection(db, 'orders')));
    });
  }

  it('BLOCKS a legacy (no-longer-valid) role from listing orders', async () => {
    await seedOrder('o1', {});
    const db = await asRole('legacy-uid', 'packer');

    await assertFails(getDocs(collection(db, 'orders')));
  });

  it('still allows a direct get so guest order tracking keeps working', async () => {
    await seedOrder('o1', {});
    const db = testEnv.unauthenticatedContext().firestore();

    await assertSucceeds(getDoc(doc(db, 'orders', 'o1')));
  });

  it('lets a customer cancel their own order but not change it otherwise', async () => {
    await seedOrder('o1', { userId: 'me' });
    const db = testEnv.authenticatedContext('me').firestore();

    await assertSucceeds(updateDoc(doc(db, 'orders', 'o1'), { status: 'Cancelled' }));
    await assertFails(updateDoc(doc(db, 'orders', 'o1'), { status: 'Delivered' }));
    await assertFails(updateDoc(doc(db, 'orders', 'o1'), { total: 1 }));
  });

  it("BLOCKS a customer cancelling someone else's order", async () => {
    await seedOrder('o1', { userId: 'someone-else', customer: { email: 'other@example.com', name: 'B', phone: '2' } });
    const db = testEnv.authenticatedContext('me', { email: 'me@example.com' }).firestore();

    await assertFails(updateDoc(doc(db, 'orders', 'o1'), { status: 'Cancelled' }));
  });

  it('BLOCKS deletion by anyone who is not an admin', async () => {
    await seedOrder('o1', {});
    const staff = await asRole('sales-uid', 'sales');

    await assertFails(deleteDoc(doc(staff, 'orders', 'o1')));
  });
});

describe('roles — privilege escalation', () => {
  it('BLOCKS a customer promoting themselves to admin', async () => {
    const db = testEnv.authenticatedContext('me').firestore();

    await assertFails(setDoc(doc(db, 'roles', 'me'), { role: 'admin' }));
  });

  it('allows a new user to create their own customer role only', async () => {
    const db = testEnv.authenticatedContext('me').firestore();

    await assertSucceeds(setDoc(doc(db, 'roles', 'me'), { role: 'customer' }));
  });

  it("BLOCKS writing another user's role", async () => {
    const db = testEnv.authenticatedContext('me').firestore();

    await assertFails(setDoc(doc(db, 'roles', 'victim'), { role: 'customer' }));
  });

  it('BLOCKS a customer listing every role', async () => {
    const db = testEnv.authenticatedContext('me').firestore();

    await assertFails(getDocs(collection(db, 'roles')));
  });

  it('lets a user read their own role', async () => {
    const db = await asRole('me', 'customer');

    await assertSucceeds(getDoc(doc(db, 'roles', 'me')));
  });
});

describe('users — profile privacy', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'victim'), {
        name: 'Victim',
        email: 'victim@example.com',
        phone: '9999999999',
      });
    });
  });

  it("BLOCKS reading another user's profile", async () => {
    const db = testEnv.authenticatedContext('me').firestore();

    await assertFails(getDoc(doc(db, 'users', 'victim')));
  });

  it('BLOCKS listing all users as a customer', async () => {
    const db = testEnv.authenticatedContext('me').firestore();

    await assertFails(getDocs(collection(db, 'users')));
  });

  it('lets a user read and write their own profile', async () => {
    const db = testEnv.authenticatedContext('victim').firestore();

    await assertSucceeds(getDoc(doc(db, 'users', 'victim')));
    await assertSucceeds(setDoc(doc(db, 'users', 'victim'), { name: 'New' }, { merge: true }));
  });

  it('lets an admin list users', async () => {
    const db = await asRole('admin-uid', 'admin');

    await assertSucceeds(getDocs(collection(db, 'users')));
  });
});

describe('trackingCodes — the map must not be readable at all', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'trackingCodes', 'CH1042'), { orderId: 'o1' });
    });
  });

  /* Codes are sequential now, so a readable code -> orderId map is an oracle:
     walk CH01, CH02, ... collect the unguessable order auto-IDs, and read
     the orders through the public `orders.get`, skipping the phone-digit check
     in POST /api/orders/track. Guest tracking goes through that endpoint, which
     reads with the Admin SDK and is not governed by these rules. */
  it('BLOCKS a guest reading a code it already knows', async () => {
    const db = testEnv.unauthenticatedContext().firestore();

    await assertFails(getDoc(doc(db, 'trackingCodes', 'CH1042')));
  });

  it('BLOCKS a signed-in customer reading a code', async () => {
    const db = testEnv.authenticatedContext('me').firestore();

    await assertFails(getDoc(doc(db, 'trackingCodes', 'CH1042')));
  });

  it('lets staff resolve a code', async () => {
    const db = await asRole('sales-uid', 'sales');

    await assertSucceeds(getDoc(doc(db, 'trackingCodes', 'CH1042')));
  });

  it('BLOCKS listing the whole code-to-order map', async () => {
    const db = testEnv.authenticatedContext('me').firestore();

    await assertFails(getDocs(collection(db, 'trackingCodes')));
  });
});

describe('content collections stay admin-write', () => {
  for (const path of ['products', 'heroSettings', 'bannerSettings', 'adminSettings', 'promotionalBanners']) {
    it(`BLOCKS a customer writing ${path}`, async () => {
      const db = testEnv.authenticatedContext('me').firestore();

      await assertFails(setDoc(doc(db, path, 'x'), { tampered: true }));
    });
  }

  it('BLOCKS a sales user writing products', async () => {
    const db = await asRole('sales-uid', 'sales');

    await assertFails(setDoc(doc(db, 'products', 'p1'), { name: 'x' }));
  });

  it('BLOCKS a legacy role writing products', async () => {
    const db = await asRole('packer-uid', 'packer');

    await assertFails(setDoc(doc(db, 'products', 'p1'), { name: 'x' }));
  });
});
