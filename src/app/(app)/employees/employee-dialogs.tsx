"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Plus, Pencil, Trash2, Banknote } from "lucide-react";
import { toast } from "sonner";
import {
  saveEmployee,
  deleteEmployee,
  paySalary,
  deleteSalaryPayment,
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
import { MONTHS, monthEnd } from "@/lib/months";

export type EmployeeRow = {
  id: number;
  name: string;
  designation: string;
  phone: string;
  address: string | null;
  email: string | null;
  nid: string | null;
  joiningDate: string;
  monthlySalary: number;
  isActive: boolean;
};

type AccountOption = { id: number; name: string; balance: number };

const select = "h-9 w-full rounded-md border bg-transparent px-3 text-sm";

// ---------- Add / edit an employee ----------

function EmployeeForm({
  employee,
  onDone,
}: {
  employee?: EmployeeRow;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    saveEmployee.bind(null, employee?.id ?? null),
    {},
  );

  useEffect(() => {
    if (state.ok) {
      toast.success(employee ? "Employee updated" : "Employee added");
      onDone();
    }
  }, [state, employee, onDone]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" defaultValue={employee?.name} autoFocus />
        </div>
        <div className="space-y-2">
          <Label htmlFor="designation">Designation</Label>
          <Input
            id="designation"
            name="designation"
            defaultValue={employee?.designation}
            placeholder="e.g. Sales Executive"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" defaultValue={employee?.phone} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="joiningDate">Joining date</Label>
          <Input
            id="joiningDate"
            name="joiningDate"
            type="date"
            defaultValue={employee?.joiningDate}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="address">Address</Label>
        <Input id="address" name="address" defaultValue={employee?.address ?? ""} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="email">Email (optional)</Label>
          <Input id="email" name="email" defaultValue={employee?.email ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="nid">NID (optional)</Label>
          <Input id="nid" name="nid" defaultValue={employee?.nid ?? ""} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="monthlySalary">Monthly salary</Label>
        <Input
          id="monthlySalary"
          name="monthlySalary"
          type="number"
          step="0.01"
          min="0"
          defaultValue={employee?.monthlySalary ?? ""}
        />
        <p className="text-xs text-muted-foreground">
          What they are owed each month. The salary sheet works out what is still due
          from this and what has been paid — it is never stored twice.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={employee?.isActive ?? true}
          className="size-4"
        />
        Still working here
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

export function AddEmployeeButton() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          Add employee
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add employee</DialogTitle>
        </DialogHeader>
        <EmployeeForm onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

export function EmployeeRowActions({ employee }: { employee: EmployeeRow }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function onDelete() {
    if (!confirm(`Delete "${employee.name}"?`)) return;
    const res = await deleteEmployee(employee.id);
    if (res.ok) toast.success("Employee deleted");
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
            <DialogTitle>Edit employee</DialogTitle>
          </DialogHeader>
          <EmployeeForm employee={employee} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
      <Button variant="ghost" size="icon" aria-label="Delete" onClick={onDelete}>
        <Trash2 className="size-4 text-destructive" />
      </Button>
    </div>
  );
}

// ---------- Paying wages ----------

function PayForm({
  employee,
  month,
  year,
  due,
  accounts,
  onDone,
}: {
  employee: { id: number; name: string };
  month: number;
  year: number;
  due: number;
  accounts: AccountOption[];
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    paySalary,
    {},
  );
  const [amount, setAmount] = useState(due.toFixed(2));

  useEffect(() => {
    if (state.ok) {
      toast.success("Salary paid");
      onDone();
    }
  }, [state, onDone]);

  const short = due - Number(amount || 0);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="employeeId" value={employee.id} />
      <input type="hidden" name="month" value={month} />
      <input type="hidden" name="year" value={year} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="amount">Amount</Label>
          <Input
            id="amount"
            name="amount"
            type="number"
            step="0.01"
            min="0"
            max={due}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="date">Date</Label>
          <Input
            id="date"
            name="date"
            type="date"
            defaultValue={monthEnd(month, year)}
          />
        </div>
      </div>

      {short > 0.005 && (
        <p className="text-xs text-muted-foreground">
          {short.toFixed(2)} of {MONTHS[month - 1]}&apos;s wages stays due — pay the rest
          whenever it suits, and the sheet will keep the balance.
        </p>
      )}

      <div className="space-y-2">
        <Label htmlFor="accountId">Paid from</Label>
        <select id="accountId" name="accountId" className={select}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} — {a.balance.toFixed(2)}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="note">Note (optional)</Label>
        <Input id="note" name="note" placeholder="e.g. advance against this month" />
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {pending ? "Paying…" : "Pay"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function PaySalaryButton({
  employee,
  month,
  year,
  due,
  accounts,
}: {
  employee: { id: number; name: string };
  month: number;
  year: number;
  due: number;
  accounts: AccountOption[];
  }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={due <= 0.005 || accounts.length === 0}>
          <Banknote className="size-4" />
          Pay
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Pay {employee.name} — {MONTHS[month - 1]} {year}
          </DialogTitle>
          <DialogDescription>
            The money leaves the account you choose and lands in the books as a Salary
            expense, so it shows up in the month&apos;s profit on its own.
          </DialogDescription>
        </DialogHeader>
        <PayForm
          employee={employee}
          month={month}
          year={year}
          due={due}
          accounts={accounts}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

export function UndoSalaryButton({ id }: { id: number }) {
  const router = useRouter();
  async function onUndo() {
    if (
      !confirm(
        "Undo this payment? The money goes back into the account and the expense is removed.",
      )
    )
      return;
    const res = await deleteSalaryPayment(id);
    if (res.ok) toast.success("Payment undone");
    else toast.error(res.error ?? "Failed to undo");
    router.refresh();
  }
  return (
    <Button variant="ghost" size="icon" aria-label="Undo payment" onClick={onUndo}>
      <Trash2 className="size-4 text-destructive" />
    </Button>
  );
}

// ---------- Which month the sheet is showing ----------

export function MonthPicker({ month, year }: { month: number; year: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function go(next: { month?: number; year?: number }) {
    const q = new URLSearchParams(params.toString());
    q.set("month", String(next.month ?? month));
    q.set("year", String(next.year ?? year));
    router.push(`${pathname}?${q.toString()}`);
  }

  const thisYear = new Date().getFullYear();
  const years = [thisYear - 2, thisYear - 1, thisYear, thisYear + 1];

  return (
    <div className="flex gap-2">
      <select
        aria-label="Month"
        className={select}
        value={month}
        onChange={(e) => go({ month: Number(e.target.value) })}
      >
        {MONTHS.map((m, i) => (
          <option key={m} value={i + 1}>
            {m}
          </option>
        ))}
      </select>
      <select
        aria-label="Year"
        className={select}
        value={year}
        onChange={(e) => go({ year: Number(e.target.value) })}
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}
