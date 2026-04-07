import { Poppins } from "next/font/google";

const poppins = Poppins({ weight: "600", subsets: ["latin"], display: "swap" });

interface LogoProps {
  size?: number;
  dotColor?: string;
}

// Proportions derived empirically: at 52px wordmark, period char at 172px Poppins
// matches lowercase x-height. Dot diameter ≈ 46% of wordmark size.
// Gap ≈ 5% of wordmark size.
export default function Logo({ size = 52, dotColor = "#2A7A72" }: LogoProps) {
  const dotSize = size * 0.46;
  const gap = size * 0.05;

  return (
    <span
      className={poppins.className}
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        fontWeight: 600,
        fontSize: size,
        lineHeight: 1,
      }}
    >
      Roundtable
      <span
        style={{
          display: "inline-block",
          width: dotSize,
          height: dotSize,
          borderRadius: "50%",
          backgroundColor: dotColor,
          marginLeft: gap,
          flexShrink: 0,
        }}
      />
    </span>
  );
}
