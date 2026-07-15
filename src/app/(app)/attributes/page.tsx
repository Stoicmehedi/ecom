import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { CatalogTabs } from "@/components/app/catalog-tabs";
import {
  AddAxisButton,
  AddColorButton,
  AddValueButton,
  AxisRowActions,
  ColorChip,
  ValueChip,
} from "./axis-dialogs";

export default async function AttributesPage() {
  const session = await auth();
  if (!hasPermission(session, "products.masters")) redirect("/dashboard");
  const [axes, colors] = await Promise.all([
    prisma.attributeCategory.findMany({
      orderBy: { name: "asc" },
      include: {
        attributes: { orderBy: [{ sortIndex: "asc" }, { id: "asc" }] },
        _count: { select: { products: true } },
      },
    }),
    prisma.color.findMany({ orderBy: [{ sortIndex: "asc" }, { name: "asc" }] }),
  ]);

  const plainAxes = axes.map((a) => ({ id: a.id, name: a.name }));

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <PageHeader
        eyebrow="Catalogue"
        title="Attributes & colours"
        description="The axes a product varies along. Cross them to generate its variants."
      />
      <CatalogTabs />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium">Axes</h2>
            <p className="text-sm text-muted-foreground">
              An axis is a dimension like Size or Fit; its values are what a variant can be.
            </p>
          </div>
          <AddAxisButton />
        </div>

        {axes.length === 0 ? (
          <Empty>
            No axes yet. Add one — <span className="font-medium">Size</span> is the usual
            first.
          </Empty>
        ) : (
          <div className="space-y-3">
            {axes.map((axis) => (
              <div key={axis.id} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{axis.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {axis.attributes.length} value
                      {axis.attributes.length === 1 ? "" : "s"}
                      {axis._count.products > 0 &&
                        ` · used by ${axis._count.products} product${axis._count.products === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  <AxisRowActions axis={{ id: axis.id, name: axis.name }} />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {axis.attributes.map((v) => (
                    <ValueChip
                      key={v.id}
                      value={{
                        id: v.id,
                        name: v.name,
                        attributeCategoryId: v.attributeCategoryId,
                      }}
                      axes={plainAxes}
                    />
                  ))}
                  <AddValueButton
                    axes={plainAxes}
                    defaultAxisId={axis.id}
                    label={axis.attributes.length === 0 ? "Add the first value" : "Add value"}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium">Colours</h2>
            <p className="text-sm text-muted-foreground">
              Colour is its own axis — it crosses with the one above to make the grid.
            </p>
          </div>
          <AddColorButton />
        </div>

        <div className="rounded-lg border p-4">
          {colors.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No colours yet. A product without colours just varies along its axis.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {colors.map((c) => (
                <ColorChip key={c.id} color={{ id: c.id, name: c.name, hex: c.hex }} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
