"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requirePermission } from "@/lib/guard";
import { isPermissionKey } from "@/lib/permissions";

export type ActionResult = { ok?: boolean; error?: string; id?: number };

const ADMIN_ALL = "*";

/** The signed-in user's own id — the one account they must not be able to lock out. */
async function currentUserId(): Promise<number | null> {
  const session = await auth();
  const id = session?.user?.id;
  return id ? Number(id) : null;
}

/**
 * How many admins are left standing.
 *
 * An "admin" here is anyone whose role can still reach this screen — `users.manage`,
 * whether by `["*"]` or by an explicit tick. Count only the **active** ones: a
 * deactivated admin cannot log in to undo a mistake, so they are no safety net.
 */
async function activeAdminCount(excludeUserId?: number): Promise<number> {
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: { role: { select: { permissions: true } } },
  });
  return users.filter(
    (u) =>
      u.role?.permissions.includes(ADMIN_ALL) ||
      u.role?.permissions.includes("users.manage"),
  ).length;
}

// ---------- Users ----------

const userSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(60)
    .regex(/^[a-zA-Z0-9._-]+$/, "Letters, numbers, dot, dash and underscore only"),
  email: z.string().trim().email("That is not a valid email").max(150).optional().or(z.literal("")),
  roleId: z.coerce.number().int().positive("Choose a role"),
  isActive: z.boolean(),
  // Blank on an edit means "leave the password alone" — never "blank the password".
  password: z.string().optional(),
});

export async function saveUser(
  id: number | null,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const denied = await requirePermission("users.manage");
  if (denied) return { error: denied };

  const parsed = userSchema.safeParse({
    name: formData.get("name"),
    username: formData.get("username"),
    email: formData.get("email") || "",
    roleId: formData.get("roleId"),
    isActive: formData.get("isActive") === "on",
    password: (formData.get("password") as string) || "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const u = parsed.data;

  const password = (u.password ?? "").trim();
  if (!id && password.length < 6) {
    return { error: "A new user needs a password of at least 6 characters." };
  }
  if (id && password && password.length < 6) {
    return { error: "A password must be at least 6 characters." };
  }

  const me = await currentUserId();

  // You may not lock yourself out of the shop.
  if (id && id === me) {
    if (!u.isActive) return { error: "You cannot deactivate your own account." };

    const role = await prisma.role.findUnique({
      where: { id: u.roleId },
      select: { permissions: true },
    });
    const stillAdmin =
      role?.permissions.includes(ADMIN_ALL) || role?.permissions.includes("users.manage");
    if (!stillAdmin) {
      return {
        error: "You cannot move yourself to a role that cannot manage users — you would lock yourself out.",
      };
    }
  }

  // Nor may you remove the last way back in.
  if (id) {
    const target = await prisma.user.findUnique({
      where: { id },
      select: { isActive: true, role: { select: { permissions: true } } },
    });
    const wasAdmin =
      target?.role?.permissions.includes(ADMIN_ALL) ||
      target?.role?.permissions.includes("users.manage");
    const newRole = await prisma.role.findUnique({
      where: { id: u.roleId },
      select: { permissions: true },
    });
    const willBeAdmin =
      (newRole?.permissions.includes(ADMIN_ALL) ||
        newRole?.permissions.includes("users.manage")) &&
      u.isActive;

    if (target?.isActive && wasAdmin && !willBeAdmin && (await activeAdminCount(id)) === 0) {
      return {
        error: "This is the last account that can manage users. Give someone else that role first.",
      };
    }
  }

  const data = {
    name: u.name,
    username: u.username,
    email: u.email ? u.email : null,
    roleId: u.roleId,
    isActive: u.isActive,
    ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}),
  };

  try {
    if (id) {
      await prisma.user.update({ where: { id }, data });
    } else {
      const branch = await prisma.branch.findFirst({ select: { id: true } });
      await prisma.user.create({
        data: { ...data, passwordHash: await bcrypt.hash(password, 10), branchId: branch?.id ?? null },
      });
    }
  } catch (e) {
    const msg = String(e);
    if (msg.includes("Unique") && msg.includes("username")) {
      return { error: `The username "${u.username}" is already taken.` };
    }
    if (msg.includes("Unique") && msg.includes("email")) {
      return { error: "That email is already on another account." };
    }
    return { error: "Something went wrong saving the user." };
  }

  revalidatePath("/users");
  return { ok: true };
}

export async function deleteUser(id: number): Promise<ActionResult> {
  const denied = await requirePermission("users.manage");
  if (denied) return { error: denied };

  const me = await currentUserId();
  if (id === me) return { error: "You cannot delete your own account." };

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      name: true,
      isActive: true,
      role: { select: { permissions: true } },
      _count: {
        select: {
          salesSold: true,
          expenses: true,
          adjustments: true,
          salariesPaid: true,
          heldSales: true,
        },
      },
    },
  });
  if (!user) return { error: "That user no longer exists." };

  const isAdmin =
    user.role?.permissions.includes(ADMIN_ALL) ||
    user.role?.permissions.includes("users.manage");
  if (user.isActive && isAdmin && (await activeAdminCount(id)) === 0) {
    return { error: "This is the last account that can manage users. It cannot be deleted." };
  }

  // Their name is on documents. Deleting them would orphan the audit trail — the same
  // reasoning as an employee who has been paid (§24).
  const c = user._count;
  const worked = c.salesSold + c.expenses + c.adjustments + c.salariesPaid + c.heldSales;
  if (worked > 0) {
    return {
      error: `${user.name} has ${worked} document(s) to their name. Deactivate them instead — deleting would orphan the record of who did what.`,
    };
  }

  try {
    await prisma.user.delete({ where: { id } });
  } catch {
    return { error: "Failed to delete the user." };
  }
  revalidatePath("/users");
  return { ok: true };
}

// ---------- Roles ----------

const roleSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
});

export async function saveRole(
  id: number | null,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const denied = await requirePermission("users.manage");
  if (denied) return { error: denied };

  const parsed = roleSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // Only keys from the catalogue are permissions. Anything else the browser sends is
  // dropped on the floor — a role must not be able to hold a key no gate enforces,
  // which is the whole rule this module exists to keep (§25.2).
  const submitted = formData.getAll("permissions").map(String);
  const permissions = submitted.filter(isPermissionKey);

  if (id) {
    const existing = await prisma.role.findUnique({
      where: { id },
      select: { permissions: true, name: true },
    });
    if (!existing) return { error: "That role no longer exists." };

    // The Admin role is the way back in. It is not editable, by anyone, ever.
    if (existing.permissions.includes(ADMIN_ALL)) {
      return { error: "The Admin role holds every permission and cannot be edited." };
    }
  }

  try {
    if (id) {
      await prisma.role.update({ where: { id }, data: { name: parsed.data.name, permissions } });
    } else {
      await prisma.role.create({ data: { name: parsed.data.name, permissions } });
    }
  } catch (e) {
    if (String(e).includes("Unique")) {
      return { error: `A role called "${parsed.data.name}" already exists.` };
    }
    return { error: "Something went wrong saving the role." };
  }

  revalidatePath("/users");
  return { ok: true };
}

export async function deleteRole(id: number): Promise<ActionResult> {
  const denied = await requirePermission("users.manage");
  if (denied) return { error: denied };

  const role = await prisma.role.findUnique({
    where: { id },
    select: { name: true, permissions: true, _count: { select: { users: true } } },
  });
  if (!role) return { error: "That role no longer exists." };

  if (role.permissions.includes(ADMIN_ALL)) {
    return { error: "The Admin role cannot be deleted — it is the way back into the shop." };
  }
  if (role._count.users > 0) {
    return {
      error: `${role._count.users} user(s) are on the ${role.name} role. Move them off it first.`,
    };
  }

  try {
    await prisma.role.delete({ where: { id } });
  } catch {
    return { error: "Failed to delete the role." };
  }
  revalidatePath("/users");
  return { ok: true };
}
