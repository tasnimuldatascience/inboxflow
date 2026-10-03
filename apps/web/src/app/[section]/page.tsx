import { Marketing } from "../../components/marketing";
import { Auth } from "../../components/auth";
import { Experience } from "../../components/experience";
import { notFound } from "next/navigation";
export default async function Page({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (["login", "register", "recover", "reset", "invite"].includes(section))
    return <Auth mode={section} />;
  if (["experience", "preferences"].includes(section)) return <Experience />;
  if (
    [
      "examples",
      "pricing",
      "product",
      "features",
      "integrations",
      "case-studies",
      "contact",
      "privacy",
      "terms",
    ].includes(section)
  )
    return <Marketing section={section} />;
  notFound();
}
