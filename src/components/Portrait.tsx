import { useState } from "react";

/** Square portrait; hides itself if the image can't be loaded (and shows again when `src` changes). */
export function Portrait({
  src,
  size = 40,
  alt,
  round,
  onBroken,
}: {
  src?: string;
  size?: number;
  alt?: string;
  round?: boolean;
  onBroken?: (src: string) => void;
}) {
  const [brokenSrc, setBrokenSrc] = useState<string>();
  if (!src || brokenSrc === src) return null;
  return (
    <img
      className={`portrait ${round ? "round" : ""}`}
      src={src}
      alt={alt ?? ""}
      width={size}
      height={size}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => {
        setBrokenSrc(src);
        onBroken?.(src);
      }}
    />
  );
}
