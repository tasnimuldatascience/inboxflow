import { Dashboard } from "../../../components/dashboard";
export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  return <Dashboard route={slug || []} />;
}
