import Image from "next/image";

type VietSageBrandProps = {
  className?: string;
  markClassName?: string;
  priority?: boolean;
  variant?: "lockup" | "mark" | "wordmark";
  wordmarkClassName?: string;
};

export function VietSageBrand({
  className = "",
  markClassName = "h-10 w-10",
  priority = false,
  variant = "lockup",
  wordmarkClassName = "h-8 w-auto",
}: Readonly<VietSageBrandProps>) {
  return (
    <span
      role="img"
      aria-label="VietSage"
      className={`inline-flex items-center justify-center bg-white ${className}`}
    >
      {variant !== "wordmark" ? (
        <Image
          src="/brand/vietsage-mark-white.png"
          alt=""
          width={977}
          height={1021}
          priority={priority}
          className={`shrink-0 object-contain ${markClassName}`}
        />
      ) : null}

      {variant !== "mark" ? (
        <Image
          src="/brand/vietsage-wordmark-white.png"
          alt=""
          width={1855}
          height={258}
          priority={priority}
          className={`object-contain ${wordmarkClassName}`}
        />
      ) : null}
    </span>
  );
}
