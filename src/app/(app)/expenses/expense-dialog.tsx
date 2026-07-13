"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Tags } from "lucide-react";
import { toast } from "sonner";
import {
  saveExpense,
  deleteExpense,
  saveExpenseType,
  deleteExpenseType,
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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type TypeOption = { id: number; name: string; isSystem: boolean };
export type AccountOption = { id: number; name: string };

export type ExpenseRow = {
  id: number;
  date: string; // YYYY-MM-DD
  expenseTypeId: number;
  accountId: number | null;
  amount: number;
  note: string | null;
};

const today = () => new Date().toISOString().slice(0, 10);

function ExpenseForm({
  expense,
  types,
  accounts,
  onDone,
}: {
  expense?: ExpenseRow;
  types: TypeOption[];
  accounts: AccountOption[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [date, setDate] = useState(expense?.date ?? today());
  const [typeId, setTypeId] = useState<string>(
    expense ? String(expense.expenseTypeId) : "",
  );
  const [accountId, setAccountId] = useState<string>(
    expense?.accountId ? String(expense.accountId) : accounts[0] ? String(accounts[0].id) : "",
  );
  const [amount, setAmount] = useState<string>(expense ? String(expense.amount) : "");
  const [note, setNote] = useState(expense?.note ?? "");

  function onSave() {
    startTransition(async () => {
      const res = await saveExpense({
        id: expense?.id,
        date,
        expenseTypeId: Number(typeId),
        accountId: Number(accountId),
        amount: Number(amount),
        note,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(expense ? "Expense updated" : "Expense recorded");
      onDone();
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="date">Date *</Label>
          <Input
            id="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Back-date freely — it lands in that month&apos;s profit.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Type *</Label>
          <Select value={typeId} onValueChange={setTypeId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a type" />
            </SelectTrigger>
            <SelectContent>
              {types.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {types.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No types yet — add one with the Types button.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="amount">Amount *</Label>
          <Input
            id="amount"
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </div>

        <div className="space-y-2">
          <Label>Paid from *</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose an account" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            The money leaves this account when you save.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="note">Note</Label>
        <Input
          id="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="December rent"
        />
      </div>

      <DialogFooter>
        <Button onClick={onSave} disabled={pending || !typeId || !accountId || !amount}>
          {pending ? "Saving…" : expense ? "Save changes" : "Record expense"}
        </Button>
      </DialogFooter>
    </div>
  );
}

export function AddExpenseButton({
  types,
  accounts,
}: {
  types: TypeOption[];
  accounts: AccountOption[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> Add expense
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add expense</DialogTitle>
          <DialogDescription>
            Rent, electricity, wages — money out that isn&apos;t stock.
          </DialogDescription>
        </DialogHeader>
        <ExpenseForm types={types} accounts={accounts} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

export function ExpenseRowActions({
  expense,
  types,
  accounts,
}: {
  expense: ExpenseRow;
  types: TypeOption[];
  accounts: AccountOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onDelete() {
    if (!confirm("Delete this expense? The money goes back to the account.")) return;
    startTransition(async () => {
      const res = await deleteExpense(expense.id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Expense deleted");
      router.refresh();
    });
  }

  return (
    <div className="flex gap-1">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Edit expense">
            <Pencil className="size-4" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit expense</DialogTitle>
          </DialogHeader>
          <ExpenseForm
            expense={expense}
            types={types}
            accounts={accounts}
            onDone={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Button
        variant="ghost"
        size="icon"
        onClick={onDelete}
        disabled={pending}
        aria-label="Delete expense"
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

// ------------------------------------------------------------ expense types

export function ExpenseTypesButton({
  types,
}: {
  types: (TypeOption & { _count: { expenses: number } })[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  function add() {
    startTransition(async () => {
      const res = await saveExpenseType({ name });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setName("");
      toast.success("Type added");
      router.refresh();
    });
  }

  function remove(id: number) {
    startTransition(async () => {
      const res = await deleteExpenseType(id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Type deleted");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Tags className="size-4" /> Types
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Expense types</DialogTitle>
          <DialogDescription>
            What an expense is for — Space Rent, Electricity, Salary.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Space Rent"
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) add();
            }}
          />
          <Button onClick={add} disabled={pending || !name.trim()}>
            Add
          </Button>
        </div>

        <ul className="divide-y rounded-md border">
          {types.length === 0 && (
            <li className="p-3 text-sm text-muted-foreground">No types yet.</li>
          )}
          {types.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 p-3 text-sm">
              <span className="flex items-center gap-2">
                {t.name}
                {t.isSystem && (
                  <Badge variant="secondary" title="Posted automatically by the loyalty scheme">
                    Automatic
                  </Badge>
                )}
                {t._count.expenses > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {t._count.expenses} used
                  </span>
                )}
              </span>
              {!t.isSystem && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(t.id)}
                  disabled={pending}
                  aria-label={`Delete ${t.name}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
