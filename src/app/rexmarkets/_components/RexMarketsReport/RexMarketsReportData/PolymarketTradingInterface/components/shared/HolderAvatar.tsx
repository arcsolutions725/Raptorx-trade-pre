"use client";

import { useState } from "react";

type HolderAvatarProps = {
  profileImage?: string;
  name: string;
  size?: number;
};

export default function HolderAvatar({
  profileImage,
  name,
  size = 32,
}: HolderAvatarProps) {
  const [imageError, setImageError] = useState(false);

  // Calculate font size based on avatar size (roughly 1/3 of the size)
  const fontSize = Math.max(10, Math.floor(size / 3));

  if (!profileImage || imageError) {
    return (
      <div 
        className="rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex-shrink-0 flex items-center justify-center text-white font-semibold"
        style={{ 
          width: `${size}px`, 
          height: `${size}px`,
          fontSize: `${fontSize}px`
        }}
      >
        {name.charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={profileImage}
      alt={name}
      className="rounded-full object-cover flex-shrink-0"
      style={{ width: `${size}px`, height: `${size}px` }}
      onError={() => setImageError(true)}
    />
  );
}

