"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";
import {
  saveAccount,
  deleteAccount,
  depositOrWithdraw,
  saveTransfer,
  deleteTransfer,
  deleteCashMove,
  type ActionResult,
} from "./actions";
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

type AccountOption = { id: number; name: string };

type Account = {
  id: number;
  name: string;
  type: string;
  bankName: string | null;
  accountNumber: string | null;
  openingBalance: number;
};

const today = () => new Date().toISOString().slice(0, 10);

// ---------- Add / edit an account ----------

function AccountForm({ account, onDone }: { account?: Account; onDone: () => void }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    saveAccount.bind(null, account?.id ?? null),
    {},
  );
  const [type, setType] = useState(account?.type ?? "CASH");

  useEffect(() => {
    if (state.ok) {
      toast.success(account ? "Account updated" : "Account created");
      onDone();
    }
  }, [state, account, onDone]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={account?.name} placeholder="e.g. Cash" autoFocus />
      </div>

      <div className="space-y-2">
        <Label htmlFor="type">Type</Label>
        <select
          id="type"
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
        >
          <option value="CASH">Cash (the till)</option>
          <option value="BANK">Bank</option>
          <option value="MOBILE">Mobile banking</option>
        </select>
      </div>

      {type !== "CASH" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="bankName">
              {type === "BANK" ? "Bank name" : "Provider"}
            </Label>
            <Input id="bankName" name="bankName" defaultValue={account?.bankName ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="accountNumber">
              {type === "BANK" ? "Account number" : "Mobile number"}
            </Label>
            <Input
              id="accountNumber"
              name="accountNumber"
              defaultValue={account?.accountNumber ?? ""}
            />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="openingBalance">Opening balance</Label>
        <Input
          id="openingBalance"
          name="openingBalance"
          type="number"
          step="0.01"
          min="0"
          defaultValue={account?.openingBalance ?? 0}
        />
        <p className="text-xs text-muted-foreground">
          What the account already held before MPoS started counting. Changing it shifts
          the balance by the same amount — it is part of what the account holds, not a
          separate fact.
        </p>
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function AddAccountButton() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          Add account
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add account</DialogTitle>
        </DialogHeader>
        <AccountForm onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

export function AccountRowActions({ account }: { account: Account }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function onDelete() {
    if (!confirm(`Delete account "${account.name}"?`)) return;
    const res = await deleteAccount(account.id);
    if (res.ok) toast.success("Account deleted");
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
            <DialogTitle>Edit account</DialogTitle>
          </DialogHeader>
          <AccountForm account={account} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
      <Button variant="ghost" size="icon" aria-label="Delete" onClick={onDelete}>
        <Trash2 className="size-4 text-destructive" />
      </Button>
    </div>
  );
}

// ---------- Deposit / withdraw ----------

function CashMoveForm({
  direction,
  accounts,
  onDone,
}: {
  direction: "IN" | "OUT";
  accounts: AccountOption[];
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    depositOrWithdraw.bind(null, direction),
    {},
  );

  useEffect(() => {
    if (state.ok) {
      toast.success(direction === "IN" ? "Deposit recorded" : "Withdrawal recorded");
      onDone();
    }
  }, [state, direction, onDone]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="accountId">Account</Label>
        <select
          id="accountId"
          name="accountId"
          className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="amount">Amount</Label>
          <Input id="amount" name="amount" type="number" step="0.01" min="0" autoFocus />
        </div>
        <div className="space-y-2">
          <Label htmlFor="date">Date</Label>
          <Input id="date" name="date" type="date" defaultValue={today()} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="note">Note</Label>
        <Input
          id="note"
          name="note"
          placeholder={direction === "IN" ? "e.g. owner's capital" : "e.g. cash to the bank"}
        />
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : direction === "IN" ? "Deposit" : "Withdraw"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function CashMoveButton({
  direction,
  accounts,
}: {
  direction: "IN" | "OUT";
  accounts: AccountOption[];
}) {
  const [open, setOpen] = useState(false);
  const isIn = direction === "IN";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          {isIn ? (
            <ArrowDownToLine className="size-4" />
          ) : (
            <ArrowUpFromLine className="size-4" />
          )}
          {isIn ? "Deposit" : "Withdraw"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isIn ? "Deposit" : "Withdraw"}</DialogTitle>
          <DialogDescription>
            {isIn
              ? "Money in that belongs to no sale — the owner putting cash into the business."
              : "Money out that belongs to no expense — cash taken out of the business."}
          </DialogDescription>
        </DialogHeader>
        <CashMoveForm direction={direction} accounts={accounts} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

export function CashMoveRowAction({ id }: { id: number }) {
  const router = useRouter();
  async function onUndo() {
    if (!confirm("Undo this entry? The balance goes back to what it was.")) return;
    const res = await deleteCashMove(id);
    if (res.ok) toast.success("Undone");
    else toast.error(res.error ?? "Failed to undo");
    router.refresh();
  }
  return (
    <Button variant="ghost" size="icon" aria-label="Undo" onClick={onUndo}>
      <Trash2 className="size-4 text-destructive" />
    </Button>
  );
}

// ---------- Transfer ----------

function TransferForm({
  accounts,
  onDone,
}: {
  accounts: AccountOption[];
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    saveTransfer,
    {},
  );

  useEffect(() => {
    if (state.ok) {
      toast.success("Transfer recorded");
      onDone();
    }
  }, [state, onDone]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="fromAccountId">From</Label>
          <select
            id="fromAccountId"
            name="fromAccountId"
            defaultValue={accounts[0]?.id}
            className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="toAccountId">To</Label>
          <select
            id="toAccountId"
            name="toAccountId"
            defaultValue={accounts[1]?.id ?? accounts[0]?.id}
            className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="amount">Amount</Label>
          <Input id="amount" name="amount" type="number" step="0.01" min="0" autoFocus />
        </div>
        <div className="space-y-2">
          <Label htmlFor="date">Date</Label>
          <Input id="date" name="date" type="date" defaultValue={today()} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="note">Note</Label>
        <Input id="note" name="note" placeholder="e.g. banked the week's takings" />
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Transfer"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function TransferButton({ accounts }: { accounts: AccountOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={accounts.length < 2}>
          <ArrowLeftRight className="size-4" />
          Transfer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transfer between accounts</DialogTitle>
          <DialogDescription>
            Money leaves one account and lands in another. The shop is no richer or
            poorer — so this never touches profit.
          </DialogDescription>
        </DialogHeader>
        <TransferForm accounts={accounts} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

export function TransferRowActions({ id }: { id: number }) {
  const router = useRouter();
  async function onUndo() {
    if (!confirm("Undo this transfer? Both accounts go back to what they were.")) return;
    const res = await deleteTransfer(id);
    if (res.ok) toast.success("Transfer undone");
    else toast.error(res.error ?? "Failed to undo");
    router.refresh();
  }
  return (
    <div className="flex justify-end">
      <Button variant="ghost" size="icon" aria-label="Undo transfer" onClick={onUndo}>
        <Trash2 className="size-4 text-destructive" />
      </Button>
    </div>
  );
}
