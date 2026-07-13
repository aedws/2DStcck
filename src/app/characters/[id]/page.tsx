import { getCompanyDefinitions } from "@/data/stocks";
import { CharacterDetailClient } from "./CharacterDetailClient";

// 정적 export: 캐릭터가 있는 회사 상세 페이지를 빌드 시 생성
export function generateStaticParams() {
  return getCompanyDefinitions()
    .filter((c) => c.ceoId)
    .map((c) => ({ id: c.id }));
}

export const dynamicParams = false;

export default async function CharacterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CharacterDetailClient id={id} />;
}
