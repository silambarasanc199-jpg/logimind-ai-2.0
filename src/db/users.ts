import { db } from './index.ts';
import { users } from './schema.ts';

export async function getOrCreateUser(
  uid: string,
  email: string,
  name?: string,
  role?: string,
  facility?: string
) {
  try {
    const updateSet: {
      email: string;
      name?: string;
      role?: string;
      facility?: string;
    } = { email };

    if (name) updateSet.name = name;
    if (role) updateSet.role = role;
    if (facility) updateSet.facility = facility;

    const result = await db
      .insert(users)
      .values({
        uid,
        email,
        name: name || 'Elena Rostova',
        role: role || 'Logistics Dispatcher',
        facility: facility || 'Chicago Central Dispatch Hub',
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: updateSet,
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database query failed in getOrCreateUser:', error);
    throw new Error('Database query failed. Please try again later.', {
      cause: error,
    });
  }
}

export async function getUsers() {
  try {
    return await db.select().from(users);
  } catch (error) {
    console.error('Database query failed in getUsers:', error);
    throw new Error('Database query failed. Please try again later.', {
      cause: error,
    });
  }
}
