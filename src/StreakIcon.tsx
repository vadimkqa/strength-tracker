import { type StreakLevel, levelFor } from './streak';
import { artworkFor, artworkUrl, secretArtwork, type AchievementArtwork } from './streak-artwork';
export function AchievementImage({
  artwork,
  className = '',
}: {
  artwork: AchievementArtwork;
  className?: string;
}) {
  return (
    <img
      className={`streak-icon ${className}`}
      src={artworkUrl(artwork)}
      alt={artwork.name}
      decoding="async"
      draggable={false}
    />
  );
}
export function StreakIcon({
  level = levelFor(0),
  className = '',
}: {
  level?: StreakLevel;
  className?: string;
}) {
  return <AchievementImage artwork={artworkFor(level)} className={className} />;
}
export function SecretStreakIcon({ longest }: { longest: number }) {
  return <AchievementImage artwork={secretArtwork(longest)} className="secret-streak-icon" />;
}
