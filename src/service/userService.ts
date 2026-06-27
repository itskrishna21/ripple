import { FirebaseAuthError } from "firebase-admin/auth";
import { UserExistsError } from "../http/errors";
import { pool } from "../lib/db";
import { getFirebaseAuth } from "../lib/firebase";
import { SignupInput } from "../schema/signup";

export { UserExistsError };

export type Company = {
  id: string;
  name: string;
};

export type User = {
  id: string;
  companyId: string;
  firebaseUid: string;
  email: string;
  role: string;
};

type CompanyRow = {
  id: string;
  name: string;
};

type UserRow = {
  id: string;
  company_id: string;
  firebase_uid: string;
  email: string;
  role: string;
};

function rowToCompany(row: CompanyRow): Company {
  return {
    id: row.id,
    name: row.name,
  };
}

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    companyId: row.company_id,
    firebaseUid: row.firebase_uid,
    email: row.email,
    role: row.role,
  };
}

export async function getUserByFirebaseUid(
  firebaseUid: string,
): Promise<User | null> {
  const result = await pool.query<UserRow>(
    `
      SELECT id, company_id, firebase_uid, email, role
      FROM users
      WHERE firebase_uid = $1
    `,
    [firebaseUid],
  );

  const row = result.rows[0];
  return row ? rowToUser(row) : null;
}

export async function getCompanyById(id: string): Promise<Company | null> {
  const result = await pool.query<CompanyRow>(
    "SELECT id, name FROM companies WHERE id = $1",
    [id],
  );

  const row = result.rows[0];
  return row ? rowToCompany(row) : null;
}

export async function signup(
  input: SignupInput,
): Promise<{ user: User; company: Company }> {
  let firebaseUid: string | undefined;

  try {
    const firebaseUser = await getFirebaseAuth().createUser({
      email: input.email,
      password: input.password,
    });

    firebaseUid = firebaseUser.uid;

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const companyResult = await client.query<CompanyRow>(
        "INSERT INTO companies (name) VALUES ($1) RETURNING id, name",
        [input.companyName],
      );

      const companyRow = companyResult.rows[0];
      if (!companyRow) {
        throw new Error("Failed to create company");
      }

      const userResult = await client.query<UserRow>(
        `
          INSERT INTO users (company_id, firebase_uid, email, role)
          VALUES ($1, $2, $3, 'owner')
          RETURNING id, company_id, firebase_uid, email, role
        `,
        [companyRow.id, firebaseUser.uid, input.email],
      );

      const userRow = userResult.rows[0];
      if (!userRow) {
        throw new Error("Failed to create user");
      }

      await client.query("COMMIT");

      return {
        user: rowToUser(userRow),
        company: rowToCompany(companyRow),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    if (firebaseUid) {
      await getFirebaseAuth().deleteUser(firebaseUid).catch(() => undefined);
    }

    if (error instanceof FirebaseAuthError && error.code === "auth/email-already-exists") {
      throw new UserExistsError();
    }

    throw error;
  }
}

export function toPublicUser(user: User): {
  id: string;
  email: string;
  role: string;
  companyId: string;
} {
  return {
    id: user.firebaseUid,
    email: user.email,
    role: user.role,
    companyId: user.companyId,
  };
}
