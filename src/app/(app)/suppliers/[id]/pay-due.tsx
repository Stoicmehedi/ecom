"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Wallet } from "lucide-react";
import { toast } from "sonner";
import { paySupplierDue, type ActionState } from "../actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "MOBILE", label: "Mobile banking" },
  { value: "CARD", label: "Card" },
  { value: "BANK", label: "Bank transfer" },
  { value: "CHEQUE", label: "Cheque" },
];

export function PayDueButton({
  supplierId,
  due,
  accounts,
}: {
  supplierId: number;
  due: number;
  accounts: { id: number; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    paySupplierDue.bind(null, supplierId),
    {},
  );

  useEffect(() => {
    if (state.ok) {
      toast.success("Payment recorded");
      setOpen(false);
      router.refresh();
    }
  }, [state, router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={due <= 0}>
          <Wallet className="size-4" />
          Pay due
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pay supplier due</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Amount (outstanding: {due.toFixed(2)})</Label>
            <Input
              id="amount"
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              max={due}
              defaultValue={due}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="method">Method</Label>
              <select
                id="method"
                name="method"
                defaultValue="CASH"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
              >
                {METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="accountId">Account</Label>
              <select
                id="accountId"
                name="accountId"
                defaultValue={accounts[0]?.id}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="note">Note</Label>
            <Input id="note" name="note" placeholder="Optional" />
          </div>
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Record payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
