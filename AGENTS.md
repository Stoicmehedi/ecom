<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Session protocol

**Read [`PROJECT_STATUS.md`](./PROJECT_STATUS.md) first, before touching anything.** It is the
single source of truth for what is built, what is pending, and where to resume. Do not start work —
not even a one-line bug fix — without reading it.

**Update it after every completed task,** in the same turn the work lands:
- append what changed to §4 Progress log (under today's date),
- refresh §5 Current state,
- re-point §6 Next steps.

The project must stay fully understandable from any machine or account, using only what is
committed to the repo.

# Module build protocol

Do not invent a module's shape and wait to be corrected. Before writing code for a new module:

1. **Study the reference app's equivalent module first** (see private notes for how to reach it;
   drive it with Playwright). Walk every screen and every field. Record: which fields exist, which
   are **mandatory** vs optional, the validation rules, the exact workflow, and what saving does
   downstream (stock movements, ledgers, payments).

   > **STRICTLY READ-ONLY.** The reference account holds real production business data. Never
   > create, edit, or delete a record there, and never submit a form. We examine; we build our own.
   >
   > **Read existing records, not new ones.** To learn a form's fields, open the **edit page of a
   > record that already exists** — every field is right there, at zero risk. That is the default and
   > it is almost always sufficient.
   >
   > **Never click a button on a create form.** Not "Save", and *not* "Next", "Continue", or
   > "Save & Continue" either. A multi-step wizard can **persist step 1 when you click "Next"** —
   > this has already happened once (2026-07-11: a product was created in the live account and had to
   > be deleted). A button that looks like navigation is not evidence that it is. You may open a
   > create form and *read* it; you may not type into it and you may not click through it.
   >
   > If some field is genuinely only visible mid-wizard, **stop and ask the user** — do not click.
2. **Write it up in [`BLUEPRINT.md`](./BLUEPRINT.md)** as that module's requirements list, in our
   own words, before implementing.
3. **Check `BLUEPRINT.md` §6** for any open decision this module touches and settle it with the
   user now, not upfront.
4. **Build against the blueprint.**

We copy the *process* — the domain logic, the fields, the rules. We never copy the *interface*.
Our UI is original and stays original; consolidating their multi-page flows into better screens is
expected and encouraged.

# Hard rules

1. **Original UI, always.** Never imitate the layout, theme, or branding of any existing commercial
   POS product.
2. **Clean repo.** Never commit third-party screenshots, logos, copy, code, or data — and never
   name the reference product in a committed file. Local reference material stays local and
   git-ignored.
3. **Never delete the user's local files** without an explicit instruction to do so.
