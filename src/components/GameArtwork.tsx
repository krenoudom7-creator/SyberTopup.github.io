import React, { useState } from 'react';
import { Gamepad2 } from 'lucide-react';

interface GameArtworkProps {
  src: string;
  alt: string;
  className?: string;
}

export const GameArtwork: React.FC<GameArtworkProps> = ({
  src,
  alt,
  className = '',
}) => {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#0f172a] via-[#131d36] to-[#1e1b4b] text-cyan-300/80 p-4 ${className}`}
        role="img"
        aria-label={alt}
      >
        <Gamepad2 className="w-10 h-10 mb-2 opacity-80" />
        <span className="text-xs font-medium text-slate-300 text-center line-clamp-2">
          {alt}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
};
