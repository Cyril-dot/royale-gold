import { ALL_GAMES } from "../../../lib/games";
import RoomPage from "../../../components/games/RoomPage";

export function generateStaticParams() {
  return ALL_GAMES.map((g) => ({ slug: g.slug }));
}

export default async function GameRoomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <RoomPage slug={slug} />;
}
