import type { ImageRef } from '@marquee/shared';
import { cn } from '../../lib/cn';
import { Crossfade } from '../ui/Crossfade';
import { ArtImage } from './ArtImage';

interface Props {
  logo: ImageRef | null;
  title: string;
  className?: string;
  /** Height of the logo box, as a CSS length. */
  height?: string;
  textClassName?: string;
}

/** The title as its localized logo, or as clean typeset text when no logo exists. */
export function TitleLogo({ logo, title, className, height = '7rem', textClassName }: Props) {
  if (logo) {
    return (
      <div
        className={cn('max-w-full', className)}
        style={{ height, width: `calc(${height} * 3.4)` }}
      >
        <ArtImage
          image={logo}
          size="w500"
          alt={title}
          fit="contain"
          eager
          className="!bg-transparent size-full [&_img]:object-[var(--logo-pos,left)] [dir=rtl]_&:[--logo-pos:right]"
        />
      </div>
    );
  }
  return (
    <h1
      className={cn(
        'font-display text-balance text-display-s sm:text-display-m',
        textClassName,
        className,
      )}
    >
      <Crossfade k={title}>{title}</Crossfade>
    </h1>
  );
}
