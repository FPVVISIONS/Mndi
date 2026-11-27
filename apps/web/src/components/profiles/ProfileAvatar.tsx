import type { Profile } from '@marquee/shared';
import { Bird, Cat, Clapperboard, Dog, Flame, Gamepad2, Ghost, Moon, Popcorn, Rocket, Smile, Star, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';

export const AVATARS: Record<string, LucideIcon> = {
  clapperboard: Clapperboard, popcorn: Popcorn, rocket: Rocket, cat: Cat, dog: Dog, bird: Bird,
  ghost: Ghost, flame: Flame, moon: Moon, star: Star, gamepad: Gamepad2, smile: Smile,
};

export const PROFILE_COLORS = ['#E8913A', '#4FA3A5', '#B9D464', '#E26D5A', '#6F9BD1', '#D8C3A5'];

interface Props {
  profile: Pick<Profile, 'color' | 'avatar' | 'name'>;
  className?: string;
  iconSize?: number;
}

/** A rounded tile in the profile colour with its icon. Used from the nav bar up to the picker. */
export function ProfileAvatar({ profile, className, iconSize }: Props) {
  const Icon = AVATARS[profile.avatar] ?? Smile;
  return (
    <span
      className={cn('grid place-items-center rounded-md text-bg', className)}
      style={{ backgroundColor: profile.color }}
      aria-hidden
    >
      <Icon size={iconSize ?? 18} strokeWidth={2} />
    </span>
  );
}
