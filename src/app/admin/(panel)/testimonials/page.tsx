import { AdminHeader } from "@/components/admin/AdminShell";
import { TestimonialsManager } from "@/components/admin/TestimonialsManager";
import { getTestimonials } from "@/lib/content";
import { hasDb } from "@/db";

export const dynamic = "force-dynamic";

export default async function TestimonialsAdmin() {
  const items = await getTestimonials(false);
  return (
    <>
      <AdminHeader
        title="Testimonials"
        description="Client testimonials shown on the home page. Hidden ones never appear on the site."
      />
      <div className="p-8">
        <TestimonialsManager initial={items} dbEnabled={hasDb} />
      </div>
    </>
  );
}
