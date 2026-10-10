import type { Metadata } from "next";
import { LegalPage } from "@/components/site/LegalPage";
import { FREE_PROJECT_LIMIT, PRICES } from "@/lib/plans";
import "../landing.css";

export const metadata: Metadata = { title: "Terms of service", alternates: { canonical: "/terms" } };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of service" updated="October 10, 2026">
      <p>These terms cover your use of HingeLab, a web app that generates cutting files for laser-cut boxes. By using HingeLab you agree to them.</p>

      <h2>Your designs</h2>
      <p>The boxes you design and the files you export are yours. You may cut, sell and share the physical objects and the files without crediting HingeLab. Free exports carry a small “Made with HingeLab” engrave mark on a separate layer, which you may switch off in your laser software.</p>

      <h2>Accounts</h2>
      <p>You can use the editor without an account. If you create one, keep your password private; you are responsible for activity on your account. You may delete your projects at any time.</p>

      <h2>Plans and payment</h2>
      <p>The Free plan includes up to {FREE_PROJECT_LIMIT} cloud projects and Rounded boxes with the Straight hinge. Pro costs ${PRICES.monthly} per month or ${PRICES.yearly} per year, billed in advance by our payment processor, Stripe. Pro renews automatically until you cancel. You can cancel at any time from Billing; Pro then stays active until the end of the period you paid for. Prices may change with at least 30 days’ notice before your next renewal.</p>

      <h2>Safety and results</h2>
      <p>Laser cutters are dangerous machines. Never leave a running laser unattended and follow your machine’s safety instructions. Bend analysis is an estimate, not a guarantee: wood varies, so cut the bend test strip before cutting a full box. HingeLab is provided “as is”, and we are not liable for wasted material, damage to machines or injuries resulting from its use, to the extent the law allows.</p>

      <h2>Fair use</h2>
      <p>Do not attack, overload or reverse-engineer the service, or use it to break the law. We may suspend accounts that do.</p>

      <h2>Changes</h2>
      <p>We may update these terms. If a change matters, we will tell signed-in users before it takes effect.</p>
    </LegalPage>
  );
}
