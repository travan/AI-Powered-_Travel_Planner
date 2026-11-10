import Image from "next/image";
import React from "react";
import coHorizonMark from "./co-horizon-mark.svg";

export function CoHorizonLogo({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex w-fit items-center gap-[0.28em] whitespace-nowrap font-headline font-extrabold tracking-[-0.04em] ${className}`}
    >
      <Image
        src={coHorizonMark}
        alt=""
        width={64}
        height={64}
        unoptimized
        className="size-[1.35em] shrink-0"
      />
      CoHorizon
    </span>
  );
}
