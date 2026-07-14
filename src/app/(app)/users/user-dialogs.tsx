"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  saveUser,
  deleteUser,
  saveRole,
  deleteRole,
  type ActionResult,
} from "./actions";
import { PERMISSIONS, type PermissionKey } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type RoleOption = { id: number; name: string; isAdmin: boolean };

export type UserRow = {
  id: number;
  name: string;
  username: string;
  email: string | null;
  roleId: number | null;
  isActive: boolean;
};

export type RoleRow = {
  id: number;
  name: string;
  permissions: string[];
  isAdmin: boolean;
  userCount: number;
};

const select = "h-9 w-full rounded-md border bg-transparent px-3 text-sm";

// ---------- Users ----------

function UserForm({
  user,
  roles,
  onDone,
}: {
  user?: UserRow;
  roles: RoleOption[];
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    saveUser.bind(null, user?.id ?? null),
    {},
  );

  useEffect(() => {
    if (state.ok) {
      toast.success(user ? "User updated" : "User created");
      onDone();
    }
  }, [state, user, onDone]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" defaultValue={user?.name} autoFocus />
        </div>
        <div className="space-y-2">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            name="username"
            defaultValue={user?.username}
            placeholder="what they type to sign in"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email (optional)</Label>
        <Input id="email" name="email" type="email" defaultValue={user?.email ?? ""} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="roleId">Role</Label>
        <select id="roleId" name="roleId" defaultValue={user?.roleId ?? ""} className={select}>
          <option value="" disabled>
            Choose a role…
          </option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
              {r.isAdmin ? " — all access" : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">{user ? "New password" : "Password"}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder={user ? "leave blank to keep the current one" : "at least 6 characters"}
        />
        {user && (
          <p className="text-xs text-muted-foreground">
            A blank box means <span className="font-medium">unchanged</span> — it never
            blanks the password.
          </p>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={user?.isActive ?? true}
          className="size-4"
        />
        Can sign in
      </label>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function AddUserButton({ roles }: { roles: RoleOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          Add user
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add user</DialogTitle>
        </DialogHeader>
        <UserForm roles={roles} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

export function UserRowActions({
  user,
  roles,
  isSelf,
}: {
  user: UserRow;
  roles: RoleOption[];
  isSelf: boolean;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function onDelete() {
    if (!confirm(`Delete "${user.name}"?`)) return;
    const res = await deleteUser(user.id);
    if (res.ok) toast.success("User deleted");
    else toast.error(res.error ?? "Failed to delete");
    router.refresh();
  }

  return (
    <div className="flex justify-end gap-1">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Edit">
            <Pencil className="size-4" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit user</DialogTitle>
          </DialogHeader>
          <UserForm user={user} roles={roles} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Delete"
        onClick={onDelete}
        disabled={isSelf}
        title={isSelf ? "You cannot delete your own account" : undefined}
      >
        <Trash2 className="size-4 text-destructive" />
      </Button>
    </div>
  );
}

// ---------- Roles ----------

function RoleForm({ role, onDone }: { role?: RoleRow; onDone: () => void }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    saveRole.bind(null, role?.id ?? null),
    {},
  );
  const [ticked, setTicked] = useState<Set<string>>(new Set(role?.permissions ?? []));

  useEffect(() => {
    if (state.ok) {
      toast.success(role ? "Role updated" : "Role created");
      onDone();
    }
  }, [state, role, onDone]);

  function toggle(key: PermissionKey, on: boolean) {
    setTicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="name">Role name</Label>
        <Input id="name" name="name" defaultValue={role?.name} placeholder="e.g. Manager" autoFocus />
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-sm font-medium">What this role can do</p>
          <p className="text-xs text-muted-foreground">
            Every box here is a real gate. Untick one and the app refuses it — on the
            screen and on the wire.
          </p>
        </div>

        <div className="max-h-[45vh] space-y-4 overflow-y-auto pr-1">
          {PERMISSIONS.map((group) => (
            <div key={group.group} className="rounded-lg border p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.group}
              </p>
              <div className="space-y-2">
                {group.items.map((item) => (
                  <label key={item.key} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="permissions"
                      value={item.key}
                      checked={ticked.has(item.key)}
                      onChange={(e) => toggle(item.key, e.target.checked)}
                      className="mt-0.5 size-4 shrink-0"
                    />
                    <span>
                      {item.label}
                      {item.hint && (
                        <span className="block text-xs text-muted-foreground">{item.hint}</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          {ticked.size} of{" "}
          {PERMISSIONS.reduce((n, g) => n + g.items.length, 0)} permissions ticked.
        </p>
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save role"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function AddRoleButton() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <ShieldCheck className="size-4" />
          Add role
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add role</DialogTitle>
          <DialogDescription>
            A role is a set of permissions. Give it a name a shopkeeper would use —
            &quot;Manager&quot;, &quot;Stock boy&quot; — then tick what they may do.
          </DialogDescription>
        </DialogHeader>
        <RoleForm onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

export function RoleRowActions({ role }: { role: RoleRow }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function onDelete() {
    if (!confirm(`Delete the "${role.name}" role?`)) return;
    const res = await deleteRole(role.id);
    if (res.ok) toast.success("Role deleted");
    else toast.error(res.error ?? "Failed to delete");
    router.refresh();
  }

  // The Admin role is the way back into the shop. It is not editable and not deletable
  // — offering the buttons and then refusing would just be a lie with extra steps.
  if (role.isAdmin) {
    return (
      <span className="block text-right text-xs text-muted-foreground">
        Always all access
      </span>
    );
  }

  return (
    <div className="flex justify-end gap-1">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Edit role">
            <Pencil className="size-4" />
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit role — {role.name}</DialogTitle>
            <DialogDescription>
              Changes take effect for everyone on this role on their next click. They do
              not have to sign out and in again.
            </DialogDescription>
          </DialogHeader>
          <RoleForm role={role} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
      <Button variant="ghost" size="icon" aria-label="Delete role" onClick={onDelete}>
        <Trash2 className="size-4 text-destructive" />
      </Button>
    </div>
  );
}
